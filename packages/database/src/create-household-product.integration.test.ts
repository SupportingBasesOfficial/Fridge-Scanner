import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CreateHouseholdProductUseCase,
  HouseholdId,
  IdempotencyConflictError,
  PrincipalId,
  ProductId,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdProductWriter } from './create-household-product.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for CreateHouseholdProduct integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for CreateHouseholdProduct integration tests');
}

const HOUSEHOLD = HouseholdId('c5c40101-0b05-4c01-8b05-000000000001');
const ADMIN = PrincipalId('c5c40202-0b05-4c02-8b05-000000000002');
const ORDINARY = PrincipalId('c5c40303-0b05-4c03-8b05-000000000003');
const ADMIN_MEMBERSHIP = 'c5c40404-0b05-4c04-8b05-000000000004';
const ORDINARY_MEMBERSHIP = 'c5c40505-0b05-4c05-8b05-000000000005';
const ADMIN_ROLE = 'BE05_CREATE_PRODUCT_ADMIN';
const ORDINARY_ROLE = 'BE05_CREATE_PRODUCT_MEMBER';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Product Admin'), ($2::uuid, 'BE05 Product Ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 Product Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE05 Product administrator'), ($2, 'BE05 Product ordinary member')`,
      [ADMIN_ROLE, ORDINARY_ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ($1, 'HOUSEHOLD_CATALOG_ADMINISTER')`,
      [ADMIN_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, $6, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, $7, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [
        ADMIN_MEMBERSHIP,
        ORDINARY_MEMBERSHIP,
        HOUSEHOLD,
        ADMIN,
        ORDINARY,
        ADMIN_ROLE,
        ORDINARY_ROLE,
      ],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function createUseCase(database: PgDatabase, candidateProductId: ProductId): CreateHouseholdProductUseCase {
  return new CreateHouseholdProductUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdProductWriter(),
    { generate: () => candidateProductId },
  );
}

test('catalog administrator creates exactly one Household-owned Product with durable intent provenance', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('c5c41111-0b05-4c11-8b05-000000000011');
  const candidateId = ProductId('c5c41212-0b05-4c12-8b05-000000000012');

  try {
    const result = await createUseCase(database, candidateId).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      canonicalName: 'Whole Milk',
    });
    assert.equal(result.productId, candidateId);

    const observed = await adminPool.query<{
      catalog_scope: string;
      owner_household_id: string | null;
      canonical_name: string;
      brand_id: string | null;
      manufacturer_id: string | null;
      product_category_id: string | null;
      lifecycle_status: string;
      intent_code: string;
      actor_user_id: string;
      result_product_id: string | null;
    }>(
      `select p.catalog_scope::text,
              p.owner_household_id::text,
              p.canonical_name,
              p.brand_id::text,
              p.manufacturer_id::text,
              p.product_category_id::text,
              p.lifecycle_status,
              r.intent_code,
              c.actor_user_id::text,
              c.result_product_id::text
         from fridge.product p
         join fridge.household_product_create_command c
           on c.result_product_id = p.product_id
         join fridge.household_catalog_command_registry r
           on r.household_id = c.household_id
          and r.command_id = c.command_id
        where p.product_id = $1::uuid`,
      [candidateId],
    );

    assert.deepEqual(observed.rows[0], {
      catalog_scope: 'HOUSEHOLD',
      owner_household_id: HOUSEHOLD,
      canonical_name: 'Whole Milk',
      brand_id: null,
      manufacturer_id: null,
      product_category_id: null,
      lifecycle_status: 'ACTIVE',
      intent_code: 'CREATE_HOUSEHOLD_PRODUCT',
      actor_user_id: ADMIN,
      result_product_id: candidateId,
    });
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('committed retry ignores a new internal candidate and does not restore later Product state', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('c5c42121-0b05-4c21-8b05-000000000021');
  const firstCandidate = ProductId('c5c42222-0b05-4c22-8b05-000000000022');
  const retryCandidate = ProductId('c5c42323-0b05-4c23-8b05-000000000023');

  try {
    const first = await createUseCase(database, firstCandidate).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      canonicalName: 'Greek Yogurt',
    });
    assert.equal(first.productId, firstCandidate);

    await adminPool.query(
      `update fridge.product
          set canonical_name = 'Historical Renamed Yogurt',
              lifecycle_status = 'RETIRED'
        where product_id = $1::uuid`,
      [firstCandidate],
    );

    const replay = await createUseCase(database, retryCandidate).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      canonicalName: 'Greek Yogurt',
    });
    assert.equal(replay.productId, firstCandidate);

    const state = await adminPool.query<{
      canonical_name: string;
      lifecycle_status: string;
      retry_candidate_count: string;
    }>(
      `select p.canonical_name,
              p.lifecycle_status,
              (select count(*)::text from fridge.product where product_id = $2::uuid) as retry_candidate_count
         from fridge.product p
        where p.product_id = $1::uuid`,
      [firstCandidate, retryCandidate],
    );
    assert.deepEqual(state.rows[0], {
      canonical_name: 'Historical Renamed Yogurt',
      lifecycle_status: 'RETIRED',
      retry_candidate_count: '0',
    });
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('divergent facts under one committed Household catalog CommandId conflict', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const commandId = CommandId('c5c43131-0b05-4c31-8b05-000000000031');

  try {
    await createUseCase(
      database,
      ProductId('c5c43232-0b05-4c32-8b05-000000000032'),
    ).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      canonicalName: 'Cheddar Cheese',
    });

    await assert.rejects(
      createUseCase(
        database,
        ProductId('c5c43333-0b05-4c33-8b05-000000000033'),
      ).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        canonicalName: 'Different Cheese',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('ordinary current Household member cannot create a private Product', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });

  try {
    await assert.rejects(
      createUseCase(
        database,
        ProductId('c5c44242-0b05-4c42-8b05-000000000042'),
      ).execute({
        commandId: CommandId('c5c44141-0b05-4c41-8b05-000000000041'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        canonicalName: 'Unauthorized Product',
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});
