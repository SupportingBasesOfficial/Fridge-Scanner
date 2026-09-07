import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool, type PoolClient } from 'pg';
import {
  CommandId,
  ConflictError,
  HouseholdId,
  PrincipalId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdMembershipEndWriter } from './membership-end.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for temporal serialization tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for temporal serialization tests');
}

const ROLE = 'TEST_TEMPORAL_ADMIN';
const HOUSEHOLD = 'e9000000-0000-4000-8000-000000000001';
const ADMIN_A = 'e9000000-0000-4000-8000-000000000011';
const ADMIN_B = 'e9000000-0000-4000-8000-000000000012';
const MEMBERSHIP_A = 'e9000000-0000-4000-8000-000000000021';
const MEMBERSHIP_B = 'e9000000-0000-4000-8000-000000000022';
const COMMAND_A = 'e9000000-0000-4000-8000-000000000031';
const COMMAND_B = 'e9000000-0000-4000-8000-000000000032';

async function seed(pool: Pool): Promise<void> {
  await pool.query(
    `insert into fridge.household_role (role_code, display_name, is_assignable, lifecycle_status)
     values ($1::text, 'Temporal Admin', true, 'ACTIVE')
     on conflict (role_code) do nothing`,
    [ROLE],
  );
  await pool.query(
    `insert into fridge.household_role_capability (role_code, capability_code)
     values ($1::text, 'HOUSEHOLD_MEMBERSHIP_ADMINISTER')
     on conflict (role_code, capability_code) do nothing`,
    [ROLE],
  );
  await pool.query(
    `insert into fridge.user_profile (user_id, display_name)
     values
       ($1::uuid, 'Temporal Admin A'),
       ($2::uuid, 'Temporal Admin B')`,
    [ADMIN_A, ADMIN_B],
  );
  await pool.query(
    `insert into fridge.household (household_id, display_name)
     values ($1::uuid, 'Temporal Serialization Household')`,
    [HOUSEHOLD],
  );
  await pool.query(
    `insert into fridge.household_membership (
       membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
     ) values
       ($1::uuid, $3::uuid, $4::uuid, $6::text, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
       ($2::uuid, $3::uuid, $5::uuid, $6::text, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
    [MEMBERSHIP_A, MEMBERSHIP_B, HOUSEHOLD, ADMIN_A, ADMIN_B, ROLE],
  );
}

async function waitForBothLeaveCallsToBlock(pool: Pool): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ blocked: string }>(
      `select count(*)::text as blocked
         from pg_catalog.pg_stat_activity
        where datname = current_database()
          and query like '%fridge_internal.leave_household%'
          and wait_event_type = 'Lock'`,
    );
    if (Number(result.rows[0]?.blocked ?? '0') >= 2) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('both self-leave calls did not reach the Household serialization lock');
}

async function selfLeave(
  database: PgDatabase,
  writer: PgHouseholdMembershipEndWriter,
  actor: string,
  command: string,
) {
  return database.withAuthorizedHouseholdTransaction(
    PrincipalId(actor),
    HouseholdId(HOUSEHOLD),
    (transaction) => writer.leaveHousehold(transaction, { commandId: CommandId(command) }),
  );
}

async function releaseBlocker(client: PoolClient): Promise<void> {
  await client.query('commit');
  client.release();
}

test('serialized self-leaves re-observe current authority after waiting for the Household lock', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 3 });
  const databaseA = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const databaseB = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const writerA = new PgHouseholdMembershipEndWriter();
  const writerB = new PgHouseholdMembershipEndWriter();
  let blocker: PoolClient | undefined;

  try {
    await seed(adminPool);

    blocker = await adminPool.connect();
    await blocker.query('begin');
    await blocker.query(
      `select household_id
         from fridge.household
        where household_id = $1::uuid
        for update`,
      [HOUSEHOLD],
    );

    // Start both SQL statements while the Household is locked. Their statement
    // timestamps are therefore necessarily pre-serialization. A kernel that uses
    // statement_timestamp() after waiting can incorrectly count authority already
    // ended by its serialized predecessor.
    const pendingA = selfLeave(databaseA, writerA, ADMIN_A, COMMAND_A);
    const pendingB = selfLeave(databaseB, writerB, ADMIN_B, COMMAND_B);

    await waitForBothLeaveCallsToBlock(adminPool);
    await releaseBlocker(blocker);
    blocker = undefined;

    const outcomes = await Promise.allSettled([pendingA, pendingB]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.status === 'rejected' && rejected[0].reason instanceof ConflictError);

    const state = await adminPool.query<{ current_admins: string }>(
      `select count(*)::text as current_admins
         from fridge.household_membership hm
         join fridge.household_role_capability rc
           on rc.role_code = hm.role_code
        where hm.household_id = $1::uuid
          and hm.lifecycle_status = 'ACTIVE'
          and hm.effective_from <= clock_timestamp()
          and (hm.effective_to is null or hm.effective_to > clock_timestamp())
          and rc.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'`,
      [HOUSEHOLD],
    );
    assert.equal(state.rows[0]?.current_admins, '1');
  } finally {
    if (blocker !== undefined) {
      await blocker.query('rollback').catch(() => undefined);
      blocker.release();
    }
    await databaseA.close();
    await databaseB.close();
    await adminPool.end();
  }
});
