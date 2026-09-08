import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  BrandId,
  ChangeHouseholdProductMetadataUseCase,
  CommandId,
  CreateHouseholdProductUseCase,
  HouseholdId,
  IdempotencyConflictError,
  InvalidInputError,
  ManufacturerId,
  NotFoundError,
  PrincipalId,
  ProductCategoryId,
  ProductId,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdProductWriter } from './create-household-product.js';
import { PgHouseholdProductMetadataChanger } from './change-household-product-metadata.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('e5e50101-0b05-4e01-8b05-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('e5e50102-0b05-4e01-8b05-000000000002');
const ADMIN = PrincipalId('e5e50202-0b05-4e02-8b05-000000000002');
const ORDINARY = PrincipalId('e5e50303-0b05-4e03-8b05-000000000003');
const ADMIN_MEMBERSHIP = 'e5e50404-0b05-4e04-8b05-000000000004';
const ORDINARY_MEMBERSHIP = 'e5e50505-0b05-4e05-8b05-000000000005';
const ADMIN_ROLE = 'BE05_PRODUCT_METADATA_ADMIN';
const ORDINARY_ROLE = 'BE05_PRODUCT_METADATA_MEMBER';
const BRAND = BrandId('e5e50606-0b05-4e06-8b05-000000000006');
const MANUFACTURER = ManufacturerId('e5e50707-0b05-4e07-8b05-000000000007');
const CATEGORY = ProductCategoryId('e5e50808-0b05-4e08-8b05-000000000008');
const RETIRED_BRAND = BrandId('e5e50909-0b05-4e09-8b05-000000000009');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Metadata Admin'), ($2::uuid, 'BE05 Metadata Ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 Metadata Household'), ($2::uuid, 'BE05 Metadata Foreign')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE05 metadata admin'), ($2, 'BE05 metadata member')`,
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
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY, ADMIN_ROLE, ORDINARY_ROLE],
    );
    await pool.query(
      `insert into fridge.brand (brand_id, canonical_name, lifecycle_status)
       values ($1::uuid, 'Active Brand', 'ACTIVE'), ($2::uuid, 'Retired Brand', 'RETIRED')`,
      [BRAND, RETIRED_BRAND],
    );
    await pool.query(
      `insert into fridge.manufacturer (manufacturer_id, canonical_name, lifecycle_status)
       values ($1::uuid, 'Active Manufacturer', 'ACTIVE')`,
      [MANUFACTURER],
    );
    await pool.query(
      `insert into fridge.product_category (product_category_id, canonical_name, lifecycle_status)
       values ($1::uuid, 'Dairy', 'ACTIVE')`,
      [CATEGORY],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function changer(database: PgDatabase): ChangeHouseholdProductMetadataUseCase {
  return new ChangeHouseholdProductMetadataUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdProductMetadataChanger(),
  );
}

function creator(database: PgDatabase, candidate: ProductId): CreateHouseholdProductUseCase {
  return new CreateHouseholdProductUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdProductWriter(),
    { generate: () => candidate },
  );
}

async function createProduct(database: PgDatabase, productId: ProductId, commandId: CommandId): Promise<void> {
  await creator(database, productId).execute({
    commandId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    canonicalName: 'Original Product',
  });
}

test('catalog administrator changes only metadata of a current Household Product', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('e5e51111-0b05-4e11-8b05-000000000011');
  try {
    await createProduct(database, productId, CommandId('e5e51212-0b05-4e12-8b05-000000000012'));
    const result = await changer(database).execute({
      commandId: CommandId('e5e51313-0b05-4e13-8b05-000000000013'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      productId,
      canonicalName: 'Whole Milk 1L',
      brandId: BRAND,
      manufacturerId: MANUFACTURER,
      productCategoryId: CATEGORY,
    });
    assert.equal(result.productId, productId);

    const observed = await admin.query<{
      catalog_scope: string;
      owner_household_id: string;
      canonical_name: string;
      brand_id: string;
      manufacturer_id: string;
      product_category_id: string;
      lifecycle_status: string;
      intent_code: string;
    }>(
      `select p.catalog_scope::text, p.owner_household_id::text, p.canonical_name,
              p.brand_id::text, p.manufacturer_id::text, p.product_category_id::text,
              p.lifecycle_status, r.intent_code
         from fridge.product p
         join fridge.household_product_metadata_change_command c on c.product_id = p.product_id
         join fridge.household_catalog_command_registry r
           on r.household_id = c.household_id and r.command_id = c.command_id
        where p.product_id = $1::uuid`,
      [productId],
    );
    assert.deepEqual(observed.rows[0], {
      catalog_scope: 'HOUSEHOLD',
      owner_household_id: HOUSEHOLD,
      canonical_name: 'Whole Milk 1L',
      brand_id: BRAND,
      manufacturer_id: MANUFACTURER,
      product_category_id: CATEGORY,
      lifecycle_status: 'ACTIVE',
      intent_code: 'CHANGE_HOUSEHOLD_PRODUCT_METADATA',
    });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('committed metadata replay does not restore later Product state', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('e5e52121-0b05-4e21-8b05-000000000021');
  const commandId = CommandId('e5e52222-0b05-4e22-8b05-000000000022');
  try {
    await createProduct(database, productId, CommandId('e5e52323-0b05-4e23-8b05-000000000023'));
    await changer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      productId,
      canonicalName: 'Committed Name',
      brandId: BRAND,
      manufacturerId: null,
      productCategoryId: null,
    });
    await admin.query(
      `update fridge.product
          set canonical_name = 'Later Historical State', lifecycle_status = 'RETIRED', brand_id = null
        where product_id = $1::uuid`,
      [productId],
    );
    const replay = await changer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      productId,
      canonicalName: 'Committed Name',
      brandId: BRAND,
      manufacturerId: null,
      productCategoryId: null,
    });
    assert.equal(replay.productId, productId);
    const state = await admin.query<{ canonical_name: string; lifecycle_status: string; brand_id: string | null }>(
      `select canonical_name, lifecycle_status, brand_id::text from fridge.product where product_id = $1::uuid`,
      [productId],
    );
    assert.deepEqual(state.rows[0], {
      canonical_name: 'Later Historical State',
      lifecycle_status: 'RETIRED',
      brand_id: null,
    });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('shared Household catalog CommandId rejects cross-intent reuse', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const productId = ProductId('e5e53131-0b05-4e31-8b05-000000000031');
  const commandId = CommandId('e5e53232-0b05-4e32-8b05-000000000032');
  try {
    await createProduct(database, productId, commandId);
    await assert.rejects(
      changer(database).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        productId,
        canonicalName: 'Changed',
        brandId: null,
        manufacturerId: null,
        productCategoryId: null,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('retired global reference is rejected without mutating Product', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('e5e54141-0b05-4e41-8b05-000000000041');
  try {
    await createProduct(database, productId, CommandId('e5e54242-0b05-4e42-8b05-000000000042'));
    await assert.rejects(
      changer(database).execute({
        commandId: CommandId('e5e54343-0b05-4e43-8b05-000000000043'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        productId,
        canonicalName: 'Should Not Commit',
        brandId: RETIRED_BRAND,
        manufacturerId: null,
        productCategoryId: null,
      }),
      InvalidInputError,
    );
    const state = await admin.query<{ canonical_name: string; brand_id: string | null }>(
      `select canonical_name, brand_id::text from fridge.product where product_id = $1::uuid`,
      [productId],
    );
    assert.deepEqual(state.rows[0], { canonical_name: 'Original Product', brand_id: null });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('foreign, GLOBAL, retired and missing Products collapse to NotFound', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const foreign = ProductId('e5e55151-0b05-4e51-8b05-000000000051');
  const global = ProductId('e5e55252-0b05-4e52-8b05-000000000052');
  const retired = ProductId('e5e55353-0b05-4e53-8b05-000000000053');
  const missing = ProductId('e5e55454-0b05-4e54-8b05-000000000054');
  try {
    await admin.query(
      `insert into fridge.product (product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status)
       values
         ($1::uuid, 'HOUSEHOLD', $4::uuid, 'Foreign Product', 'ACTIVE'),
         ($2::uuid, 'GLOBAL', null, 'Global Product', 'ACTIVE'),
         ($3::uuid, 'HOUSEHOLD', $5::uuid, 'Retired Product', 'RETIRED')`,
      [foreign, global, retired, FOREIGN_HOUSEHOLD, HOUSEHOLD],
    );
    for (const [index, productId] of [foreign, global, retired, missing].entries()) {
      await assert.rejects(
        changer(database).execute({
          commandId: CommandId(`e5e56${index}6-0b05-4e56-8b05-00000000006${index}`),
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          productId,
          canonicalName: 'Hidden Change',
          brandId: null,
          manufacturerId: null,
          productCategoryId: null,
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
    await admin.end();
  }
});

test('ordinary current Household member cannot change private Product metadata', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const productId = ProductId('e5e57171-0b05-4e71-8b05-000000000071');
  try {
    await createProduct(database, productId, CommandId('e5e57272-0b05-4e72-8b05-000000000072'));
    await assert.rejects(
      changer(database).execute({
        commandId: CommandId('e5e57373-0b05-4e73-8b05-000000000073'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        productId,
        canonicalName: 'Unauthorized Change',
        brandId: null,
        manufacturerId: null,
        productCategoryId: null,
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});
