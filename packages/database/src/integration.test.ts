import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  type HouseholdId as HouseholdIdType,
  type PrincipalId as PrincipalIdType,
} from '@fridge/application';
import {
  HouseholdAuthorizationError,
  PgDatabase,
  PgHouseholdProfileReader,
  requirePgClient,
} from './index.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const HOUSEHOLD_A = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const HOUSEHOLD_B = HouseholdId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const PRINCIPAL_A = PrincipalId('11111111-1111-4111-8111-111111111111');
const PRINCIPAL_B = PrincipalId('22222222-2222-4222-8222-222222222222');
const MEMBERSHIP_A = HouseholdMembershipId('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for database integration tests');
}

async function visibleHouseholds(
  database: PgDatabase,
  principalId: PrincipalIdType,
  householdId: HouseholdIdType,
): Promise<string[]> {
  return database.withAuthorizedHouseholdTransaction(
    principalId,
    householdId,
    async (transaction) => {
      const client = requirePgClient(transaction);
      const result = await client.query<{ household_id: string }>(
        'select household_id::text from fridge.household order by household_id',
      );
      return result.rows.map((row) => row.household_id);
    },
  );
}

test('runtime capability without Household context fails closed', async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query('set local role fridge_app');
    const result = await client.query<{ count: string }>(
      'select count(*)::text as count from fridge.household',
    );
    assert.equal(result.rows[0]?.count, '0');
    await client.query('rollback');
  } finally {
    client.release();
    await pool.end();
  }
});

test('authorized membership installs tenant context without leaking across reuse', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
    maxConnections: 1,
  });

  try {
    assert.deepEqual(await visibleHouseholds(database, PRINCIPAL_A, HOUSEHOLD_A), [HOUSEHOLD_A]);
    assert.deepEqual(await visibleHouseholds(database, PRINCIPAL_B, HOUSEHOLD_B), [HOUSEHOLD_B]);
    assert.deepEqual(await visibleHouseholds(database, PRINCIPAL_A, HOUSEHOLD_A), [HOUSEHOLD_A]);
  } finally {
    await database.close();
  }
});

test('candidate Household context never reaches tenant work without current membership', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
    maxConnections: 1,
  });
  let callbackRan = false;

  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(
        PRINCIPAL_A,
        HOUSEHOLD_B,
        async () => {
          callbackRan = true;
        },
      ),
      HouseholdAuthorizationError,
    );
    assert.equal(callbackRan, false);
    assert.deepEqual(await visibleHouseholds(database, PRINCIPAL_A, HOUSEHOLD_A), [HOUSEHOLD_A]);
  } finally {
    await database.close();
  }
});

test('authorization context exposes verified principal Household membership and role', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });

  try {
    const context = await database.withAuthorizedHouseholdTransaction(
      PRINCIPAL_A,
      HOUSEHOLD_A,
      async (transaction) => ({
        principalId: transaction.principalId,
        householdId: transaction.householdId,
        membershipId: transaction.membershipId,
        householdRoleCode: transaction.householdRoleCode,
      }),
    );
    assert.deepEqual(context, {
      principalId: PRINCIPAL_A,
      householdId: HOUSEHOLD_A,
      membershipId: MEMBERSHIP_A,
      householdRoleCode: 'MEMBER',
    });
  } finally {
    await database.close();
  }
});

test('intent-specific Household profile reader executes only with a verified transaction capability', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const reader = new PgHouseholdProfileReader();

  try {
    const displayName = await database.withAuthorizedHouseholdTransaction(
      PRINCIPAL_A,
      HOUSEHOLD_A,
      (transaction) => reader.readDisplayName(transaction),
    );
    assert.equal(typeof displayName, 'string');
    assert.ok((displayName ?? '').length > 0);
  } finally {
    await database.close();
  }
});

test('PgDatabase rejects forged malformed authorization identifiers before tenant work', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });

  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(
        'not-a-uuid' as PrincipalIdType,
        HOUSEHOLD_A,
        async () => undefined,
      ),
      /Invalid PrincipalId/,
    );
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(
        PRINCIPAL_A,
        'not-a-uuid' as HouseholdIdType,
        async () => undefined,
      ),
      /Invalid HouseholdId/,
    );
  } finally {
    await database.close();
  }
});
