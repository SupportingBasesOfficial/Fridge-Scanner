import { Pool, type PoolClient } from 'pg';
import type {
  HouseholdId,
  ReadinessProbe,
  ReadinessResult,
  TransactionHandle,
  TransactionManager,
} from '@fridge/application';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

  constructor(readonly client: PoolClient) {}
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

  async withHouseholdTransaction<T>(
    householdId: HouseholdId,
    operation: (transaction: TransactionHandle) => Promise<T>,
  ): Promise<T> {
    if (!UUID_PATTERN.test(householdId)) {
      throw new TypeError('householdId must be a canonical UUID string');
    }

    const client = await this.#pool.connect();
    let transactionStarted = false;

    try {
      await client.query('begin');
      transactionStarted = true;

      // Capability roles are validated against a closed runtime allowlist, so the
      // identifier interpolation below cannot be influenced by arbitrary input.
      // SET LOCAL ROLE resets automatically at transaction end.
      await client.query(`set local role ${this.#capabilityRole}`);

      // Transaction-local by construction: the context cannot leak through the pool
      // after COMMIT/ROLLBACK and is subordinate to backend authorization.
      await client.query(
        "select set_config('fridge.household_id', $1, true)",
        [householdId],
      );

      const result = await operation(new PgTransactionHandle(client));
      await client.query('commit');
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('rollback');
        } catch {
          // Preserve the original failure. Pool release below discards lifecycle ownership;
          // connection-level failure is surfaced by subsequent readiness checks.
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
