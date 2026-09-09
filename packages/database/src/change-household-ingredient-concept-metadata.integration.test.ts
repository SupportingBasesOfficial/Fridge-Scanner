import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  ChangeHouseholdIngredientConceptMetadataUseCase,
  CommandId,
  CreateHouseholdIngredientConceptUseCase,
  HouseholdId,
  IdempotencyConflictError,
  IngredientConceptId,
  NotFoundError,
  PrincipalId,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdIngredientConceptMetadataChanger } from './change-household-ingredient-concept-metadata.js';
import { PgHouseholdIngredientConceptWriter } from './create-household-ingredient-concept.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('b8d80101-0b08-4d01-8b08-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('b8d80102-0b08-4d01-8b08-000000000002');
const ADMIN = PrincipalId('b8d80202-0b08-4d02-8b08-000000000002');
const SECOND_ADMIN = PrincipalId('b8d80203-0b08-4d02-8b08-000000000003');
const ORDINARY = PrincipalId('b8d80303-0b08-4d03-8b08-000000000003');
const ADMIN_MEMBERSHIP = 'b8d80404-0b08-4d04-8b08-000000000004';
const SECOND_ADMIN_MEMBERSHIP = 'b8d80405-0b08-4d04-8b08-000000000005';
const ORDINARY_MEMBERSHIP = 'b8d80505-0b08-4d05-8b08-000000000005';
const ADMIN_ROLE = 'BE05_INGREDIENT_METADATA_ADMIN';
const ORDINARY_ROLE = 'BE05_INGREDIENT_METADATA_MEMBER';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE05 Ingredient Metadata Admin'),
              ($2::uuid, 'BE05 Ingredient Metadata Second Admin'),
              ($3::uuid, 'BE05 Ingredient Metadata Ordinary')`,
      [ADMIN, SECOND_ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE05 Ingredient Metadata Household'),
              ($2::uuid, 'BE05 Ingredient Metadata Foreign')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE05 ingredient metadata admin'),
              ($2, 'BE05 ingredient metadata member')`,
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
  } finally {
    await pool.end();
  }
}

await seedFixture();

function changer(database: PgDatabase): ChangeHouseholdIngredientConceptMetadataUseCase {
  return new ChangeHouseholdIngredientConceptMetadataUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdIngredientConceptMetadataChanger(),
  );
}

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

async function createConcept(
  database: PgDatabase,
  conceptId: IngredientConceptId,
  commandId: CommandId,
  canonicalName = 'Original Concept',
): Promise<void> {
  await creator(database, conceptId).execute({
    commandId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    canonicalName,
  });
}

