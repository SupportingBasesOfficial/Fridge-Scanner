import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  ConflictError,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/application';
import { PgDatabase } from './index.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for role-change integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for role-change integration tests');
}

const FIXTURE_HOUSEHOLD = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const FIXTURE_ADMIN = PrincipalId('33333333-3333-4333-8333-333333333333');

const TARGET = PrincipalId('d1111111-1111-4111-8111-111111111111');
const TARGET_SOURCE = HouseholdMembershipId('d1111111-aaaa-4111-8111-111111111111');
const TARGET_RESULT = HouseholdMembershipId('d1111111-bbbb-4111-8111-111111111111');
const TARGET_REPLAY_CANDIDATE = HouseholdMembershipId('d1111111-cccc-4111-8111-111111111111');
const TARGET_LATER = HouseholdMembershipId('d1111111-dddd-4111-8111-111111111111');
const CHANGE_COMMAND = CommandId('d1111111-0000-4000-8000-000000000001');

const SOLO_HOUSEHOLD = HouseholdId('d2222222-2222-4222-8222-222222222222');
const SOLO_ADMIN = PrincipalId('d2222222-3333-4333-8333-222222222222');
const SOLO_ADMIN_MEMBERSHIP = HouseholdMembershipId('d2222222-aaaa-4222-8222-222222222222');
const SOLO_DEMOTED_MEMBERSHIP = HouseholdMembershipId('d2222222-bbbb-4222-8222-222222222222');
const SOLO_COMMAND = CommandId('d2222222-0000-4000-8000-000000000001');
const SECOND_SOLO_ADMIN = PrincipalId('d2222222-4444-4444-8444-222222222222');
const SECOND_SOLO_ADMIN_MEMBERSHIP = HouseholdMembershipId('d2222222-cccc-4222-8222-222222222222');

const RACE_HOUSEHOLD = HouseholdId('d3333333-3333-4333-8333-333333333333');
const RACE_ADMIN_A = PrincipalId('d3333333-1111-4111-8111-333333333333');
const RACE_ADMIN_B = PrincipalId('d3333333-2222-4222-8222-333333333333');
const RACE_MEMBERSHIP_A = HouseholdMembershipId('d3333333-aaaa-4333-8333-333333333333');
const RACE_MEMBERSHIP_B = HouseholdMembershipId('d3333333-bbbb-4333-8333-333333333333');
const RACE_RESULT_A = HouseholdMembershipId('d3333333-cccc-4333-8333-333333333333');
const RACE_RESULT_B = HouseholdMembershipId('d3333333-dddd-4333-8333-333333333333');
const RACE_COMMAND_A = CommandId('d3333333-0000-4000-8000-000000000001');
const RACE_COMMAND_B = CommandId('d3333333-0000-4000-8000-000000000002');

async function changeRole(
  database: PgDatabase,
  actor: ReturnType<typeof PrincipalId>,
  household: ReturnType<typeof HouseholdId>,
  commandId: ReturnType<typeof CommandId>,
  candidateMembershipId: ReturnType<typeof HouseholdMembershipId>,
  target: ReturnType<typeof PrincipalId>,
  roleCode: string,
): Promise<ReturnType<typeof HouseholdMembershipId>> {
  return database.withHouseholdMembershipAdministrationTransaction(
    actor,
    household,
    (transaction) =>
      database.changeHouseholdMemberRole(transaction, {
        commandId,
        candidateMembershipId,
        targetPrincipalId: target,
        roleCode,
      }),
  );
}

test('role change closes prior authority history and creates a new current interval with actor provenance', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    await admin.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE03 Role Change Target')`,
      [TARGET],
    );
    await admin.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status,
         effective_from, effective_to
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'MEMBER', 'ACTIVE',
         clock_timestamp() - interval '1 hour', null
       )`,
      [TARGET_SOURCE, FIXTURE_HOUSEHOLD, TARGET],
    );

    const resultId = await changeRole(
      database,
      FIXTURE_ADMIN,
      FIXTURE_HOUSEHOLD,
      CHANGE_COMMAND,
      TARGET_RESULT,
      TARGET,
      'BE03_ADMIN',
    );
    assert.equal(resultId, TARGET_RESULT);

    const history = await admin.query<{
      membership_id: string;
      role_code: string;
      effective_from: Date;
      effective_to: Date | null;
      created_by_user_id: string | null;
    }>(
      `select membership_id::text, role_code, effective_from, effective_to,
              created_by_user_id::text
         from fridge.household_membership
        where household_id = $1::uuid and user_id = $2::uuid
        order by effective_from, membership_id`,
      [FIXTURE_HOUSEHOLD, TARGET],
    );

    assert.equal(history.rowCount, 2);
    const source = history.rows.find((row) => row.membership_id === TARGET_SOURCE);
    const replacement = history.rows.find((row) => row.membership_id === TARGET_RESULT);
    assert.equal(source?.role_code, 'MEMBER');
    assert.ok(source?.effective_to instanceof Date);
    assert.equal(replacement?.role_code, 'BE03_ADMIN');
    assert.equal(replacement?.effective_to, null);
    assert.equal(replacement?.created_by_user_id, FIXTURE_ADMIN);
    assert.equal(source?.effective_to?.toISOString(), replacement?.effective_from.toISOString());
  } finally {
    await admin.end();
    await database.close();
  }
});

test('replaying a committed role-change command never applies the transition again after later authority changes', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    await admin.query(
      `update fridge.household_membership
          set effective_to = clock_timestamp()
        where membership_id = $1::uuid`,
      [TARGET_RESULT],
    );
    await admin.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status,
         effective_from, effective_to, created_by_user_id
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'MEMBER', 'ACTIVE',
         clock_timestamp(), null, $4::uuid
       )`,
      [TARGET_LATER, FIXTURE_HOUSEHOLD, TARGET, FIXTURE_ADMIN],
    );

    const replayed = await changeRole(
      database,
      FIXTURE_ADMIN,
      FIXTURE_HOUSEHOLD,
      CHANGE_COMMAND,
      TARGET_REPLAY_CANDIDATE,
      TARGET,
      'BE03_ADMIN',
    );
    assert.equal(replayed, TARGET_RESULT);

    const state = await admin.query<{
      replay_candidate_count: string;
      current_membership_id: string;
      current_role_code: string;
    }>(
      `select
         count(*) filter (where membership_id = $3::uuid)::text as replay_candidate_count,
         max(membership_id::text) filter (
           where lifecycle_status = 'ACTIVE'
             and effective_from <= statement_timestamp()
             and (effective_to is null or effective_to > statement_timestamp())
         ) as current_membership_id,
         max(role_code) filter (
           where lifecycle_status = 'ACTIVE'
             and effective_from <= statement_timestamp()
             and (effective_to is null or effective_to > statement_timestamp())
         ) as current_role_code
       from fridge.household_membership
       where household_id = $1::uuid and user_id = $2::uuid`,
      [FIXTURE_HOUSEHOLD, TARGET, TARGET_REPLAY_CANDIDATE],
    );

    assert.equal(state.rows[0]?.replay_candidate_count, '0');
    assert.equal(state.rows[0]?.current_membership_id, TARGET_LATER);
    assert.equal(state.rows[0]?.current_role_code, 'MEMBER');
  } finally {
    await admin.end();
    await database.close();
  }
});

