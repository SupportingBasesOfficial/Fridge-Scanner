import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  GetCurrentProductUseCase,
  HouseholdId,
  ListCurrentProductsUseCase,
  NotFoundError,
  PrincipalId,
  ProductId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgCurrentProductReader } from './product-read.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('8c5a0101-0b05-4c01-8b05-000000000001');
const OTHER_HOUSEHOLD = HouseholdId('8c5a0202-0b05-4c02-8b05-000000000002');
const MEMBER = PrincipalId('8c5a0303-0b05-4c03-8b05-000000000003');
const MEMBERSHIP = '8c5a0404-0b05-4c04-8b05-000000000004';
const GLOBAL = ProductId('8c5a1111-0b05-4c11-8b05-000000000011');
const HOUSEHOLD_PRIVATE = ProductId('8c5a1212-0b05-4c12-8b05-000000000012');
const RETIRED = ProductId('8c5a1313-0b05-4c13-8b05-000000000013');
const FOREIGN = ProductId('8c5a1414-0b05-4c14-8b05-000000000014');
const MISSING = ProductId('8c5a1515-0b05-4c15-8b05-000000000015');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Product Read Member')`,
      [MEMBER],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 Product Read Household'),
              ($2::uuid, 'BE05 Product Read Foreign Household')`,
      [HOUSEHOLD, OTHER_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE05_PRODUCT_READ_MEMBER', 'BE05 ordinary Product reader')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'BE05_PRODUCT_READ_MEMBER',
         'ACTIVE', clock_timestamp() - interval '1 hour', null
       )`,
      [MEMBERSHIP, HOUSEHOLD, MEMBER],
    );
    await pool.query(
      `insert into fridge.product (
         product_id, catalog_scope, owner_household_id, canonical_name,
         lifecycle_status, created_at
       ) values
         ($1::uuid, 'GLOBAL', null, 'BE05 global product', 'ACTIVE', clock_timestamp() - interval '4 hours'),
         ($2::uuid, 'HOUSEHOLD', $5::uuid, 'BE05 local product', 'ACTIVE', clock_timestamp() - interval '3 hours'),
         ($3::uuid, 'HOUSEHOLD', $5::uuid, 'BE05 retired product', 'RETIRED', clock_timestamp() - interval '2 hours'),
         ($4::uuid, 'HOUSEHOLD', $6::uuid, 'BE05 foreign product', 'ACTIVE', clock_timestamp() - interval '1 hour')`,
      [GLOBAL, HOUSEHOLD_PRIVATE, RETIRED, FOREIGN, HOUSEHOLD, OTHER_HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('ordinary current member lists GLOBAL plus same-Household current Products without foreign private leakage', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const result = await new ListCurrentProductsUseCase(
      database,
      new PgCurrentProductReader(),
    ).execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD });

    const ids = result.products.map((product) => product.productId);
    assert.ok(ids.includes(GLOBAL));
    assert.ok(ids.includes(HOUSEHOLD_PRIVATE));
    assert.ok(!ids.includes(RETIRED));
    assert.ok(!ids.includes(FOREIGN));
    assert.deepEqual(ids, [...ids].sort());

    const global = result.products.find((product) => product.productId === GLOBAL);
    const local = result.products.find((product) => product.productId === HOUSEHOLD_PRIVATE);
    assert.equal(global?.catalogScope, 'GLOBAL');
    assert.equal(global?.ownerHouseholdId, null);
    assert.equal(local?.catalogScope, 'HOUSEHOLD');
    assert.equal(local?.ownerHouseholdId, HOUSEHOLD);
  } finally {
    await database.close();
  }
});

test('GetCurrentProduct returns visible GLOBAL and same-Household Products', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new GetCurrentProductUseCase(database, new PgCurrentProductReader());
  try {
    const global = await useCase.execute({
      actorPrincipalId: MEMBER,
      householdId: HOUSEHOLD,
      productId: GLOBAL,
    });
    assert.equal(global.product.productId, GLOBAL);
    assert.equal(global.product.catalogScope, 'GLOBAL');

    const local = await useCase.execute({
      actorPrincipalId: MEMBER,
      householdId: HOUSEHOLD,
      productId: HOUSEHOLD_PRIVATE,
    });
    assert.equal(local.product.productId, HOUSEHOLD_PRIVATE);
    assert.equal(local.product.ownerHouseholdId, HOUSEHOLD);
  } finally {
    await database.close();
  }
});

test('GetCurrentProduct collapses missing, foreign private and non-current Products to NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new GetCurrentProductUseCase(database, new PgCurrentProductReader());
  try {
    for (const productId of [RETIRED, FOREIGN, MISSING]) {
      await assert.rejects(
        useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, productId }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('Product read boundary revalidates the exact membership after transaction authorization', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const reader = new PgCurrentProductReader();
  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(MEMBER, HOUSEHOLD, async (transaction) => {
        await adminPool.query(
          `update fridge.household_membership
              set lifecycle_status = 'ENDED', effective_to = clock_timestamp()
            where membership_id = $1::uuid`,
          [MEMBERSHIP],
        );
        await reader.listCurrentProducts(transaction);
      }),
      (error: unknown) => (error as { code?: string }).code === 'HOUSEHOLD_UNAUTHORIZED',
    );
  } finally {
    await adminPool.query(
      `update fridge.household_membership
          set lifecycle_status = 'ACTIVE', effective_to = null
        where membership_id = $1::uuid`,
      [MEMBERSHIP],
    );
    await adminPool.end();
    await database.close();
  }
});