test('changes only canonical name while preserving IngredientConcept identity/scope/owner/lifecycle', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const conceptId = IngredientConceptId('b8d81111-0b08-4d11-8b08-000000000011');
  try {
    await createConcept(
      database,
      conceptId,
      CommandId('b8d81212-0b08-4d12-8b08-000000000012'),
    );
    const result = await changer(database).execute({
      commandId: CommandId('b8d81313-0b08-4d13-8b08-000000000013'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
      canonicalName: 'Whole Milk',
    });
    assert.equal(result.ingredientConceptId, conceptId);
    const row = (
      await admin.query(
        `select catalog_scope::text, owner_household_id::text, canonical_name, lifecycle_status
           from fridge.ingredient_concept where ingredient_concept_id=$1::uuid`,
        [conceptId],
      )
    ).rows[0];
    assert.deepEqual(row, {
      catalog_scope: 'HOUSEHOLD',
      owner_household_id: HOUSEHOLD,
      canonical_name: 'Whole Milk',
      lifecycle_status: 'ACTIVE',
    });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('committed replay returns original target without restoring later state', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const conceptId = IngredientConceptId('b8d82121-0b08-4d21-8b08-000000000021');
  const changeCommand = CommandId('b8d82323-0b08-4d23-8b08-000000000023');
  try {
    await createConcept(
      database,
      conceptId,
      CommandId('b8d82222-0b08-4d22-8b08-000000000022'),
    );
    await changer(database).execute({
      commandId: changeCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
      canonicalName: 'Committed Name',
    });
    await admin.query(
      `update fridge.ingredient_concept
          set canonical_name='Later State', lifecycle_status='RETIRED'
        where ingredient_concept_id=$1::uuid`,
      [conceptId],
    );
    const replay = await changer(database).execute({
      commandId: changeCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
      canonicalName: 'Committed Name',
    });
    assert.equal(replay.ingredientConceptId, conceptId);
    const row = (
      await admin.query(
        `select canonical_name,lifecycle_status
           from fridge.ingredient_concept where ingredient_concept_id=$1::uuid`,
        [conceptId],
      )
    ).rows[0];
    assert.deepEqual(row, { canonical_name: 'Later State', lifecycle_status: 'RETIRED' });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('same command with divergent canonical name conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const conceptId = IngredientConceptId('b8d83131-0b08-4d31-8b08-000000000031');
  const commandId = CommandId('b8d83333-0b08-4d33-8b08-000000000033');
  try {
    await createConcept(
      database,
      conceptId,
      CommandId('b8d83232-0b08-4d32-8b08-000000000032'),
    );
    await changer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
      canonicalName: 'First Name',
    });
    await assert.rejects(
      changer(database).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        ingredientConceptId: conceptId,
        canonicalName: 'Different Name',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('same command with divergent authorized actor conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const conceptId = IngredientConceptId('b8d84141-0b08-4d41-8b08-000000000041');
  const commandId = CommandId('b8d84343-0b08-4d43-8b08-000000000043');
  try {
    await createConcept(
      database,
      conceptId,
      CommandId('b8d84242-0b08-4d42-8b08-000000000042'),
    );
    await changer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: conceptId,
      canonicalName: 'Bound Name',
    });
    await assert.rejects(
      changer(database).execute({
        commandId,
        actorPrincipalId: SECOND_ADMIN,
        householdId: HOUSEHOLD,
        ingredientConceptId: conceptId,
        canonicalName: 'Bound Name',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('same command with divergent target conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const first = IngredientConceptId('b8d85151-0b08-4d51-8b08-000000000051');
  const second = IngredientConceptId('b8d85252-0b08-4d52-8b08-000000000052');
  const commandId = CommandId('b8d85555-0b08-4d55-8b08-000000000055');
  try {
    await createConcept(database, first, CommandId('b8d85353-0b08-4d53-8b08-000000000053'));
    await createConcept(database, second, CommandId('b8d85454-0b08-4d54-8b08-000000000054'));
    await changer(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      ingredientConceptId: first,
      canonicalName: 'Shared Name',
    });
    await assert.rejects(
      changer(database).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        ingredientConceptId: second,
        canonicalName: 'Shared Name',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('shared Household catalog CommandId cannot change intent from create to metadata change', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const conceptId = IngredientConceptId('b8d86161-0b08-4d61-8b08-000000000061');
  const createCommand = CommandId('b8d86262-0b08-4d62-8b08-000000000062');
  try {
    await createConcept(database, conceptId, createCommand);
    await assert.rejects(
      changer(database).execute({
        commandId: createCommand,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        ingredientConceptId: conceptId,
        canonicalName: 'Cross Intent',
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
    IngredientConceptId('b8d87171-0b08-4d71-8b08-000000000071'),
    IngredientConceptId('b8d87272-0b08-4d72-8b08-000000000072'),
    IngredientConceptId('b8d87373-0b08-4d73-8b08-000000000073'),
    IngredientConceptId('b8d87474-0b08-4d74-8b08-000000000074'),
  ];
  const commands = [
    CommandId('b8d87575-0b08-4d75-8b08-000000000075'),
    CommandId('b8d87676-0b08-4d76-8b08-000000000076'),
    CommandId('b8d87777-0b08-4d77-8b08-000000000077'),
    CommandId('b8d87878-0b08-4d78-8b08-000000000078'),
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
        changer(database).execute({
          commandId: commands[i]!,
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          ingredientConceptId: targets[i]!,
          canonicalName: 'Hidden',
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
    await admin.end();
  }
});

test('ordinary member cannot change private IngredientConcept metadata', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const conceptId = IngredientConceptId('b8d88181-0b08-4d81-8b08-000000000081');
  try {
    await createConcept(
      database,
      conceptId,
      CommandId('b8d88282-0b08-4d82-8b08-000000000082'),
    );
    await assert.rejects(
      changer(database).execute({
        commandId: CommandId('b8d88383-0b08-4d83-8b08-000000000083'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        ingredientConceptId: conceptId,
        canonicalName: 'Unauthorized',
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});
