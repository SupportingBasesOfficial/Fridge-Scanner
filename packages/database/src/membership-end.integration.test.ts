import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  ConflictError,
  HouseholdId,
  HouseholdMembershipId,
  IdempotencyConflictError,
  PrincipalId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdMembershipEndWriter } from './membership-end.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for membership end integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for membership end integration tests');
}

const ADMIN_ROLE = 'TEST_END_ADMIN';
const MEMBER_ROLE = 'TEST_END_MEMBER';

async function seedRoles(pool: Pool): Promise<void> {
  await pool.query(
    `insert into fridge.household_role (role_code, display_name, is_assignable, lifecycle_status)
     values
       ($1::text, 'BE03 End Admin', true, 'ACTIVE'),
       ($2::text, 'BE03 End Member', true, 'ACTIVE')
     on conflict (role_code) do nothing`,
    [ADMIN_ROLE, MEMBER_ROLE],
  );
  await pool.query(
    `insert into fridge.household_role_capability (role_code, capability_code)
     values ($1::text, 'HOUSEHOLD_MEMBERSHIP_ADMINISTER')
     on conflict (role_code, capability_code) do nothing`,
    [ADMIN_ROLE],
  );
}

async function seedHousehold(
  pool: Pool,
  householdId: string,
  users: readonly { userId: string; membershipId: string; roleCode: string }[],
): Promise<void> {
  for (const user of users) {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, $2::text)`,
      [user.userId, `BE03 End ${user.userId.slice(0, 8)}`],
    );
  }

  await pool.query(
    `insert into fridge.household (household_id, display_name)
     values ($1::uuid, 'BE03 Membership End Household')`,
    [householdId],
  );

  for (const user of users) {
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,
         household_id,
         user_id,
         role_code,
         lifecycle_status,
         effective_from,
         effective_to
       ) values (
         $1::uuid,
         $2::uuid,
         $3::uuid,
         $4::text,
         'ACTIVE',
         clock_timestamp() - interval '1 hour',
         null
       )`,
      [user.membershipId, householdId, user.userId, user.roleCode],
    );
  }
}

async function adminEnd(
  database: PgDatabase,
  writer: PgHouseholdMembershipEndWriter,
  householdId: string,
  actorId: string,
  commandId: string,
  targetId: string,
): Promise<HouseholdMembershipId> {
  return database.withHouseholdMembershipAdministrationTransaction(
    PrincipalId(actorId),
    HouseholdId(householdId),
    (transaction) =>
      writer.endHouseholdMembership(transaction, {
        commandId: CommandId(commandId),
        targetPrincipalId: PrincipalId(targetId),
      }),
  );
}

async function selfLeave(
  database: PgDatabase,
  writer: PgHouseholdMembershipEndWriter,
  householdId: string,
  actorId: string,
  commandId: string,
): Promise<HouseholdMembershipId> {
  return database.withAuthorizedHouseholdTransaction(
    PrincipalId(actorId),
    HouseholdId(householdId),
    (transaction) => writer.leaveHousehold(transaction, { commandId: CommandId(commandId) }),
  );
}

