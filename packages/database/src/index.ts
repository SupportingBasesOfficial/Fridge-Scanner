import { Pool, type PoolClient } from 'pg';
import {
  HouseholdId,
  HouseholdMembershipId,
  HouseholdUnauthorizedError,
  PrincipalId,
  type ReadinessProbe,
  type ReadinessResult,
  type TransactionHandle,
  type TransactionManager,
} from '@fridge/application';

const RUNTIME_CAPABILITY_ROLES = new Set([
  'fridge_app',
  'fridge_worker',
  'fridge_readonly',
] as const);

export type RuntimeDatabaseCapabilityRole =
  | 'fridge_app'
  | 'fridge_worker'
  | 'fridge_readonly';

class PgTransactionHandle implements TransactionHandle {
  readonly kind = 'fridge-transaction' as const;

  constructor(
    readonly client: PoolClient,
    readonly principalId: PrincipalId,
    readonly householdId: HouseholdId,
    readonly membershipId: HouseholdMembershipId,
    readonly householdRoleCode: string,
  ) {}
}

export class HouseholdAuthorizationError extends HouseholdUnauthorizedError {
  constructor() {
    super();
    this.name = 'HouseholdAuthorizationError';
  }
}

export interface PgDatabaseOptions {
  readonly connectionString: string;
  readonly capabilityRole: RuntimeDatabaseCapabilityRole;
  readonly maxConnections?: number;
}

export class PgDatabase implements TransactionManager, ReadinessProbe {
  readonly #pool: Pool;
  readonly #capabilityRole: RuntimeDatabaseCapabilityRole;

  constructor(options: PgDatabaseOptions) {
    if (!RUNTIME_CAPABILITY_ROLES.has(options.capabilityRole)) {
      throw new TypeError('database capability role is not allowed for runtime use');
    }

    this.#capabilityRole = options.capabilityRole;
    this.#pool = new Pool({
      connectionString: options.connectionString,
      max: options.maxConnections ?? 10,
      allowExitOnIdle: false,
    });
  }

  async withAuthorizedHouseholdTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (transaction: TransactionHandle) => Promise<T>,
  ): Promise<T> {
    // Re-validate at this capability boundary without inventing adapter-local UUID rules.
    // This protects JavaScript callers and deliberately forged TypeScript casts.
    const verifiedPrincipalId = PrincipalId(principalId);
    const verifiedHouseholdId = HouseholdId(householdId);

    const client = await this.#pool.connect();
    let transactionStarted = false;

    try {
      await client.query('begin');
      transactionStarted = true;

      // Capability roles are validated against a closed runtime allowlist, so the
      // identifier interpolation below cannot be influenced by arbitrary input.
      await client.query(`set local role ${this.#capabilityRole}`);

      // The candidate context only narrows forced RLS enough to inspect membership
      // for this Household. It is not authority and no caller callback runs yet.
      await client.query(
        "select set_config('fridge.household_id', $1, true)",
        [verifiedHouseholdId],
      );

      const authorization = await client.query<{
        membership_id: string;
        role_code: string;
      }>(
        `select membership_id::text, role_code
           from fridge.household_membership
          where household_id = $1::uuid
            and user_id = $2::uuid
            and lifecycle_status = 'ACTIVE'
            and effective_from <= statement_timestamp()
            and (effective_to is null or effective_to > statement_timestamp())
          order by effective_from desc, membership_id
          limit 1`,
        [verifiedHouseholdId, verifiedPrincipalId],
      );
      const authorizationRow = authorization.rows[0];
      if (authorizationRow === undefined) {
        throw new HouseholdAuthorizationError();
      }

      const membershipId = HouseholdMembershipId(authorizationRow.membership_id);
      const result = await operation(
        new PgTransactionHandle(
          client,
          verifiedPrincipalId,
          verifiedHouseholdId,
          membershipId,
          authorizationRow.role_code,
        ),
      );
      await client.query('commit');
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('rollback');
        } catch {
          // Preserve the original failure. A broken connection is discarded by pg.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async check(): Promise<ReadinessResult> {
    const client = await this.#pool.connect().catch(() => null);
    if (client === null) {
      return { ready: false, reason: 'database_unavailable' };
    }

    let transactionStarted = false;
    try {
      await client.query('begin');
      transactionStarted = true;
      await client.query(`set local role ${this.#capabilityRole}`);
      await client.query('select 1');
      await client.query('rollback');
      transactionStarted = false;
      return { ready: true };
    } catch {
      if (transactionStarted) {
        await client.query('rollback').catch(() => undefined);
      }
      return { ready: false, reason: 'database_unavailable' };
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}

export function requirePgClient(transaction: TransactionHandle): PoolClient {
  if (!(transaction instanceof PgTransactionHandle)) {
    throw new TypeError('transaction handle was not created by PgDatabase');
  }

  return transaction.client;
}
