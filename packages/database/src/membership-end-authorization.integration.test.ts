import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { HouseholdId, PrincipalId } from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL || !ADMIN_DATABASE_URL) {
  throw new Error('database URLs are required for membership end authorization integration test');
}

test('ordinary member cannot acquire administrative membership-end authority', async () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const household = 'd5000000-0000-4000-8000-000000000001';
  const member = 'd5000000-0000-4000-8000-000000000011';
  const membership = 'd5000000-0000-4000-8000-000000000021';
  const role = 'TEST_END_NONADMIN';

  try {
    await adminPool.query(
      `insert into fridge.household_role (role_code, display_name, is_assignable, lifecycle_status)
       values ($1::text, 'BE03 End Nonadmin', true, 'ACTIVE')
       on conflict (role_code) do nothing`,
      [role],
    );
    await adminPool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE03 End Nonadmin')`,
      [member],
    );
    await adminPool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE03 End Authorization Household')`,
      [household],
    );
    await adminPool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::text, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [membership, household, member, role],
    );

    await assert.rejects(
      database.withHouseholdMembershipAdministrationTransaction(
        PrincipalId(member),
        HouseholdId(household),
        async () => undefined,
      ),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
    await adminPool.end();
  }
});
