import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import {
  HouseholdMembershipReadAuthorizationError,
  PgCurrentHouseholdMembershipReader,
} from './membership-read.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for membership read integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for membership read integration tests');
}

const ROLE = 'TEST_READ_MEMBER';

async function seedRole(pool: Pool): Promise<void> {
  await pool.query(
    `insert into fridge.household_role (role_code, display_name, is_assignable, lifecycle_status)
     values ($1::text, 'BE03 Read Member', true, 'ACTIVE')
     on conflict (role_code) do nothing`,
    [ROLE],
  );
}

test('current Household membership read is scoped, current-only and provider-neutral', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const reader = new PgCurrentHouseholdMembershipReader();

  const household = 'e1000000-0000-4000-8000-000000000001';
  const otherHousehold = 'e1000000-0000-4000-8000-000000000002';
  const actor = 'e1000000-0000-4000-8000-000000000011';
  const member = 'e1000000-0000-4000-8000-000000000012';
  const ended = 'e1000000-0000-4000-8000-000000000013';
  const future = 'e1000000-0000-4000-8000-000000000014';
  const outsider = 'e1000000-0000-4000-8000-000000000015';
  const actorMembership = 'e1000000-0000-4000-8000-000000000021';
  const memberMembership = 'e1000000-0000-4000-8000-000000000022';

  try {
    await seedRole(adminPool);
    for (const [userId, displayName] of [
      [actor, 'Actor'],
      [member, 'Visible Member'],
      [ended, 'Ended Member'],
      [future, 'Future Member'],
      [outsider, 'Other Household Member'],
    ] as const) {
      await adminPool.query(
        `insert into fridge.user_profile (user_id, display_name)
         values ($1::uuid, $2::text)`,
        [userId, displayName],
      );
    }

    await adminPool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'Read Household'), ($2::uuid, 'Other Household')`,
      [household, otherHousehold],
    );

    await adminPool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values
       ($1::uuid, $6::uuid, $2::uuid, $10::text, 'ACTIVE', clock_timestamp() - interval '2 hours', null),
       ($3::uuid, $6::uuid, $4::uuid, $10::text, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
       ('e1000000-0000-4000-8000-000000000023'::uuid, $6::uuid, $7::uuid, $10::text, 'ACTIVE', clock_timestamp() - interval '3 hours', clock_timestamp() - interval '2 hours'),
       ('e1000000-0000-4000-8000-000000000024'::uuid, $6::uuid, $8::uuid, $10::text, 'ACTIVE', clock_timestamp() + interval '1 hour', null),
       ('e1000000-0000-4000-8000-000000000025'::uuid, $9::uuid, $5::uuid, $10::text, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [
        actorMembership,
        actor,
        memberMembership,
        member,
        outsider,
        household,
        ended,
        future,
        otherHousehold,
        ROLE,
      ],
    );

    const members = await database.withAuthorizedHouseholdTransaction(
      PrincipalId(actor),
      HouseholdId(household),
      (transaction) => reader.readCurrentHouseholdMembers(transaction),
    );

    assert.equal(members.length, 2);
    assert.deepEqual(
      members.map((entry) => entry.principalId),
      [PrincipalId(actor), PrincipalId(member)],
    );
    assert.equal(members[0]?.membershipId, HouseholdMembershipId(actorMembership));
    assert.equal(members[1]?.membershipId, HouseholdMembershipId(memberMembership));
    assert.equal(members[1]?.displayName, 'Visible Member');
    assert.equal(members[1]?.roleCode, ROLE);
    assert.equal(members[0]?.effectiveTo, null);
    assert.match(members[0]?.effectiveFrom ?? '', /Z$/);

    for (const entry of members) {
      assert.deepEqual(
        Object.keys(entry).sort(),
        ['displayName', 'effectiveFrom', 'effectiveTo', 'membershipId', 'principalId', 'roleCode'].sort(),
      );
    }
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('read boundary rejects a stale exact actor membership handle', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const reader = new PgCurrentHouseholdMembershipReader();

  const household = 'e2000000-0000-4000-8000-000000000001';
  const actor = 'e2000000-0000-4000-8000-000000000011';
  const membership = 'e2000000-0000-4000-8000-000000000021';

  try {
    await seedRole(adminPool);
    await adminPool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'Stale Actor')`,
      [actor],
    );
    await adminPool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'Stale Household')`,
      [household],
    );
    await adminPool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::text, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [membership, household, actor, ROLE],
    );

    await database.withAuthorizedHouseholdTransaction(
      PrincipalId(actor),
      HouseholdId(household),
      async (transaction) => {
        await adminPool.query(
          `update fridge.household_membership
              set effective_to = clock_timestamp()
            where membership_id = $1::uuid`,
          [membership],
        );
        await assert.rejects(
          reader.readCurrentHouseholdMembers(transaction),
          HouseholdMembershipReadAuthorizationError,
        );
      },
    );
  } finally {
    await database.close();
    await adminPool.end();
  }
});
