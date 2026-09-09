import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  ConflictError,
  CreateHouseholdIngredientConceptUseCase,
  HouseholdId,
  IdempotencyConflictError,
  IngredientConceptId,
  NotFoundError,
  PrincipalId,
  RetireHouseholdIngredientConceptUseCase,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdIngredientConceptWriter } from './create-household-ingredient-concept.js';
import { PgHouseholdIngredientConceptRetirer } from './retire-household-ingredient-concept.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('f9d90101-0b09-4d01-8b09-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('f9d90102-0b09-4d01-8b09-000000000002');
const ADMIN = PrincipalId('f9d90202-0b09-4d02-8b09-000000000002');
const SECOND_ADMIN = PrincipalId('f9d90203-0b09-4d02-8b09-000000000003');
const ORDINARY = PrincipalId('f9d90303-0b09-4d03-8b09-000000000003');
const ADMIN_MEMBERSHIP = 'f9d90404-0b09-4d04-8b09-000000000004';
const SECOND_ADMIN_MEMBERSHIP = 'f9d90405-0b09-4d04-8b09-000000000005';
const ORDINARY_MEMBERSHIP = 'f9d90505-0b09-4d05-8b09-000000000005';
const ADMIN_ROLE = 'BE05_INGREDIENT_RETIRE_ADMIN';
const ORDINARY_ROLE = 'BE05_INGREDIENT_RETIRE_MEMBER';
const GLOBAL_PRODUCT = 'f9d90606-0b09-4d06-8b09-000000000006';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Ingredient Retire Admin'),
              ($2::uuid, 'BE05 Ingredient Retire Second Admin'),
              ($3::uuid, 'BE05 Ingredient Retire Ordinary')`,
      [ADMIN, SECOND_ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 Ingredient Retire Household'),
              ($2::uuid, 'BE05 Ingredient Retire Foreign')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE05 ingredient retire admin'),
              ($2, 'BE05 ingredient retire member')`,
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
         ($1::uuid,$4::uuid,$5::uuid,$8,'ACTIVE',clock_timestamp()-interval '1 hour',null),
         ($2::uuid,$4::uuid,$6::uuid,$8,'ACTIVE',clock_timestamp()-interval '1 hour',null),
         ($3::uuid,$4::uuid,$7::uuid,$9,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,
      [
        ADMIN_MEMBERSHIP,
        SECOND_ADMIN_MEMBERSHIP,
        ORDINARY_MEMBERSHIP,
        HOUSEHOLD,
        ADMIN,
        SECOND_ADMIN,
        ORDINARY,
        ADMIN_ROLE,
        ORDINARY_ROLE,
      ],
    );
    await pool.query(
      `insert into fridge.product
         (product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status)
       values ($1::uuid,'GLOBAL',null,'BE05 compatibility product','ACTIVE')`,
      [GLOBAL_PRODUCT],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function creator(
  database: PgDatabase,
  candidate: IngredientConceptId,
): CreateHouseholdIngredientConceptUseCase {
  return new CreateHouseholdIngredientConceptUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdIngredientConceptWriter(),
    { generate: () => candidate },
  );
}

function retirer(database: PgDatabase): RetireHouseholdIngredientConceptUseCase {
  return new RetireHouseholdIngredientConceptUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdIngredientConceptRetirer(),
  );
}

async function createConcept(
  database: PgDatabase,
  conceptId: IngredientConceptId,
  commandId: CommandId,
): Promise<void> {
  await creator(database, conceptId).execute({
    commandId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    canonicalName: 'Original Concept',
  });
}

async function insertCompatibility(
  pool: Pool,
  conceptId: IngredientConceptId,
  mappingId: string,
  familyId: string,
  effectiveTo: string | null = null,
): Promise<void> {
  await pool.query(
    `insert into fridge.product_ingredient_compatibility (
       compatibility_mapping_id, mapping_family_id, version_no, catalog_scope,
       owner_household_id, product_id, ingredient_concept_id, effective_from,
       effective_to, lifecycle_status
     ) values (
       $1::uuid,$2::uuid,1,'HOUSEHOLD',$3::uuid,$4::uuid,$5::uuid,
       case when $6::timestamptz is null
            then clock_timestamp()-interval '1 hour'
            else $6::timestamptz-interval '1 hour'
       end,
       $6::timestamptz,'ACTIVE'
     )`,
    [mappingId, familyId, HOUSEHOLD, GLOBAL_PRODUCT, conceptId, effectiveTo],
  );
}

