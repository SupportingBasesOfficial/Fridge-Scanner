import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import type { HouseholdId } from '@fridge/application';
import { PgDatabase, requirePgClient } from './index.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const HOUSEHOLD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as HouseholdId;
const HOUSEHOLD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as HouseholdId;

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for database integration tests');
}

async function visibleHouseholds(database: PgDatabase, householdId: HouseholdId): Promise<string[]> {
  return database.withHouseholdTransaction(householdId, async (transaction) => {
    const client = requirePgClient(transaction);
    const result = await client.query<{ household_id: string }>(
      'select household_id::text from fridge.household order by household_id',
    );
    return result.rows.map((row) => row.household_id);
  });
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

test('PgDatabase scopes Household visibility and does not leak context through a reused connection', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
    maxConnections: 1,
  });

  try {
    assert.deepEqual(await visibleHouseholds(database, HOUSEHOLD_A), [HOUSEHOLD_A]);
    assert.deepEqual(await visibleHouseholds(database, HOUSEHOLD_B), [HOUSEHOLD_B]);
    assert.deepEqual(await visibleHouseholds(database, HOUSEHOLD_A), [HOUSEHOLD_A]);
  } finally {
    await database.close();
  }
});

test('PgDatabase rejects malformed Household context before opening tenant work', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
    maxConnections: 1,
  });

  try {
    await assert.rejects(
      database.withHouseholdTransaction('not-a-uuid' as HouseholdId, async () => undefined),
      /canonical UUID/,
    );
  } finally {
    await database.close();
  }
});
