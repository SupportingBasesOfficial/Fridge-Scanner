import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool, type PoolClient } from 'pg';

const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

const HOUSEHOLD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN_A = 'c1111111-1111-4111-8111-111111111111';
const ADMIN_B = 'c2222222-2222-4222-8222-222222222222';
const MEMBER = 'c3333333-3333-4333-8333-333333333333';
const ADMIN_A_MEMBERSHIP = 'c1111111-aaaa-4111-8111-111111111111';
const ADMIN_B_MEMBERSHIP = 'c2222222-aaaa-4222-8222-222222222222';
const MEMBER_MEMBERSHIP = 'c3333333-aaaa-4333-8333-333333333333';

if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for membership survivability integration tests');
}

async function beginHouseholdTransaction(client: PoolClient): Promise<void> {
  await client.query('begin');
  await client.query("select set_config('fridge.household_id', $1, true)", [HOUSEHOLD]);
}

async function survivabilityAllows(
  client: PoolClient,
  membershipId: string,
  resultRoleCode: string | null,
): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    `select fridge_internal.household_membership_survivability_allows(
       $1::uuid,
       $2::uuid,
       $3::text
     ) as allowed`,
    [HOUSEHOLD, membershipId, resultRoleCode],
  );
  return result.rows[0]?.allowed ?? false;
}

test('last-administrator survivability is semantic and serialized on the Household row', async () => {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 4 });

  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values
         ($1::uuid, 'BE03 Survivability Admin A'),
         ($2::uuid, 'BE03 Survivability Admin B'),
         ($3::uuid, 'BE03 Survivability Member')`,
      [ADMIN_A, ADMIN_B, MEMBER],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE03 Survivability Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,
         household_id,
         user_id,
         role_code,
         lifecycle_status,
         effective_from,
         effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE03_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_A_MEMBERSHIP, MEMBER_MEMBERSHIP, HOUSEHOLD, ADMIN_A, MEMBER],
    );

    const semanticClient = await pool.connect();
    try {
      await beginHouseholdTransaction(semanticClient);

      assert.equal(
        await survivabilityAllows(semanticClient, ADMIN_A_MEMBERSHIP, null),
        false,
        'ending the only current administrator must fail survivability',
      );
      assert.equal(
        await survivabilityAllows(semanticClient, ADMIN_A_MEMBERSHIP, 'MEMBER'),
        false,
        'demoting the only current administrator must fail survivability',
      );
      assert.equal(
        await survivabilityAllows(semanticClient, ADMIN_A_MEMBERSHIP, 'BE03_ADMIN'),
        true,
        'a role transition that retains administration capability must pass',
      );
      assert.equal(
        await survivabilityAllows(semanticClient, MEMBER_MEMBERSHIP, null),
        true,
        'ending a non-administrator does not reduce administration survivability',
      );

      await semanticClient.query('rollback');
    } finally {
      semanticClient.release();
    }

    await pool.query(
      `insert into fridge.household_membership (
         membership_id,
         household_id,
         user_id,
         role_code,
         lifecycle_status,
         effective_from,
         effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, 'BE03_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_B_MEMBERSHIP, HOUSEHOLD, ADMIN_B],
    );

    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await beginHouseholdTransaction(first);
      assert.equal(
        await survivabilityAllows(first, ADMIN_A_MEMBERSHIP, null),
        true,
        'one administrator may be removed while another current administrator remains',
      );

      await beginHouseholdTransaction(second);
      await second.query("set local lock_timeout = '200ms'");

      await assert.rejects(
        survivabilityAllows(second, ADMIN_B_MEMBERSHIP, null),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, '55P03');
          return true;
        },
        'a competing authority-reducing mutation must wait on the Household serialization anchor',
      );
      await second.query('rollback');

      await first.query('rollback');
    } finally {
      first.release();
      second.release();
    }
  } finally {
    await pool.end();
  }
});
