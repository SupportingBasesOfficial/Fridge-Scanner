import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  ConflictError,
  CreateHouseholdProductUseCase,
  HouseholdId,
  IdempotencyConflictError,
  NotFoundError,
  PrincipalId,
  ProductId,
  RetireHouseholdProductUseCase,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdProductWriter } from './create-household-product.js';
import { PgHouseholdProductRetirer } from './retire-household-product.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('f5c40101-0b05-4c01-8b05-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('f5c40102-0b05-4c01-8b05-000000000002');
const ADMIN = PrincipalId('f5c40202-0b05-4c02-8b05-000000000002');
const ORDINARY = PrincipalId('f5c40303-0b05-4c03-8b05-000000000003');
const ADMIN_MEMBERSHIP = 'f5c40404-0b05-4c04-8b05-000000000004';
const ORDINARY_MEMBERSHIP = 'f5c40505-0b05-4c05-8b05-000000000005';
const ADMIN_ROLE = 'BE05_RETIRE_PRODUCT_ADMIN';
const ORDINARY_ROLE = 'BE05_RETIRE_PRODUCT_MEMBER';
const RULE = 'f5c40606-0b05-4c06-8b05-000000000006';
const CONCEPT = 'f5c40707-0b05-4c07-8b05-000000000007';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Retire Admin'), ($2::uuid, 'BE05 Retire Ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 Retire Household'), ($2::uuid, 'BE05 Retire Foreign')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE05 retire admin'), ($2, 'BE05 retire ordinary')`,
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
      `insert into fridge.product_identifier_normalization_rule (
         normalization_rule_id, scheme_code, namespace_mode, issuer_namespace,
         rule_version, normalization_algorithm_code, normalization_algorithm_version,
         effective_from, lifecycle_status
       ) values ($1::uuid, 'LOCAL_SKU', 'ISSUER_SCOPED', 'BE05-RETIRE', 1, 'IDENTITY', '1',
                 clock_timestamp() - interval '1 day', 'ACTIVE')`,
      [RULE],
    );
    await pool.query(
      `insert into fridge.ingredient_concept (
         ingredient_concept_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status
       ) values ($1::uuid, 'HOUSEHOLD', $2::uuid, 'Milk concept', 'ACTIVE')`,
      [CONCEPT, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function creator(database: PgDatabase, productId: ProductId): CreateHouseholdProductUseCase {
  return new CreateHouseholdProductUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdProductWriter(),
    { generate: () => productId },
  );
}

function retirer(database: PgDatabase): RetireHouseholdProductUseCase {
  return new RetireHouseholdProductUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdProductRetirer(),
  );
}

async function createProduct(database: PgDatabase, productId: ProductId, commandId: CommandId): Promise<void> {
  await creator(database, productId).execute({
    commandId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    canonicalName: 'Retirable Product',
  });
}

test('catalog administrator retires Product while preserving historical dependencies', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('f5c41111-0b05-4c11-8b05-000000000011');
  const commandId = CommandId('f5c41212-0b05-4c12-8b05-000000000012');
  try {
    await createProduct(database, productId, CommandId('f5c41313-0b05-4c13-8b05-000000000013'));
    await admin.query(
      `insert into fridge.batch (batch_id, product_id, commercial_lot_code)
       values ('f5c41414-0b05-4c14-8b05-000000000014'::uuid, $1::uuid, 'HIST-LOT')`,
      [productId],
    );
    await admin.query(
      `insert into fridge.stock_item (
         stock_item_id, household_id, product_id, lifecycle_status,
         placement_anchor_kind, created_at, retired_at
       ) values (
         'f5c41515-0b05-4c15-8b05-000000000015'::uuid,
         $1::uuid, $2::uuid, 'RETIRED', 'UNPLACED',
         clock_timestamp() - interval '1 hour', clock_timestamp()
       )`,
      [HOUSEHOLD, productId],
    );
    await admin.query(
      `insert into fridge.product_identifier (
         product_identifier_id, product_id, scheme_code, issuer_namespace,
         source_value, normalized_value, normalization_rule_id,
         lifecycle_status, recorded_at, retired_at
       ) values (
         'f5c41616-0b05-4c16-8b05-000000000016'::uuid,
         $1::uuid, 'LOCAL_SKU', 'BE05-RETIRE', 'HIST', 'HIST', $2::uuid,
         'RETIRED', clock_timestamp() - interval '1 hour', clock_timestamp()
       )`,
      [productId, RULE],
    );
    await admin.query(
      `insert into fridge.product_ingredient_compatibility (
         compatibility_mapping_id, mapping_family_id, version_no, catalog_scope,
         owner_household_id, product_id, ingredient_concept_id,
         effective_from, effective_to, lifecycle_status
       ) values (
         'f5c41717-0b05-4c17-8b05-000000000017'::uuid,
         'f5c41818-0b05-4c18-8b05-000000000018'::uuid,
         1, 'HOUSEHOLD', $1::uuid, $2::uuid, $3::uuid,
         clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour', 'ACTIVE'
       )`,
      [HOUSEHOLD, productId, CONCEPT],
    );

    const output = await retirer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      productId,
    });
    assert.equal(output.productId, productId);

    const state = await admin.query<{
      lifecycle_status: string;
      intent_code: string;
      batch_count: string;
      retired_stock_count: string;
      retired_identifier_count: string;
      expired_compatibility_count: string;
    }>(
      `select p.lifecycle_status,
              r.intent_code,
              (select count(*)::text from fridge.batch where product_id = p.product_id) as batch_count,
              (select count(*)::text from fridge.stock_item where product_id = p.product_id and lifecycle_status = 'RETIRED') as retired_stock_count,
              (select count(*)::text from fridge.product_identifier where product_id = p.product_id and retired_at is not null) as retired_identifier_count,
              (select count(*)::text from fridge.product_ingredient_compatibility where product_id = p.product_id and effective_to < clock_timestamp()) as expired_compatibility_count
         from fridge.product p
         join fridge.household_product_retire_command c on c.product_id = p.product_id
         join fridge.household_catalog_command_registry r
           on r.household_id = c.household_id and r.command_id = c.command_id
        where p.product_id = $1::uuid`,
      [productId],
    );
    assert.deepEqual(state.rows[0], {
      lifecycle_status: 'RETIRED',
      intent_code: 'RETIRE_HOUSEHOLD_PRODUCT',
      batch_count: '1',
      retired_stock_count: '1',
      retired_identifier_count: '1',
      expired_compatibility_count: '1',
    });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('current StockItem blocks Product retirement without cascade', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('f5c42121-0b05-4c21-8b05-000000000021');
  try {
    await createProduct(database, productId, CommandId('f5c42222-0b05-4c22-8b05-000000000022'));
    await admin.query(
      `insert into fridge.stock_item (
         stock_item_id, household_id, product_id, lifecycle_status, placement_anchor_kind
       ) values ('f5c42323-0b05-4c23-8b05-000000000023'::uuid, $1::uuid, $2::uuid, 'ACTIVE', 'UNPLACED')`,
      [HOUSEHOLD, productId],
    );
    await assert.rejects(
      retirer(database).execute({
        commandId: CommandId('f5c42424-0b05-4c24-8b05-000000000024'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        productId,
      }),
      ConflictError,
    );
    const row = await admin.query<{ lifecycle_status: string; stock_status: string }>(
      `select p.lifecycle_status, s.lifecycle_status as stock_status
         from fridge.product p join fridge.stock_item s on s.product_id = p.product_id
        where p.product_id = $1::uuid`,
      [productId],
    );
    assert.deepEqual(row.rows[0], { lifecycle_status: 'ACTIVE', stock_status: 'ACTIVE' });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('current ProductIdentifier and non-ended compatibility each block retirement', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const identifierProduct = ProductId('f5c43131-0b05-4c31-8b05-000000000031');
  const compatibilityProduct = ProductId('f5c43232-0b05-4c32-8b05-000000000032');
  try {
    await createProduct(database, identifierProduct, CommandId('f5c43333-0b05-4c33-8b05-000000000033'));
    await createProduct(database, compatibilityProduct, CommandId('f5c43434-0b05-4c34-8b05-000000000034'));
    await admin.query(
      `insert into fridge.product_identifier (
         product_identifier_id, product_id, scheme_code, issuer_namespace,
         source_value, normalized_value, normalization_rule_id, lifecycle_status
       ) values ('f5c43535-0b05-4c35-8b05-000000000035'::uuid,
                 $1::uuid, 'LOCAL_SKU', 'BE05-RETIRE', 'CURR', 'CURR', $2::uuid, 'ACTIVE')`,
      [identifierProduct, RULE],
    );
    await admin.query(
      `insert into fridge.product_ingredient_compatibility (
         compatibility_mapping_id, mapping_family_id, version_no, catalog_scope,
         owner_household_id, product_id, ingredient_concept_id,
         effective_from, effective_to, lifecycle_status
       ) values (
         'f5c43636-0b05-4c36-8b05-000000000036'::uuid,
         'f5c43737-0b05-4c37-8b05-000000000037'::uuid,
         1, 'HOUSEHOLD', $1::uuid, $2::uuid, $3::uuid,
         clock_timestamp() - interval '1 hour', null, 'ACTIVE'
       )`,
      [HOUSEHOLD, compatibilityProduct, CONCEPT],
    );

    await assert.rejects(
      retirer(database).execute({
        commandId: CommandId('f5c43838-0b05-4c38-8b05-000000000038'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        productId: identifierProduct,
      }),
      ConflictError,
    );
    await assert.rejects(
      retirer(database).execute({
        commandId: CommandId('f5c43939-0b05-4c39-8b05-000000000039'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        productId: compatibilityProduct,
      }),
      ConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('committed retirement replay is non-restoring and cross-intent CommandId reuse conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const productId = ProductId('f5c44141-0b05-4c41-8b05-000000000041');
  const retireCommand = CommandId('f5c44242-0b05-4c42-8b05-000000000042');
  try {
    await createProduct(database, productId, CommandId('f5c44343-0b05-4c43-8b05-000000000043'));
    await retirer(database).execute({
      commandId: retireCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      productId,
    });
    await admin.query(`update fridge.product set canonical_name = 'Historical After Retirement' where product_id = $1::uuid`, [productId]);
    const replay = await retirer(database).execute({
      commandId: retireCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      productId,
    });
    assert.equal(replay.productId, productId);
    const state = await admin.query<{ canonical_name: string; lifecycle_status: string }>(
      `select canonical_name, lifecycle_status from fridge.product where product_id = $1::uuid`,
      [productId],
    );
    assert.deepEqual(state.rows[0], { canonical_name: 'Historical After Retirement', lifecycle_status: 'RETIRED' });

    const createIntentCommand = CommandId('f5c44444-0b05-4c44-8b05-000000000044');
    const another = ProductId('f5c44545-0b05-4c45-8b05-000000000045');
    await createProduct(database, another, createIntentCommand);
    await assert.rejects(
      retirer(database).execute({
        commandId: createIntentCommand,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        productId: another,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('foreign, GLOBAL, already-retired and missing Products collapse to NotFound; ordinary member is denied', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const foreign = ProductId('f5c45151-0b05-4c51-8b05-000000000051');
  const global = ProductId('f5c45252-0b05-4c52-8b05-000000000052');
  const retired = ProductId('f5c45353-0b05-4c53-8b05-000000000053');
  const missing = ProductId('f5c45454-0b05-4c54-8b05-000000000054');
  try {
    await admin.query(
      `insert into fridge.product (product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status)
       values
         ($1::uuid, 'HOUSEHOLD', $4::uuid, 'Foreign Product', 'ACTIVE'),
         ($2::uuid, 'GLOBAL', null, 'Global Product', 'ACTIVE'),
         ($3::uuid, 'HOUSEHOLD', $5::uuid, 'Retired Product', 'RETIRED')`,
      [foreign, global, retired, FOREIGN_HOUSEHOLD, HOUSEHOLD],
    );
    const targets = [foreign, global, retired, missing];
    const commands = [
      CommandId('f5c45555-0b05-4c55-8b05-000000000055'),
      CommandId('f5c45656-0b05-4c56-8b05-000000000056'),
      CommandId('f5c45757-0b05-4c57-8b05-000000000057'),
      CommandId('f5c45858-0b05-4c58-8b05-000000000058'),
    ];
    for (let index = 0; index < targets.length; index += 1) {
      await assert.rejects(
        retirer(database).execute({
          commandId: commands[index]!,
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          productId: targets[index]!,
        }),
        NotFoundError,
      );
    }

    const own = ProductId('f5c45959-0b05-4c59-8b05-000000000059');
    await createProduct(database, own, CommandId('f5c46060-0b05-4c60-8b05-000000000060'));
    await assert.rejects(
      retirer(database).execute({
        commandId: CommandId('f5c46161-0b05-4c61-8b05-000000000061'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        productId: own,
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('retirement-first serialization rejects a concurrent new current StockItem after Product retirement commits', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const setup = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const txPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 2 });
  const productId = ProductId('f5c47171-0b05-4c71-8b05-000000000071');
  try {
    await createProduct(database, productId, CommandId('f5c47272-0b05-4c72-8b05-000000000072'));
    const retireClient = await txPool.connect();
    const insertClient = await txPool.connect();
    try {
      await retireClient.query('begin');
      await retireClient.query('set local role fridge_app');
      await retireClient.query(`select set_config('fridge.household_id', $1, true)`, [HOUSEHOLD]);
      const retired = await retireClient.query<{ outcome_code: string }>(
        `select outcome_code from fridge_internal.retire_household_product(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid
         )`,
        [
          HOUSEHOLD,
          ADMIN,
          ADMIN_MEMBERSHIP,
          'f5c47373-0b05-4c73-8b05-000000000073',
          productId,
        ],
      );
      assert.equal(retired.rows[0]?.outcome_code, 'RETIRED');

      const concurrentInsert = insertClient.query(
        `insert into fridge.stock_item (
           stock_item_id, household_id, product_id, lifecycle_status, placement_anchor_kind
         ) values ('f5c47474-0b05-4c74-8b05-000000000074'::uuid, $1::uuid, $2::uuid, 'ACTIVE', 'UNPLACED')`,
        [HOUSEHOLD, productId],
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
      await retireClient.query('commit');

      await assert.rejects(
        concurrentInsert,
        (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23514',
      );
    } finally {
      retireClient.release();
      insertClient.release();
    }

    const state = await setup.query<{ lifecycle_status: string; stock_count: string }>(
      `select p.lifecycle_status,
              (select count(*)::text from fridge.stock_item where product_id = p.product_id and lifecycle_status = 'ACTIVE') as stock_count
         from fridge.product p where p.product_id = $1::uuid`,
      [productId],
    );
    assert.deepEqual(state.rows[0], { lifecycle_status: 'RETIRED', stock_count: '0' });
  } finally {
    await database.close();
    await setup.end();
    await txPool.end();
  }
});
