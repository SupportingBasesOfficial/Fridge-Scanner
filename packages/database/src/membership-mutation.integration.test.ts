import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  ConflictError,
  HouseholdId,
  HouseholdMembershipId,
  InvalidInputError,
  PrincipalId,
} from '@fridge/application';
import {
  HouseholdAuthorizationError,
  PgDatabase,
} from './index.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

const HOUSEHOLD_A = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const PRINCIPAL_A = PrincipalId('11111111-1111-4111-8111-111111111111');
const PRINCIPAL_B = PrincipalId('22222222-2222-4222-8222-222222222222');
const PRINCIPAL_BE03_ADMIN = PrincipalId('33333333-3333-4333-8333-333333333333');
const ADDED_MEMBERSHIP = HouseholdMembershipId('44444444-aaaa-4444-8444-444444444444');
const DUPLICATE_MEMBERSHIP = HouseholdMembershipId('55555555-aaaa-4555-8555-555555555555');
const UNKNOWN_TARGET_MEMBERSHIP = HouseholdMembershipId('66666666-aaaa-4666-8666-666666666666');
const UNKNOWN_TARGET = PrincipalId('99999999-9999-4999-8999-999999999999');

const SECOND_ADMIN = PrincipalId('77777777-7777-4777-8777-777777777777');
const SECOND_ADMIN_MEMBERSHIP = HouseholdMembershipId('77777777-aaaa-4777-8777-777777777777');
const CONCURRENT_TARGET = PrincipalId('88888888-8888-4888-8888-888888888888');
const CONCURRENT_MEMBERSHIP_A = HouseholdMembershipId('88888888-aaaa-4888-8888-aaaaaaaaaaaa');
const CONCURRENT_MEMBERSHIP_B = HouseholdMembershipId('88888888-bbbb-4888-8888-bbbbbbbbbbbb');

const FUTURE_ENDED_TARGET = PrincipalId('aaaaaaaa-7777-4777-8777-aaaaaaaaaaaa');
const FUTURE_ENDED_MEMBERSHIP = HouseholdMembershipId('aaaaaaaa-7777-4777-8777-bbbbbbbbbbbb');
const OVERLAP_ATTEMPT_MEMBERSHIP = HouseholdMembershipId('aaaaaaaa-7777-4777-8777-cccccccccccc');

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for membership mutation integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for membership mutation integration tests');
}

async function addMember(
  database: PgDatabase,
  actor: ReturnType<typeof PrincipalId>,
  membershipId: ReturnType<typeof HouseholdMembershipId>,
  target: ReturnType<typeof PrincipalId>,
  roleCode = 'MEMBER',
): Promise<void> {
  await database.withHouseholdMembershipAdministrationTransaction(
    actor,
    HOUSEHOLD_A,
    (transaction) =>
      database.addHouseholdMember(transaction, {
        membershipId,
        targetPrincipalId: target,
        roleCode,
      }),
  );
}

