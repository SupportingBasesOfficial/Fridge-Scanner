import { Pool, type PoolClient } from 'pg';
import {
  HouseholdId,
  HouseholdMembershipId,
  HouseholdUnauthorizedError,
  PrincipalId,
  type HouseholdProfileReader,
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
const EXTERNAL_AUTHORITY_MAX_LENGTH = 512;
const EXTERNAL_SUBJECT_MAX_LENGTH = 1024;

export type RuntimeDatabaseCapabilityRole =
  | 'fridge_app'
  | 'fridge_worker'
  | 'fridge_readonly';

export interface ExternalIdentityKey {
  readonly authority: string;
  readonly subject: string;
}

function requireExactExternalIdentityComponent(
  value: string,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`);
  }
  if (value.length === 0 || value.trim().length === 0) {
    throw new TypeError(`${label} must not be blank`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${label} must not contain surrounding whitespace`);
  }
  if (value.length > maxLength) {
    throw new TypeError(`${label} exceeds maximum length`);
  }
  return value;
}

class PgTransactionHandle {
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

export class ExternalIdentityMappingError extends Error {
  constructor() {
    super('external identity mapping failed');
    this.name = 'ExternalIdentityMappingError';
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

  async resolvePrincipalForExternalIdentity(
    authority: string,
    subject: string,
  ): Promise<PrincipalId | null> {
    if (this.#capabilityRole !== 'fridge_app') {
      throw new TypeError('external identity resolution requires fridge_app capability');
    }

    const exactAuthority = requireExactExternalIdentityComponent(
      authority,
      'external identity authority',
      EXTERNAL_AUTHORITY_MAX_LENGTH,
    );
    const exactSubject = requireExactExternalIdentityComponent(
      subject,
      'external identity subject',
      EXTERNAL_SUBJECT_MAX_LENGTH,
    );
    const client = await this.#pool.connect();
    let transactionStarted = false;

    try {
      await client.query('begin');
      transactionStarted = true;
      await client.query('set local role fridge_app');

      const result = await client.query<{ user_id: string }>(
        `select user_id::text
           from fridge.external_identity_link
          where authority = $1
            and subject = $2
            and revoked_at is null
          order by external_identity_link_id
          limit 2`,
        [exactAuthority, exactSubject],
      );

      await client.query('commit');
      transactionStarted = false;

      if (result.rows.length !== 1) {
        return null;
      }

      return PrincipalId(result.rows[0]!.user_id);
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

  async withAuthorizedHouseholdTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (transaction: TransactionHandle) => Promise<T>,
  ): Promise<T> {
    const verifiedPrincipalId = PrincipalId(principalId);
    const verifiedHouseholdId = HouseholdId(householdId);

    const client = await this.#pool.connect();
    let transactionStarted = false;

    try {
      await client.query('begin');
      transactionStarted = true;
      await client.query(`set local role ${this.#capabilityRole}`);
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
      const verifiedTransaction = new PgTransactionHandle(
        client,
        verifiedPrincipalId,
        verifiedHouseholdId,
        membershipId,
        authorizationRow.role_code,
      );

      const result = await operation(verifiedTransaction as unknown as TransactionHandle);
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

export class PgExternalIdentityPrincipalMapper {
  constructor(private readonly database: PgDatabase) {}

  async resolve(identity: ExternalIdentityKey): Promise<PrincipalId> {
    const principal = await this.database.resolvePrincipalForExternalIdentity(
      identity.authority,
      identity.subject,
    );
    if (principal === null) {
      throw new ExternalIdentityMappingError();
    }
    return principal;
  }
}

export class PgHouseholdProfileReader implements HouseholdProfileReader {
  async readDisplayName(transaction: TransactionHandle): Promise<string | null> {
    const client = requirePgClient(transaction);
    const result = await client.query<{ display_name: string }>(
      `select display_name
         from fridge.household
        where household_id = $1::uuid`,
      [transaction.householdId],
    );

    return result.rows[0]?.display_name ?? null;
  }
}

export function requirePgClient(transaction: TransactionHandle): PoolClient {
  if (!(transaction instanceof PgTransactionHandle)) {
    throw new TypeError('transaction handle was not created by PgDatabase');
  }

  return transaction.client;
}