test('retires current Household IngredientConcept while preserving identity and metadata', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const conceptId = IngredientConceptId('f9d91111-0b09-4d11-8b09-000000000011');
  try {
    await createConcept(database, conceptId, CommandId('f9d91212-0b09-4d12-8b09-000000000012'));
    const result = await retirer(database).execute({
      commandId: CommandId('f9d91313-0b09-4d13-8b09-000000000013'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
    });
    assert.equal(result.ingredientConceptId, conceptId);
    const row = (
      await admin.query(
        `select catalog_scope::text,owner_household_id::text,canonical_name,lifecycle_status
           from fridge.ingredient_concept where ingredient_concept_id=$1::uuid`,
        [conceptId],
      )
    ).rows[0];
    assert.deepEqual(row, {
      catalog_scope: 'HOUSEHOLD',
      owner_household_id: HOUSEHOLD,
      canonical_name: 'Original Concept',
      lifecycle_status: 'RETIRED',
    });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('current compatibility blocks retirement without mutating IngredientConcept', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const conceptId = IngredientConceptId('f9d92121-0b09-4d21-8b09-000000000021');
  try {
    await createConcept(database, conceptId, CommandId('f9d92222-0b09-4d22-8b09-000000000022'));
    await insertCompatibility(
      admin,
      conceptId,
      'f9d92323-0b09-4d23-8b09-000000000023',
      'f9d92424-0b09-4d24-8b09-000000000024',
    );
    await assert.rejects(
      retirer(database).execute({
        commandId: CommandId('f9d92525-0b09-4d25-8b09-000000000025'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        ingredientConceptId: conceptId,
      }),
      ConflictError,
    );
    const state = (
      await admin.query(
        `select lifecycle_status from fridge.ingredient_concept where ingredient_concept_id=$1::uuid`,
        [conceptId],
      )
    ).rows[0];
    assert.deepEqual(state, { lifecycle_status: 'ACTIVE' });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('ended compatibility and evidence remain historical and do not block retirement', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const conceptId = IngredientConceptId('f9d93131-0b09-4d31-8b09-000000000031');
  const mappingId = 'f9d93333-0b09-4d33-8b09-000000000033';
  const evidenceId = 'f9d93636-0b09-4d36-8b09-000000000036';
  try {
    await createConcept(database, conceptId, CommandId('f9d93232-0b09-4d32-8b09-000000000032'));
    await insertCompatibility(
      admin,
      conceptId,
      mappingId,
      'f9d93434-0b09-4d34-8b09-000000000034',
      '2000-01-02T00:00:00Z',
    );
    await admin.query(
      `insert into fridge.compatibility_decision_evidence (
         compatibility_evidence_id, household_id, product_id, ingredient_concept_id,
         compatibility_mapping_id, evaluation_anchor, provenance
       ) values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'2000-01-01T12:00:00Z','retirement-test')`,
      [evidenceId, HOUSEHOLD, GLOBAL_PRODUCT, conceptId, mappingId],
    );
    await retirer(database).execute({
      commandId: CommandId('f9d93535-0b09-4d35-8b09-000000000035'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
    });
    const observed = (
      await admin.query(
        `select i.lifecycle_status,
                (select count(*)::int from fridge.product_ingredient_compatibility
                  where compatibility_mapping_id=$2::uuid) as historical_count,
                (select count(*)::int from fridge.compatibility_decision_evidence
                  where compatibility_evidence_id=$3::uuid) as evidence_count
           from fridge.ingredient_concept i where i.ingredient_concept_id=$1::uuid`,
        [conceptId, mappingId, evidenceId],
      )
    ).rows[0];
    assert.deepEqual(observed, {
      lifecycle_status: 'RETIRED',
      historical_count: 1,
      evidence_count: 1,
    });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('current compatibility cannot be created for retired IngredientConcept', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const conceptId = IngredientConceptId('f9d94141-0b09-4d41-8b09-000000000041');
  try {
    await createConcept(database, conceptId, CommandId('f9d94242-0b09-4d42-8b09-000000000042'));
    await retirer(database).execute({
      commandId: CommandId('f9d94343-0b09-4d43-8b09-000000000043'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
    });
    await assert.rejects(
      insertCompatibility(
        admin,
        conceptId,
        'f9d94444-0b09-4d44-8b09-000000000044',
        'f9d94545-0b09-4d45-8b09-000000000045',
      ),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error &&
        (error as { code?: string }).code === '23514',
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('committed replay is non-restoring', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const conceptId = IngredientConceptId('f9d95151-0b09-4d51-8b09-000000000051');
  const commandId = CommandId('f9d95353-0b09-4d53-8b09-000000000053');
  try {
    await createConcept(database, conceptId, CommandId('f9d95252-0b09-4d52-8b09-000000000052'));
    await retirer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
    });
    await admin.query(
      `update fridge.ingredient_concept
          set canonical_name='Later State', lifecycle_status='ACTIVE'
        where ingredient_concept_id=$1::uuid`,
      [conceptId],
    );
    const replay = await retirer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
    });
    assert.equal(replay.ingredientConceptId, conceptId);
    const row = (
      await admin.query(
        `select canonical_name,lifecycle_status from fridge.ingredient_concept
          where ingredient_concept_id=$1::uuid`,
        [conceptId],
      )
    ).rows[0];
    assert.deepEqual(row, { canonical_name: 'Later State', lifecycle_status: 'ACTIVE' });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('same retirement CommandId with divergent authorized actor conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const conceptId = IngredientConceptId('f9d96161-0b09-4d61-8b09-000000000061');
  const commandId = CommandId('f9d96363-0b09-4d63-8b09-000000000063');
  try {
    await createConcept(database, conceptId, CommandId('f9d96262-0b09-4d62-8b09-000000000062'));
    await retirer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
    });
    await assert.rejects(
      retirer(database).execute({
        commandId,
        actorPrincipalId: SECOND_ADMIN,
        householdId: HOUSEHOLD,
        ingredientConceptId: conceptId,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('same retirement CommandId with divergent target conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const first = IngredientConceptId('f9d97171-0b09-4d71-8b09-000000000071');
  const second = IngredientConceptId('f9d97272-0b09-4d72-8b09-000000000072');
  const commandId = CommandId('f9d97575-0b09-4d75-8b09-000000000075');
  try {
    await createConcept(database, first, CommandId('f9d97373-0b09-4d73-8b09-000000000073'));
    await createConcept(database, second, CommandId('f9d97474-0b09-4d74-8b09-000000000074'));
    await retirer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: first,
    });
    await assert.rejects(
      retirer(database).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        ingredientConceptId: second,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('shared Household catalog CommandId cannot change intent from create to retirement', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const conceptId = IngredientConceptId('f9d98181-0b09-4d81-8b09-000000000081');
  const createCommand = CommandId('f9d98282-0b09-4d82-8b09-000000000082');
  try {
    await createConcept(database, conceptId, createCommand);
    await assert.rejects(
      retirer(database).execute({
        commandId: createCommand,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        ingredientConceptId: conceptId,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('foreign, GLOBAL, retired and missing targets collapse to NotFound', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const targets = [
    IngredientConceptId('f9d99191-0b09-4d91-8b09-000000000091'),
    IngredientConceptId('f9d99292-0b09-4d92-8b09-000000000092'),
    IngredientConceptId('f9d99393-0b09-4d93-8b09-000000000093'),
    IngredientConceptId('f9d99494-0b09-4d94-8b09-000000000094'),
  ];
  const commands = [
    CommandId('f9d99595-0b09-4d95-8b09-000000000095'),
    CommandId('f9d99696-0b09-4d96-8b09-000000000096'),
    CommandId('f9d99797-0b09-4d97-8b09-000000000097'),
    CommandId('f9d99898-0b09-4d98-8b09-000000000098'),
  ];
  try {
    await admin.query(
      `insert into fridge.ingredient_concept
         (ingredient_concept_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status)
       values
         ($1::uuid,'HOUSEHOLD',$4::uuid,'Foreign','ACTIVE'),
         ($2::uuid,'GLOBAL',null,'Global','ACTIVE'),
         ($3::uuid,'HOUSEHOLD',$5::uuid,'Retired','RETIRED')`,
      [targets[0], targets[1], targets[2], FOREIGN_HOUSEHOLD, HOUSEHOLD],
    );
    for (let i = 0; i < targets.length; i += 1) {
      await assert.rejects(
        retirer(database).execute({
          commandId: commands[i]!,
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          ingredientConceptId: targets[i]!,
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
    await admin.end();
  }
});

test('ordinary member cannot retire private IngredientConcept', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const conceptId = IngredientConceptId('f9daa1a1-0b09-4da1-8b09-0000000000a1');
  try {
    await createConcept(database, conceptId, CommandId('f9daa2a2-0b09-4da2-8b09-0000000000a2'));
    await assert.rejects(
      retirer(database).execute({
        commandId: CommandId('f9daa3a3-0b09-4da3-8b09-0000000000a3'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        ingredientConceptId: conceptId,
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});
