import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool, type PoolClient } from 'pg';
import {
  DependencyUnavailableError,
  HOUSEHOLD_PROCUREMENT_ADMINISTRATION_CAPABILITY,
  HouseholdId,
  InvalidInputError,
  PrincipalId,
  type TransactionManager,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for procurement administration integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for procurement administration integration tests');
}

const HOUSEHOLD = HouseholdId('b6060101-0b06-4c01-8b06-000000000001');
const PROCUREMENT_ADMIN = PrincipalId('b6060202-0b06-4c02-8b06-000000000002');
const OTHER_ADMIN = PrincipalId('b6060303-0b06-4c03-8b06-000000000003');
const EXPIRING_ADMIN = PrincipalId('b6060606-0b06-4c06-8b06-000000000006');
const PROCUREMENT_MEMBERSHIP = 'b6060404-0b06-4c04-8b06-000000000004';
const OTHER_MEMBERSHIP = 'b6060505-0b06-4c05-8b06-000000000005';
const EXPIRING_MEMBERSHIP = 'b6060707-0b06-4c07-8b06-000000000007';
const PROCUREMENT_ROLE = 'BE06_PROCUREMENT_ADMIN';
const OTHER_ROLE = 'BE06_CATALOG_STORAGE_ONLY';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values
         ($1::uuid, 'BE06 Procurement Admin'),
         ($2::uuid, 'BE06 Catalog Storage Admin')`,
      [PROCUREMENT_ADMIN, OTHER_ADMIN],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 Procurement Authority Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values
         ($1, 'BE06 procurement administrator'),
         ($2, 'BE06 catalog and storage administrator')`,
      [PROCUREMENT_ROLE, OTHER_ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values
         ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER'),
         ($2, 'HOUSEHOLD_CATALOG_ADMINISTER'),
         ($2, 'HOUSEHOLD_STORAGE_ADMINISTER')`,
      [PROCUREMENT_ROLE, OTHER_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, $6, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, $7, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [
        PROCUREMENT_MEMBERSHIP,
        OTHER_MEMBERSHIP,
        HOUSEHOLD,
        PROCUREMENT_ADMIN,
        OTHER_ADMIN,
        PROCUREMENT_ROLE,
        OTHER_ROLE,
      ],
    );
  } finally {
    await pool.end();
  }
}

async function waitForProcurementAuthorityLockWait(
  pool: Pool,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const observed = await pool.query<{ blocked: boolean }>(
      `select exists (
         select 1
           from pg_stat_activity
          where pid <> pg_backend_pid()
            and wait_event_type = 'Lock'
            and query ~ 'acquire_household_procurement_admin_authority\\('
       ) as blocked`,
    );
    if (observed.rows[0]?.blocked === true) return;
    await delay(25);
  }
  throw new Error('procurement authority acquisition did not reach the expected governance lock wait');
}

async function releaseLock(client: PoolClient): Promise<void> {
  try {
    await client.query('rollback');
  } finally {
    client.release();
  }
}

await seedFixture();

test('Household procurement authority materializes only for exact current capability mapping', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdProcurementAdministrationTransactionManager(database);
  try {
    const observed = await manager.withHouseholdProcurementAdministrationTransaction(
      PROCUREMENT_ADMIN,
      HOUSEHOLD,
      async (transaction) => ({
        principalId: transaction.principalId,
        householdId: transaction.householdId,
        roleCode: transaction.householdRoleCode,
        capability: transaction.procurementAdministrationCapability,
      }),
    );
    assert.equal(observed.principalId, PROCUREMENT_ADMIN);
    assert.equal(observed.householdId, HOUSEHOLD);
    assert.equal(observed.roleCode, PROCUREMENT_ROLE);
    assert.equal(observed.capability, HOUSEHOLD_PROCUREMENT_ADMINISTRATION_CAPABILITY);
  } finally {
    await database.close();
  }
});

test('catalog and storage administration together do not imply procurement administration', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdProcurementAdministrationTransactionManager(database);
  try {
    await assert.rejects(
      manager.withHouseholdProcurementAdministrationTransaction(
        OTHER_ADMIN,
        HOUSEHOLD,
        async () => 'must-not-run',
      ),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});

test('procurement authority samples membership time after governance lock waits', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 3 });
  const lockClient = await adminPool.connect();
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdProcurementAdministrationTransactionManager(database);
  let lockReleased = false;
  try {
    await adminPool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 Expiring Procurement Admin')`,
      [EXPIRING_ADMIN],
    );
    const inserted = await adminPool.query<{ effective_to: Date }>(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4,
         'ACTIVE', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '3 seconds'
       ) returning effective_to`,
      [EXPIRING_MEMBERSHIP, HOUSEHOLD, EXPIRING_ADMIN, PROCUREMENT_ROLE],
    );
    const effectiveTo = inserted.rows[0]?.effective_to;
    assert.ok(effectiveTo instanceof Date);

    await lockClient.query('begin');
    await lockClient.query(
      `select capability_code
         from fridge.household_capability
        where capability_code = 'HOUSEHOLD_PROCUREMENT_ADMINISTER'
        for update`,
    );

    let operationCalled = false;
    const attempt = manager.withHouseholdProcurementAdministrationTransaction(
      EXPIRING_ADMIN,
      HOUSEHOLD,
      async () => {
        operationCalled = true;
        return 'must-not-run';
      },
    );
    await waitForProcurementAuthorityLockWait(adminPool);
    const remainingMs = Math.max(0, effectiveTo.getTime() - Date.now());
    await delay(remainingMs + 150);
    await lockClient.query('commit');
    lockReleased = true;
    lockClient.release();

    await assert.rejects(attempt, HouseholdAuthorizationError);
    assert.equal(operationCalled, false);
  } finally {
    if (!lockReleased) await releaseLock(lockClient);
    await database.close();
    await adminPool.end();
  }
});

test('provider-neutral application errors raised by procurement operations are preserved', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdProcurementAdministrationTransactionManager(database);
  const expected = new InvalidInputError('intent-specific validation failure');
  try {
    await assert.rejects(
      manager.withHouseholdProcurementAdministrationTransaction(
        PROCUREMENT_ADMIN,
        HOUSEHOLD,
        async () => { throw expected; },
      ),
      (error: unknown) => error === expected,
    );
  } finally {
    await database.close();
  }
});

test('delegated transaction bootstrap failures remain provider-neutral', async () => {
  const rawFailure = Object.assign(new Error('connection lost before callback'), { code: '08006' });
  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction<T>(): Promise<T> { throw rawFailure; },
  };
  const manager = new PgHouseholdProcurementAdministrationTransactionManager(transactions);
  await assert.rejects(
    manager.withHouseholdProcurementAdministrationTransaction(
      PROCUREMENT_ADMIN,
      HOUSEHOLD,
      async () => 'must-not-run',
    ),
    (error: unknown) =>
      error instanceof DependencyUnavailableError && error.cause === rawFailure,
  );
});

test('revoked procurement capability mapping is revalidated at acquisition time', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdProcurementAdministrationTransactionManager(database);
  try {
    await adminPool.query(
      `delete from fridge.household_role_capability
        where role_code = $1
          and capability_code = 'HOUSEHOLD_PROCUREMENT_ADMINISTER'`,
      [PROCUREMENT_ROLE],
    );
    await assert.rejects(
      manager.withHouseholdProcurementAdministrationTransaction(
        PROCUREMENT_ADMIN,
        HOUSEHOLD,
        async () => 'must-not-run',
      ),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
    await adminPool.end();
  }
});
