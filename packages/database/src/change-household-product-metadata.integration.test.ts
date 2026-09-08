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
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE05 Metadata Admin'), ($2::uuid, 'BE05 Metadata Ordinary')`, [ADMIN, ORDINARY]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE05 Metadata Household'), ($2::uuid, 'BE05 Metadata Foreign')`, [HOUSEHOLD, FOREIGN_HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ($1, 'BE05 metadata admin'), ($2, 'BE05 metadata member')`, [ADMIN_ROLE, ORDINARY_ROLE]);
    await pool.query(`insert into fridge.household_role_capability (role_code, capability_code) values ($1, 'HOUSEHOLD_CATALOG_ADMINISTER')`, [ADMIN_ROLE]);
    await pool.query(
      `insert into fridge.household_membership (membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to)
       values ($1::uuid,$3::uuid,$4::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null),
              ($2::uuid,$3::uuid,$5::uuid,$7,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY, ADMIN_ROLE, ORDINARY_ROLE],
    );
    await pool.query(`insert into fridge.brand (brand_id, canonical_name, lifecycle_status) values ($1::uuid,'Active Brand','ACTIVE'),($2::uuid,'Retired Brand','RETIRED')`, [BRAND, RETIRED_BRAND]);
    await pool.query(`insert into fridge.manufacturer (manufacturer_id, canonical_name, lifecycle_status) values ($1::uuid,'Active Manufacturer','ACTIVE')`, [MANUFACTURER]);
    await pool.query(`insert into fridge.product_category (product_category_id, canonical_name, lifecycle_status) values ($1::uuid,'Dairy','ACTIVE')`, [CATEGORY]);
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
  await creator(database, productId).execute({ commandId, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, canonicalName: 'Original Product' });
}

test('changes only metadata while preserving Product identity/scope/owner', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('e5e51111-0b05-4e11-8b05-000000000011');
  try {
    await createProduct(database, productId, CommandId('e5e51212-0b05-4e12-8b05-000000000012'));
    const result = await changer(database).execute({
      commandId: CommandId('e5e51313-0b05-4e13-8b05-000000000013'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD, productId,
      canonicalName: 'Whole Milk 1L', brandId: BRAND, manufacturerId: MANUFACTURER, productCategoryId: CATEGORY,
    });
    assert.equal(result.productId, productId);
    const row = (await admin.query(`select catalog_scope::text, owner_household_id::text, canonical_name, brand_id::text, manufacturer_id::text, product_category_id::text, lifecycle_status from fridge.product where product_id=$1::uuid`, [productId])).rows[0];
    assert.deepEqual(row, { catalog_scope: 'HOUSEHOLD', owner_household_id: HOUSEHOLD, canonical_name: 'Whole Milk 1L', brand_id: BRAND, manufacturer_id: MANUFACTURER, product_category_id: CATEGORY, lifecycle_status: 'ACTIVE' });
  } finally { await database.close(); await admin.end(); }
});

test('committed replay is non-restoring and cross-intent reuse conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('e5e52121-0b05-4e21-8b05-000000000021');
  const createCommand = CommandId('e5e52222-0b05-4e22-8b05-000000000022');
  const changeCommand = CommandId('e5e52323-0b05-4e23-8b05-000000000023');
  try {
    await createProduct(database, productId, createCommand);
    await changer(database).execute({ commandId: changeCommand, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, productId, canonicalName: 'Committed Name', brandId: BRAND, manufacturerId: null, productCategoryId: null });
    await admin.query(`update fridge.product set canonical_name='Later State', lifecycle_status='RETIRED', brand_id=null where product_id=$1::uuid`, [productId]);
    const replay = await changer(database).execute({ commandId: changeCommand, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, productId, canonicalName: 'Committed Name', brandId: BRAND, manufacturerId: null, productCategoryId: null });
    assert.equal(replay.productId, productId);
    const row = (await admin.query(`select canonical_name,lifecycle_status,brand_id::text from fridge.product where product_id=$1::uuid`, [productId])).rows[0];
    assert.deepEqual(row, { canonical_name: 'Later State', lifecycle_status: 'RETIRED', brand_id: null });
    await assert.rejects(changer(database).execute({ commandId: createCommand, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, productId, canonicalName: 'Cross Intent', brandId: null, manufacturerId: null, productCategoryId: null }), IdempotencyConflictError);
  } finally { await database.close(); await admin.end(); }
});

test('retired global reference is rejected without Product mutation', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('e5e53131-0b05-4e31-8b05-000000000031');
  try {
    await createProduct(database, productId, CommandId('e5e53232-0b05-4e32-8b05-000000000032'));
    await assert.rejects(changer(database).execute({ commandId: CommandId('e5e53333-0b05-4e33-8b05-000000000033'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD, productId, canonicalName: 'Rejected', brandId: RETIRED_BRAND, manufacturerId: null, productCategoryId: null }), InvalidInputError);
    const row = (await admin.query(`select canonical_name,brand_id::text from fridge.product where product_id=$1::uuid`, [productId])).rows[0];
    assert.deepEqual(row, { canonical_name: 'Original Product', brand_id: null });
  } finally { await database.close(); await admin.end(); }
});

test('foreign, GLOBAL, retired and missing targets collapse to NotFound', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const targets = [
    ProductId('e5e54141-0b05-4e41-8b05-000000000041'),
    ProductId('e5e54242-0b05-4e42-8b05-000000000042'),
    ProductId('e5e54343-0b05-4e43-8b05-000000000043'),
    ProductId('e5e54444-0b05-4e44-8b05-000000000044'),
  ];
  const commands = [
    CommandId('e5e55151-0b05-4e51-8b05-000000000051'),
    CommandId('e5e55252-0b05-4e52-8b05-000000000052'),
    CommandId('e5e55353-0b05-4e53-8b05-000000000053'),
    CommandId('e5e55454-0b05-4e54-8b05-000000000054'),
  ];
  try {
    await admin.query(`insert into fridge.product (product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status) values ($1::uuid,'HOUSEHOLD',$4::uuid,'Foreign','ACTIVE'),($2::uuid,'GLOBAL',null,'Global','ACTIVE'),($3::uuid,'HOUSEHOLD',$5::uuid,'Retired','RETIRED')`, [targets[0], targets[1], targets[2], FOREIGN_HOUSEHOLD, HOUSEHOLD]);
    for (let i = 0; i < targets.length; i += 1) {
      await assert.rejects(changer(database).execute({ commandId: commands[i]!, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, productId: targets[i]!, canonicalName: 'Hidden', brandId: null, manufacturerId: null, productCategoryId: null }), NotFoundError);
    }
  } finally { await database.close(); await admin.end(); }
});

test('ordinary member cannot change private Product metadata', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const productId = ProductId('e5e56161-0b05-4e61-8b05-000000000061');
  try {
    await createProduct(database, productId, CommandId('e5e56262-0b05-4e62-8b05-000000000062'));
    await assert.rejects(changer(database).execute({ commandId: CommandId('e5e56363-0b05-4e63-8b05-000000000063'), actorPrincipalId: ORDINARY, householdId: HOUSEHOLD, productId, canonicalName: 'Unauthorized', brandId: null, manufacturerId: null, productCategoryId: null }), HouseholdAuthorizationError);
  } finally { await database.close(); }
});
