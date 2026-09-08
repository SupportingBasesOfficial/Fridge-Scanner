import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool, type PoolClient } from 'pg';
import {
  DependencyUnavailableError,
  HOUSEHOLD_CATALOG_ADMINISTRATION_CAPABILITY,
  HouseholdId,
  InvalidInputError,
  PrincipalId,
  type TransactionManager,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for catalog administration integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for catalog administration integration tests');
}

const HOUSEHOLD = HouseholdId('c5a40101-0b05-4c01-8b05-000000000001');
const CATALOG_ADMIN = PrincipalId('c5a40202-0b05-4c02-8b05-000000000002');
const STORAGE_ONLY = PrincipalId('c5a40303-0b05-4c03-8b05-000000000003');
const EXPIRING_ADMIN = PrincipalId('c5a40606-0b05-4c06-8b05-000000000006');
const CATALOG_MEMBERSHIP = 'c5a40404-0b05-4c04-8b05-000000000004';
const STORAGE_MEMBERSHIP = 'c5a40505-0b05-4c05-8b05-000000000005';
const EXPIRING_MEMBERSHIP = 'c5a40707-0b05-4c07-8b05-000000000007';
const CATALOG_ROLE = 'BE05_CATALOG_ADMIN';
const STORAGE_ROLE = 'BE05_STORAGE_ONLY';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Catalog Admin'), ($2::uuid, 'BE05 Storage Only')`,
      [CATALOG_ADMIN, STORAGE_ONLY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 Catalog Authority Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE05 catalog administrator'), ($2, 'BE05 storage-only member')`,
      [CATALOG_ROLE, STORAGE_ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values
         ($1, 'HOUSEHOLD_CATALOG_ADMINISTER'),
         ($2, 'HOUSEHOLD_STORAGE_ADMINISTER')`,
      [CATALOG_ROLE, STORAGE_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, $6, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, $7, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [
        CATALOG_MEMBERSHIP,
        STORAGE_MEMBERSHIP,
        HOUSEHOLD,
        CATALOG_ADMIN,
        STORAGE_ONLY,
        CATALOG_ROLE,
        STORAGE_ROLE,
      ],
    );
  } finally {
    await pool.end();
  }
}

async function waitForCatalogAuthorityLockWait(
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
            and query ~ 'acquire_household_catalog_admin_authority\\('
       ) as blocked`,
    );

    if (observed.rows[0]?.blocked === true) {
      return;
    }

    await delay(25);
  }

  throw new Error('catalog authority acquisition did not reach the expected governance lock wait');
}

async function releaseLock(client: PoolClient): Promise<void> {
  try {
    await client.query('rollback');
  } finally {
    client.release();
  }
}

await seedFixture();

test('Household catalog authority materializes only for exact current capability mapping', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdCatalogAdministrationTransactionManager(database);

  try {
    const observed = await manager.withHouseholdCatalogAdministrationTransaction(
      CATALOG_ADMIN,
      HOUSEHOLD,
      async (transaction) => ({
        principalId: transaction.principalId,
        householdId: transaction.householdId,
        roleCode: transaction.householdRoleCode,
        capability: transaction.catalogAdministrationCapability,
      }),
    );

    assert.equal(observed.principalId, CATALOG_ADMIN);
    assert.equal(observed.householdId, HOUSEHOLD);
    assert.equal(observed.roleCode, CATALOG_ROLE);
    assert.equal(observed.capability, HOUSEHOLD_CATALOG_ADMINISTRATION_CAPABILITY);
  } finally {
    await database.close();
  }
});

test('storage administration capability does not imply Household catalog administration', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdCatalogAdministrationTransactionManager(database);

  try {
    await assert.rejects(
      manager.withHouseholdCatalogAdministrationTransaction(
        STORAGE_ONLY,
        HOUSEHOLD,
        async () => 'must-not-run',
      ),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});

test('catalog authority samples membership time after governance lock waits', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 3 });
  const lockClient = await adminPool.connect();
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdCatalogAdministrationTransactionManager(database);
  let lockReleased = false;

  try {
    await adminPool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Expiring Catalog Admin')`,
      [EXPIRING_ADMIN],
    );

    const inserted = await adminPool.query<{ effective_to: Date }>(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4,
         'ACTIVE', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '4 seconds'
       )
       returning effective_to`,
      [EXPIRING_MEMBERSHIP, HOUSEHOLD, EXPIRING_ADMIN, CATALOG_ROLE],
    );
    const effectiveTo = inserted.rows[0]?.effective_to;
    assert.ok(effectiveTo instanceof Date);

    await lockClient.query('begin');
    await lockClient.query(
      `select capability_code
         from fridge.household_capability
        where capability_code = 'HOUSEHOLD_CATALOG_ADMINISTER'
        for update`,
    );

    let operationCalled = false;
    const authorityAttempt = manager.withHouseholdCatalogAdministrationTransaction(
      EXPIRING_ADMIN,
      HOUSEHOLD,
      async () => {
        operationCalled = true;
        return 'must-not-run';
      },
    );

    await waitForCatalogAuthorityLockWait(adminPool);

    const remainingMs = Math.max(0, effectiveTo.getTime() - Date.now());
    await delay(remainingMs + 150);

    await lockClient.query('commit');
    lockReleased = true;
    lockClient.release();

    await assert.rejects(authorityAttempt, HouseholdAuthorizationError);
    assert.equal(operationCalled, false);
  } finally {
    if (!lockReleased) {
      await releaseLock(lockClient);
    }
    await database.close();
    await adminPool.end();
  }
});

test('delegated transaction bootstrap SQLSTATE is normalized before the callback boundary', async () => {
  const rawDriverFailure = Object.assign(new Error('connection lost before callback'), {
    code: '08006',
  });
  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction<T>(): Promise<T> {
      throw rawDriverFailure;
    },
  };
  const manager = new PgHouseholdCatalogAdministrationTransactionManager(transactions);

  await assert.rejects(
    manager.withHouseholdCatalogAdministrationTransaction(
      CATALOG_ADMIN,
      HOUSEHOLD,
      async () => 'must-not-run',
    ),
    (error: unknown) =>
      error instanceof DependencyUnavailableError && error.cause === rawDriverFailure,
  );
});

test('provider-neutral application errors raised by the operation are preserved', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdCatalogAdministrationTransactionManager(database);
  const expected = new InvalidInputError('intent-specific validation failure');

  try {
    await assert.rejects(
      manager.withHouseholdCatalogAdministrationTransaction(
        CATALOG_ADMIN,
        HOUSEHOLD,
        async () => {
          throw expected;
        },
      ),
      (error: unknown) => error === expected,
    );
  } finally {
    await database.close();
  }
});

test('revoked catalog capability mapping is revalidated at authority acquisition time', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const manager = new PgHouseholdCatalogAdministrationTransactionManager(database);

  try {
    await adminPool.query(
      `delete from fridge.household_role_capability
        where role_code = $1
          and capability_code = 'HOUSEHOLD_CATALOG_ADMINISTER'`,
      [CATALOG_ROLE],
    );

    await assert.rejects(
      manager.withHouseholdCatalogAdministrationTransaction(
        CATALOG_ADMIN,
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