test('administrative end closes history, records actor provenance and replay never ends a later rejoin', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const writer = new PgHouseholdMembershipEndWriter();

  const household = 'd1000000-0000-4000-8000-000000000001';
  const admin = 'd1000000-0000-4000-8000-000000000011';
  const target = 'd1000000-0000-4000-8000-000000000012';
  const adminMembership = 'd1000000-0000-4000-8000-000000000021';
  const targetMembership = 'd1000000-0000-4000-8000-000000000022';
  const rejoinMembership = 'd1000000-0000-4000-8000-000000000023';
  const command = 'd1000000-0000-4000-8000-000000000031';

  try {
    await seedRoles(adminPool);
    await seedHousehold(adminPool, household, [
      { userId: admin, membershipId: adminMembership, roleCode: ADMIN_ROLE },
      { userId: target, membershipId: targetMembership, roleCode: MEMBER_ROLE },
    ]);

    const ended = await adminEnd(database, writer, household, admin, command, target);
    assert.equal(ended, targetMembership);

    const firstState = await adminPool.query<{
      effective_to: Date | null;
      actor_user_id: string;
      target_user_id: string;
      intent_code: string;
      source_membership_id: string;
      outcome_code: string;
    }>(
      `select hm.effective_to,
              c.actor_user_id::text,
              c.target_user_id::text,
              c.intent_code,
              c.source_membership_id::text,
              c.outcome_code
         from fridge.household_membership hm
         join fridge.household_membership_end_command c
           on c.household_id = hm.household_id
          and c.source_membership_id = hm.membership_id
        where hm.membership_id = $1::uuid
          and c.command_id = $2::uuid`,
      [targetMembership, command],
    );
    assert.ok(firstState.rows[0]?.effective_to instanceof Date);
    assert.equal(firstState.rows[0]?.actor_user_id, admin);
    assert.equal(firstState.rows[0]?.target_user_id, target);
    assert.equal(firstState.rows[0]?.intent_code, 'ADMIN_END');
    assert.equal(firstState.rows[0]?.source_membership_id, targetMembership);
    assert.equal(firstState.rows[0]?.outcome_code, 'ENDED');

    await adminPool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::text, 'ACTIVE', clock_timestamp(), null)`,
      [rejoinMembership, household, target, MEMBER_ROLE],
    );

    const replayed = await adminEnd(database, writer, household, admin, command, target);
    assert.equal(replayed, targetMembership);

    const replayState = await adminPool.query<{ effective_to: Date | null }>(
      `select effective_to
         from fridge.household_membership
        where membership_id = $1::uuid`,
      [rejoinMembership],
    );
    assert.equal(replayState.rows[0]?.effective_to, null);

    await assert.rejects(
      adminEnd(
        database,
        writer,
        household,
        admin,
        command,
        admin,
      ),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('ordinary current member can self-leave without membership-administration capability', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const writer = new PgHouseholdMembershipEndWriter();

  const household = 'd2000000-0000-4000-8000-000000000001';
  const admin = 'd2000000-0000-4000-8000-000000000011';
  const member = 'd2000000-0000-4000-8000-000000000012';
  const adminMembership = 'd2000000-0000-4000-8000-000000000021';
  const memberMembership = 'd2000000-0000-4000-8000-000000000022';
  const command = 'd2000000-0000-4000-8000-000000000031';

  try {
    await seedRoles(adminPool);
    await seedHousehold(adminPool, household, [
      { userId: admin, membershipId: adminMembership, roleCode: ADMIN_ROLE },
      { userId: member, membershipId: memberMembership, roleCode: MEMBER_ROLE },
    ]);

    const ended = await selfLeave(database, writer, household, member, command);
    assert.equal(ended, memberMembership);

    const state = await adminPool.query<{ effective_to: Date | null; intent_code: string }>(
      `select hm.effective_to, c.intent_code
         from fridge.household_membership hm
         join fridge.household_membership_end_command c
           on c.source_membership_id = hm.membership_id
        where hm.membership_id = $1::uuid
          and c.command_id = $2::uuid`,
      [memberMembership, command],
    );
    assert.ok(state.rows[0]?.effective_to instanceof Date);
    assert.equal(state.rows[0]?.intent_code, 'SELF_LEAVE');
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('the last current administrator cannot self-leave', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const writer = new PgHouseholdMembershipEndWriter();

  const household = 'd3000000-0000-4000-8000-000000000001';
  const admin = 'd3000000-0000-4000-8000-000000000011';
  const adminMembership = 'd3000000-0000-4000-8000-000000000021';
  const command = 'd3000000-0000-4000-8000-000000000031';

  try {
    await seedRoles(adminPool);
    await seedHousehold(adminPool, household, [
      { userId: admin, membershipId: adminMembership, roleCode: ADMIN_ROLE },
    ]);

    await assert.rejects(
      selfLeave(database, writer, household, admin, command),
      ConflictError,
    );

    const state = await adminPool.query<{ effective_to: Date | null }>(
      `select effective_to from fridge.household_membership where membership_id = $1::uuid`,
      [adminMembership],
    );
    assert.equal(state.rows[0]?.effective_to, null);
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('two administrators racing to self-leave converge on exactly one surviving administrator', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const databaseA = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const databaseB = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const writerA = new PgHouseholdMembershipEndWriter();
  const writerB = new PgHouseholdMembershipEndWriter();

  const household = 'd4000000-0000-4000-8000-000000000001';
  const adminA = 'd4000000-0000-4000-8000-000000000011';
  const adminB = 'd4000000-0000-4000-8000-000000000012';
  const membershipA = 'd4000000-0000-4000-8000-000000000021';
  const membershipB = 'd4000000-0000-4000-8000-000000000022';
  const commandA = 'd4000000-0000-4000-8000-000000000031';
  const commandB = 'd4000000-0000-4000-8000-000000000032';

  try {
    await seedRoles(adminPool);
    await seedHousehold(adminPool, household, [
      { userId: adminA, membershipId: membershipA, roleCode: ADMIN_ROLE },
      { userId: adminB, membershipId: membershipB, roleCode: ADMIN_ROLE },
    ]);

    const outcomes = await Promise.allSettled([
      selfLeave(databaseA, writerA, household, adminA, commandA),
      selfLeave(databaseB, writerB, household, adminB, commandB),
    ]);

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
          and hm.effective_from <= statement_timestamp()
          and (hm.effective_to is null or hm.effective_to > statement_timestamp())
          and rc.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'`,
      [household],
    );
    assert.equal(state.rows[0]?.current_admins, '1');
  } finally {
    await databaseA.close();
    await databaseB.close();
    await adminPool.end();
  }
});
