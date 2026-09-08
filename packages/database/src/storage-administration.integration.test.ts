import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  HOUSEHOLD_STORAGE_ADMINISTRATION_CAPABILITY,
  HouseholdId,
  PrincipalId,
} from '@fridge/application';
import {
  HouseholdAuthorizationError,
  PgDatabase,
} from './index.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

// BE-04 owns an isolated fixture namespace. Deliberately do not use ON CONFLICT:
// accidental cross-suite identity reuse must fail loudly rather than hide coupling.
const HOUSEHOLD = HouseholdId('f4a40404-0b04-4a04-8b04-000000000004');
const OTHER_HOUSEHOLD = HouseholdId('f4a40505-0b04-4a05-8b04-000000000005');
const STORAGE_ADMIN = PrincipalId('f4a40101-0b04-4a01-8b04-000000000001');
const ORDINARY_MEMBER = PrincipalId('f4a40202-0b04-4a02-8b04-000000000002');
const STORAGE_ADMIN_MEMBERSHIP = 'f4a41111-0b04-4a11-8b04-000000000011';
const ORDINARY_MEMBER_MEMBERSHIP = 'f4a42222-0b04-4a22-8b04-000000000022';

// Accepted BE-03 workflow fixture: this principal has only
// HOUSEHOLD_MEMBERSHIP_ADMINISTER and must not inherit BE-04 storage authority.
const BE03_HOUSEHOLD = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const BE03_MEMBERSHIP_ADMIN = PrincipalId('33333333-3333-4333-8333-333333333333');

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for storage authority integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for storage authority integration tests');
}

async function seedStorageAuthorityFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values
         ($1::uuid, 'BE04 Storage Admin'),
         ($2::uuid, 'BE04 Ordinary Member')`,
      [STORAGE_ADMIN, ORDINARY_MEMBER],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values
         ($1::uuid, 'BE04 Storage Household'),
         ($2::uuid, 'BE04 Other Household')`,
      [HOUSEHOLD, OTHER_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_STORAGE_ADMIN', 'BE04 governed storage administration test role')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_STORAGE_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,
         household_id,
         user_id,
         role_code,
         lifecycle_status,
         effective_from,
         effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_STORAGE_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [
        STORAGE_ADMIN_MEMBERSHIP,
        ORDINARY_MEMBER_MEMBERSHIP,
        HOUSEHOLD,
        STORAGE_ADMIN,
        ORDINARY_MEMBER,
      ],
    );
  } finally {
    await pool.end();
  }
}

await seedStorageAuthorityFixture();

test('governed role capability upgrades current authority to storage administration', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const manager = new PgHouseholdStorageAdministrationTransactionManager(database);

  try {
    const authority = await manager.withHouseholdStorageAdministrationTransaction(
      STORAGE_ADMIN,
      HOUSEHOLD,
      async (transaction) => ({
        principalId: transaction.principalId,
        householdId: transaction.householdId,
        householdRoleCode: transaction.householdRoleCode,
        capability: transaction.storageAdministrationCapability,
        capabilityEnumerable: Object.prototype.propertyIsEnumerable.call(
          transaction,
          'storageAdministrationCapability',
        ),
      }),
    );

    assert.deepEqual(authority, {
      principalId: STORAGE_ADMIN,
      householdId: HOUSEHOLD,
      householdRoleCode: 'BE04_STORAGE_ADMIN',
      capability: HOUSEHOLD_STORAGE_ADMINISTRATION_CAPABILITY,
      capabilityEnumerable: false,
    });
  } finally {
    await database.close();
  }
});

test('BE-03 membership administration capability does not imply BE-04 storage administration', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const manager = new PgHouseholdStorageAdministrationTransactionManager(database);
  let callbackRan = false;

  try {
    await assert.rejects(
      manager.withHouseholdStorageAdministrationTransaction(
        BE03_MEMBERSHIP_ADMIN,
        BE03_HOUSEHOLD,
        async () => {
          callbackRan = true;
        },
      ),
      HouseholdAuthorizationError,
    );
    assert.equal(callbackRan, false);
  } finally {
    await database.close();
  }
});

test('current Household member without governed storage capability cannot administer topology', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const manager = new PgHouseholdStorageAdministrationTransactionManager(database);
  let callbackRan = false;

  try {
    await assert.rejects(
      manager.withHouseholdStorageAdministrationTransaction(
        ORDINARY_MEMBER,
        HOUSEHOLD,
        async () => {
          callbackRan = true;
        },
      ),
      HouseholdAuthorizationError,
    );
    assert.equal(callbackRan, false);
  } finally {
    await database.close();
  }
});

test('storage administration still requires current membership in the requested Household', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const manager = new PgHouseholdStorageAdministrationTransactionManager(database);
  let callbackRan = false;

  try {
    await assert.rejects(
      manager.withHouseholdStorageAdministrationTransaction(
        STORAGE_ADMIN,
        OTHER_HOUSEHOLD,
        async () => {
          callbackRan = true;
        },
      ),
      HouseholdAuthorizationError,
    );
    assert.equal(callbackRan, false);
  } finally {
    await database.close();
  }
});

test('storage administration authority locks the exact actor membership against concurrent revocation', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
    maxConnections: 1,
  });
  const manager = new PgHouseholdStorageAdministrationTransactionManager(database);
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  let markAuthorityReady!: () => void;
  let releaseAuthority!: () => void;
  const authorityReady = new Promise<void>((resolve) => {
    markAuthorityReady = resolve;
  });
  const authorityRelease = new Promise<void>((resolve) => {
    releaseAuthority = resolve;
  });

  const authorityOperation = manager.withHouseholdStorageAdministrationTransaction(
    STORAGE_ADMIN,
    HOUSEHOLD,
    async () => {
      markAuthorityReady();
      await authorityRelease;
    },
  );

  await authorityReady;
  const adminClient = await adminPool.connect();

  try {
    await adminClient.query('begin');
    await adminClient.query("set local lock_timeout = '200ms'");
    await assert.rejects(
      adminClient.query(
        `update fridge.household_membership
            set effective_to = clock_timestamp()
          where membership_id = $1::uuid`,
        [STORAGE_ADMIN_MEMBERSHIP],
      ),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, '55P03');
        return true;
      },
    );
    await adminClient.query('rollback');
  } finally {
    releaseAuthority();
    await authorityOperation;
    adminClient.release();
    await adminPool.end();
    await database.close();
  }
});
