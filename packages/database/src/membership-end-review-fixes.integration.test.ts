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
import { PgHouseholdMembershipEndWriter } from './membership-end.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL || !ADMIN_DATABASE_URL) {
  throw new Error('database URLs are required for membership-end review-fix integration tests');
}

const ADMIN_ROLE = 'TEST_END_REVIEW_ADMIN';
const MEMBER_ROLE = 'TEST_END_REVIEW_MEMBER';

async function seedRoles(pool: Pool): Promise<void> {
  await pool.query(
    `insert into fridge.household_role (role_code, display_name, is_assignable, lifecycle_status)
     values
       ($1::text, 'BE03 End Review Admin', true, 'ACTIVE'),
       ($2::text, 'BE03 End Review Member', true, 'ACTIVE')
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
      [user.userId, `BE03 End Review ${user.userId.slice(0, 8)}`],
    );
  }
  await pool.query(
    `insert into fridge.household (household_id, display_name)
     values ($1::uuid, 'BE03 End Review Household')`,
    [householdId],
  );
  for (const user of users) {
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::text, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [user.membershipId, householdId, user.userId, user.roleCode],
    );
  }
}

test('committed self-leave is replayable after current membership authority is gone', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const writer = new PgHouseholdMembershipEndWriter();

  const household = 'da000000-0000-4000-8000-000000000001';
  const admin = 'da000000-0000-4000-8000-000000000011';
  const member = 'da000000-0000-4000-8000-000000000012';
  const adminMembership = 'da000000-0000-4000-8000-000000000021';
  const memberMembership = 'da000000-0000-4000-8000-000000000022';
  const command = 'da000000-0000-4000-8000-000000000031';

  try {
    await seedRoles(adminPool);
    await seedHousehold(adminPool, household, [
      { userId: admin, membershipId: adminMembership, roleCode: ADMIN_ROLE },
      { userId: member, membershipId: memberMembership, roleCode: MEMBER_ROLE },
    ]);

    const ended = await database.withAuthorizedHouseholdTransaction(
      PrincipalId(member),
      HouseholdId(household),
      (transaction) => writer.leaveHousehold(transaction, { commandId: CommandId(command) }),
    );
    assert.equal(ended, memberMembership);

    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(
        PrincipalId(member),
        HouseholdId(household),
        async () => undefined,
      ),
    );

    const replayed = await database.replayLeaveHousehold({
      commandId: CommandId(command),
      actorPrincipalId: PrincipalId(member),
      householdId: HouseholdId(household),
    });
    assert.equal(replayed, memberMembership);
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('administrative end of an unknown principal is a controlled membership conflict', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const writer = new PgHouseholdMembershipEndWriter();

  const household = 'db000000-0000-4000-8000-000000000001';
  const admin = 'db000000-0000-4000-8000-000000000011';
  const unknown = 'db000000-0000-4000-8000-000000000099';
  const adminMembership = 'db000000-0000-4000-8000-000000000021';
  const command = 'db000000-0000-4000-8000-000000000031';

  try {
    await seedRoles(adminPool);
    await seedHousehold(adminPool, household, [
      { userId: admin, membershipId: adminMembership, roleCode: ADMIN_ROLE },
    ]);

    await assert.rejects(
      database.withHouseholdMembershipAdministrationTransaction(
        PrincipalId(admin),
        HouseholdId(household),
        (transaction) =>
          writer.endHouseholdMembership(transaction, {
            commandId: CommandId(command),
            targetPrincipalId: PrincipalId(unknown),
          }),
      ),
      ConflictError,
    );
  } finally {
    await database.close();
    await adminPool.end();
  }
});