test('governed administrator adds an existing principal with durable actor provenance', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    await addMember(database, PRINCIPAL_BE03_ADMIN, ADDED_MEMBERSHIP, PRINCIPAL_B);

    const result = await adminPool.query<{
      household_id: string;
      user_id: string;
      role_code: string;
      lifecycle_status: string;
      effective_from: Date;
      effective_to: Date | null;
      created_by_user_id: string | null;
    }>(
      `select household_id::text,
              user_id::text,
              role_code,
              lifecycle_status,
              effective_from,
              effective_to,
              created_by_user_id::text
         from fridge.household_membership
        where membership_id = $1::uuid`,
      [ADDED_MEMBERSHIP],
    );

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0]?.household_id, HOUSEHOLD_A);
    assert.equal(result.rows[0]?.user_id, PRINCIPAL_B);
    assert.equal(result.rows[0]?.role_code, 'MEMBER');
    assert.equal(result.rows[0]?.lifecycle_status, 'ACTIVE');
    assert.ok(result.rows[0]?.effective_from instanceof Date);
    assert.equal(result.rows[0]?.effective_to, null);
    assert.equal(result.rows[0]?.created_by_user_id, PRINCIPAL_BE03_ADMIN);
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('duplicate current membership becomes a deterministic conflict without a second open interval', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    await assert.rejects(
      addMember(database, PRINCIPAL_BE03_ADMIN, DUPLICATE_MEMBERSHIP, PRINCIPAL_B),
      ConflictError,
    );

    const result = await adminPool.query<{ count: string }>(
      `select count(*)::text as count
         from fridge.household_membership
        where household_id = $1::uuid
          and user_id = $2::uuid
          and effective_to is null`,
      [HOUSEHOLD_A, PRINCIPAL_B],
    );

    assert.equal(result.rows[0]?.count, '1');
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('two administrators racing to add the same principal converge on one current membership', async () => {
  const databaseA = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const databaseB = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    await adminPool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE03 Second Admin'), ($2::uuid, 'BE03 Concurrent Target')`,
      [SECOND_ADMIN, CONCURRENT_TARGET],
    );
    await adminPool.query(
      `insert into fridge.household_membership (
         membership_id,
         household_id,
         user_id,
         role_code,
         lifecycle_status,
         effective_from,
         effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, 'BE03_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [SECOND_ADMIN_MEMBERSHIP, HOUSEHOLD_A, SECOND_ADMIN],
    );

    const outcomes = await Promise.allSettled([
      addMember(
        databaseA,
        PRINCIPAL_BE03_ADMIN,
        CONCURRENT_MEMBERSHIP_A,
        CONCURRENT_TARGET,
      ),
      addMember(
        databaseB,
        SECOND_ADMIN,
        CONCURRENT_MEMBERSHIP_B,
        CONCURRENT_TARGET,
      ),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(
      rejected[0]?.status === 'rejected' && rejected[0].reason instanceof ConflictError,
    );

    const current = await adminPool.query<{ count: string }>(
      `select count(*)::text as count
         from fridge.household_membership
        where household_id = $1::uuid
          and user_id = $2::uuid
          and lifecycle_status = 'ACTIVE'
          and effective_from <= statement_timestamp()
          and (effective_to is null or effective_to > statement_timestamp())`,
      [HOUSEHOLD_A, CONCURRENT_TARGET],
    );
    assert.equal(current.rows[0]?.count, '1');
  } finally {
    await adminPool.end();
    await databaseA.close();
    await databaseB.close();
  }
});

test('add rejects a membership interval that is still effective even when effective_to is already non-null', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    await adminPool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE03 Future-ended Target')`,
      [FUTURE_ENDED_TARGET],
    );
    await adminPool.query(
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
         'MEMBER',
         'ACTIVE',
         clock_timestamp() - interval '1 hour',
         clock_timestamp() + interval '1 hour'
       )`,
      [FUTURE_ENDED_MEMBERSHIP, HOUSEHOLD_A, FUTURE_ENDED_TARGET],
    );

    await assert.rejects(
      addMember(
        database,
        PRINCIPAL_BE03_ADMIN,
        OVERLAP_ATTEMPT_MEMBERSHIP,
        FUTURE_ENDED_TARGET,
      ),
      ConflictError,
    );

    const current = await adminPool.query<{ count: string }>(
      `select count(*)::text as count
         from fridge.household_membership
        where household_id = $1::uuid
          and user_id = $2::uuid
          and lifecycle_status = 'ACTIVE'
          and effective_from <= statement_timestamp()
          and (effective_to is null or effective_to > statement_timestamp())`,
      [HOUSEHOLD_A, FUTURE_ENDED_TARGET],
    );
    assert.equal(current.rows[0]?.count, '1');
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('ordinary current member cannot execute the add-member mutation', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });

  try {
    await assert.rejects(
      addMember(database, PRINCIPAL_A, DUPLICATE_MEMBERSHIP, PRINCIPAL_B),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});

test('unknown target principal fails through provider-neutral application semantics', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });

  try {
    await assert.rejects(
      addMember(
        database,
        PRINCIPAL_BE03_ADMIN,
        UNKNOWN_TARGET_MEMBERSHIP,
        UNKNOWN_TARGET,
      ),
      InvalidInputError,
    );
  } finally {
    await database.close();
  }
});
