import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  GetCurrentIngredientConceptUseCase,
  HouseholdId,
  IngredientConceptId,
  ListCurrentIngredientConceptsUseCase,
  NotFoundError,
  PrincipalId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgCurrentIngredientConceptReader } from './ingredient-concept-read.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('9d6b0101-0b06-4c01-8b06-000000000001');
const OTHER_HOUSEHOLD = HouseholdId('9d6b0202-0b06-4c02-8b06-000000000002');
const MEMBER = PrincipalId('9d6b0303-0b06-4c03-8b06-000000000003');
const MEMBERSHIP = '9d6b0404-0b06-4c04-8b06-000000000004';
const GLOBAL = IngredientConceptId('9d6b1111-0b06-4c11-8b06-000000000011');
const HOUSEHOLD_PRIVATE = IngredientConceptId('9d6b1212-0b06-4c12-8b06-000000000012');
const RETIRED = IngredientConceptId('9d6b1313-0b06-4c13-8b06-000000000013');
const FOREIGN = IngredientConceptId('9d6b1414-0b06-4c14-8b06-000000000014');
const MISSING = IngredientConceptId('9d6b1515-0b06-4c15-8b06-000000000015');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 IngredientConcept Read Member')`,
      [MEMBER],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 IngredientConcept Read Household'),
              ($2::uuid, 'BE05 IngredientConcept Read Foreign Household')`,
      [HOUSEHOLD, OTHER_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE05_INGREDIENT_READ_MEMBER', 'BE05 ordinary IngredientConcept reader')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'BE05_INGREDIENT_READ_MEMBER',
         'ACTIVE', clock_timestamp() - interval '1 hour', null
       )`,
      [MEMBERSHIP, HOUSEHOLD, MEMBER],
    );
    await pool.query(
      `insert into fridge.ingredient_concept (
         ingredient_concept_id, catalog_scope, owner_household_id, canonical_name,
         lifecycle_status, created_at
       ) values
         ($1::uuid, 'GLOBAL', null, 'BE05 global ingredient concept', 'ACTIVE', clock_timestamp() - interval '4 hours'),
         ($2::uuid, 'HOUSEHOLD', $5::uuid, 'BE05 local ingredient concept', 'ACTIVE', clock_timestamp() - interval '3 hours'),
         ($3::uuid, 'HOUSEHOLD', $5::uuid, 'BE05 retired ingredient concept', 'RETIRED', clock_timestamp() - interval '2 hours'),
         ($4::uuid, 'HOUSEHOLD', $6::uuid, 'BE05 foreign ingredient concept', 'ACTIVE', clock_timestamp() - interval '1 hour')`,
      [GLOBAL, HOUSEHOLD_PRIVATE, RETIRED, FOREIGN, HOUSEHOLD, OTHER_HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('ordinary current member lists GLOBAL plus same-Household IngredientConcepts without foreign leakage', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const result = await new ListCurrentIngredientConceptsUseCase(
      database,
      new PgCurrentIngredientConceptReader(),
    ).execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD });

    const ids = result.ingredientConcepts.map((concept) => concept.ingredientConceptId);
    assert.ok(ids.includes(GLOBAL));
    assert.ok(ids.includes(HOUSEHOLD_PRIVATE));
    assert.ok(!ids.includes(RETIRED));
    assert.ok(!ids.includes(FOREIGN));
    assert.deepEqual(ids, [...ids].sort());
  } finally {
    await database.close();
  }
});

test('GetCurrentIngredientConcept returns visible GLOBAL and same-Household concepts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new GetCurrentIngredientConceptUseCase(
    database,
    new PgCurrentIngredientConceptReader(),
  );
  try {
    const global = await useCase.execute({
      actorPrincipalId: MEMBER,
      householdId: HOUSEHOLD,
      ingredientConceptId: GLOBAL,
    });
    assert.equal(global.ingredientConcept.catalogScope, 'GLOBAL');
    assert.equal(global.ingredientConcept.ownerHouseholdId, null);

    const local = await useCase.execute({
      actorPrincipalId: MEMBER,
      householdId: HOUSEHOLD,
      ingredientConceptId: HOUSEHOLD_PRIVATE,
    });
    assert.equal(local.ingredientConcept.ownerHouseholdId, HOUSEHOLD);
  } finally {
    await database.close();
  }
});

test('GetCurrentIngredientConcept collapses missing, foreign private and retired concepts to NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new GetCurrentIngredientConceptUseCase(
    database,
    new PgCurrentIngredientConceptReader(),
  );
  try {
    for (const ingredientConceptId of [RETIRED, FOREIGN, MISSING]) {
      await assert.rejects(
        useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, ingredientConceptId }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('IngredientConcept read boundary revalidates exact membership after transaction authorization', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const reader = new PgCurrentIngredientConceptReader();
  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(MEMBER, HOUSEHOLD, async (transaction) => {
        await adminPool.query(
          `update fridge.household_membership
              set lifecycle_status = 'ENDED', effective_to = clock_timestamp()
            where membership_id = $1::uuid`,
          [MEMBERSHIP],
        );
        await reader.listCurrentIngredientConcepts(transaction);
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