test('self-demotion is explicit: last administrator is rejected, but succeeds once another administrator survives', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    await admin.query(
      `insert into fridge.user_profile (user_id, display_name)
       values
         ($1::uuid, 'BE03 Solo Admin'),
         ($2::uuid, 'BE03 Second Solo Admin')`,
      [SOLO_ADMIN, SECOND_SOLO_ADMIN],
    );
    await admin.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE03 Solo Household')`,
      [SOLO_HOUSEHOLD],
    );
    await admin.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status,
         effective_from, effective_to
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'BE03_ADMIN', 'ACTIVE',
         clock_timestamp() - interval '1 hour', null
       )`,
      [SOLO_ADMIN_MEMBERSHIP, SOLO_HOUSEHOLD, SOLO_ADMIN],
    );

    await assert.rejects(
      changeRole(
        database,
        SOLO_ADMIN,
        SOLO_HOUSEHOLD,
        SOLO_COMMAND,
        SOLO_DEMOTED_MEMBERSHIP,
        SOLO_ADMIN,
        'MEMBER',
      ),
      ConflictError,
    );

    await admin.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status,
         effective_from, effective_to
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'BE03_ADMIN', 'ACTIVE',
         clock_timestamp() - interval '1 hour', null
       )`,
      [SECOND_SOLO_ADMIN_MEMBERSHIP, SOLO_HOUSEHOLD, SECOND_SOLO_ADMIN],
    );

    const changed = await changeRole(
      database,
      SOLO_ADMIN,
      SOLO_HOUSEHOLD,
      SOLO_COMMAND,
      SOLO_DEMOTED_MEMBERSHIP,
      SOLO_ADMIN,
      'MEMBER',
    );
    assert.equal(changed, SOLO_DEMOTED_MEMBERSHIP);
  } finally {
    await admin.end();
    await database.close();
  }
});

test('two administrators racing to self-demote cannot remove the final administration capability', async () => {
  const databaseA = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const databaseB = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    await admin.query(
      `insert into fridge.user_profile (user_id, display_name)
       values
         ($1::uuid, 'BE03 Race Admin A'),
         ($2::uuid, 'BE03 Race Admin B')`,
      [RACE_ADMIN_A, RACE_ADMIN_B],
    );
    await admin.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE03 Race Household')`,
      [RACE_HOUSEHOLD],
    );
    await admin.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status,
         effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE03_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE03_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [RACE_MEMBERSHIP_A, RACE_MEMBERSHIP_B, RACE_HOUSEHOLD, RACE_ADMIN_A, RACE_ADMIN_B],
    );

    const outcomes = await Promise.allSettled([
      changeRole(databaseA, RACE_ADMIN_A, RACE_HOUSEHOLD, RACE_COMMAND_A, RACE_RESULT_A, RACE_ADMIN_A, 'MEMBER'),
      changeRole(databaseB, RACE_ADMIN_B, RACE_HOUSEHOLD, RACE_COMMAND_B, RACE_RESULT_B, RACE_ADMIN_B, 'MEMBER'),
    ]);

    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.status === 'rejected' && rejected[0].reason instanceof ConflictError);

    const admins = await admin.query<{ count: string }>(
      `select count(*)::text as count
         from fridge.household_membership hm
         join fridge.household_role_capability rc on rc.role_code = hm.role_code
        where hm.household_id = $1::uuid
          and hm.lifecycle_status = 'ACTIVE'
          and hm.effective_from <= statement_timestamp()
          and (hm.effective_to is null or hm.effective_to > statement_timestamp())
          and rc.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'`,
      [RACE_HOUSEHOLD],
    );
    assert.equal(admins.rows[0]?.count, '1');
  } finally {
    await admin.end();
    await databaseA.close();
    await databaseB.close();
  }
});
