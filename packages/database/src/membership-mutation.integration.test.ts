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
