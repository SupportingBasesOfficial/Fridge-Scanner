import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CreateHouseholdIngredientConceptUseCase,
  CreateHouseholdProductUseCase,
  HouseholdId,
  IdempotencyConflictError,
  IngredientConceptId,
  PrincipalId,
  ProductId,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdIngredientConceptWriter } from './create-household-ingredient-concept.js';
import { PgHouseholdProductWriter } from './create-household-product.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('a7d70101-0b07-4c01-8b07-000000000001');
const ADMIN = PrincipalId('a7d70202-0b07-4c02-8b07-000000000002');
const ORDINARY = PrincipalId('a7d70303-0b07-4c03-8b07-000000000003');
const ADMIN_MEMBERSHIP = 'a7d70404-0b07-4c04-8b07-000000000004';
const ORDINARY_MEMBERSHIP = 'a7d70505-0b07-4c05-8b07-000000000005';
const ADMIN_ROLE = 'BE05_CREATE_INGREDIENT_ADMIN';
const ORDINARY_ROLE = 'BE05_CREATE_INGREDIENT_MEMBER';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Ingredient Admin'), ($2::uuid, 'BE05 Ingredient Ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 Ingredient Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE05 Ingredient administrator'), ($2, 'BE05 Ingredient ordinary')`,
      [ADMIN_ROLE, ORDINARY_ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ($1, 'HOUSEHOLD_CATALOG_ADMINISTER')`,
      [ADMIN_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, $6, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, $7, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY, ADMIN_ROLE, ORDINARY_ROLE],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function createUseCase(database: PgDatabase, candidate: IngredientConceptId) {
  return new CreateHouseholdIngredientConceptUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdIngredientConceptWriter(),
    { generate: () => candidate },
  );
}

test('catalog administrator creates exactly one Household-owned IngredientConcept', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('a7d71111-0b07-4c11-8b07-000000000011');
  const candidate = IngredientConceptId('a7d71212-0b07-4c12-8b07-000000000012');
  try {
    const result = await createUseCase(database, candidate).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      canonicalName: 'Tomato',
    });
    assert.equal(result.ingredientConceptId, candidate);

    const observed = await adminPool.query(
      `select i.catalog_scope::text, i.owner_household_id::text, i.canonical_name,
              i.lifecycle_status, r.intent_code, c.result_ingredient_concept_id::text
         from fridge.ingredient_concept i
         join fridge.household_ingredient_concept_create_command c
           on c.result_ingredient_concept_id = i.ingredient_concept_id
         join fridge.household_catalog_command_registry r
           on r.household_id = c.household_id and r.command_id = c.command_id
        where i.ingredient_concept_id = $1::uuid`,
      [candidate],
    );
    assert.deepEqual(observed.rows[0], {
      catalog_scope: 'HOUSEHOLD',
      owner_household_id: HOUSEHOLD,
      canonical_name: 'Tomato',
      lifecycle_status: 'ACTIVE',
      intent_code: 'CREATE_HOUSEHOLD_INGREDIENT_CONCEPT',
      result_ingredient_concept_id: candidate,
    });
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('committed retry returns original IngredientConcept and does not restore later state', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('a7d72121-0b07-4c21-8b07-000000000021');
  const first = IngredientConceptId('a7d72222-0b07-4c22-8b07-000000000022');
  const retry = IngredientConceptId('a7d72323-0b07-4c23-8b07-000000000023');
  try {
    await createUseCase(database, first).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      canonicalName: 'Milk',
    });
    await adminPool.query(
      `update fridge.ingredient_concept set canonical_name = 'Historical Milk', lifecycle_status = 'RETIRED'
        where ingredient_concept_id = $1::uuid`,
      [first],
    );
    const replay = await createUseCase(database, retry).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      canonicalName: 'Milk',
    });
    assert.equal(replay.ingredientConceptId, first);
    const state = await adminPool.query(
      `select canonical_name, lifecycle_status,
              (select count(*)::int from fridge.ingredient_concept where ingredient_concept_id = $2::uuid) as retry_count
         from fridge.ingredient_concept where ingredient_concept_id = $1::uuid`,
      [first, retry],
    );
    assert.deepEqual(state.rows[0], {
      canonical_name: 'Historical Milk',
      lifecycle_status: 'RETIRED',
      retry_count: 0,
    });
  } finally {
    await database.close();
    await adminPool.end();
  }
});

test('shared Household catalog CommandId cannot change intent from Product to IngredientConcept', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const commandId = CommandId('a7d73131-0b07-4c31-8b07-000000000031');
  try {
    await new CreateHouseholdProductUseCase(
      new PgHouseholdCatalogAdministrationTransactionManager(database),
      new PgHouseholdProductWriter(),
      { generate: () => ProductId('a7d73232-0b07-4c32-8b07-000000000032') },
    ).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      canonicalName: 'Cross intent product',
    });

    await assert.rejects(
      createUseCase(
        database,
        IngredientConceptId('a7d73333-0b07-4c33-8b07-000000000033'),
      ).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        canonicalName: 'Cross intent concept',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('ordinary Household member cannot create IngredientConcept', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      createUseCase(
        database,
        IngredientConceptId('a7d74242-0b07-4c42-8b07-000000000042'),
      ).execute({
        commandId: CommandId('a7d74141-0b07-4c41-8b07-000000000041'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        canonicalName: 'Unauthorized concept',
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});
