import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompatibilityMappingFamilyId,
  CompatibilityMappingId,
  ConflictError,
  CreateHouseholdCompatibilityMappingUseCase,
  CreateHouseholdProductUseCase,
  HouseholdId,
  IdempotencyConflictError,
  IngredientConceptId,
  NotFoundError,
  PrincipalId,
  ProductId,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdCompatibilityMappingWriter } from './create-household-compatibility-mapping.js';
import { PgHouseholdProductWriter } from './create-household-product.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('c7d10101-0b13-4d01-8b13-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('c7d10102-0b13-4d01-8b13-000000000002');
const ADMIN = PrincipalId('c7d10202-0b13-4d02-8b13-000000000002');
const SECOND_ADMIN = PrincipalId('c7d10203-0b13-4d02-8b13-000000000003');
const ORDINARY = PrincipalId('c7d10204-0b13-4d02-8b13-000000000004');
const ADMIN_MEMBERSHIP = 'c7d10303-0b13-4d03-8b13-000000000003';
const SECOND_ADMIN_MEMBERSHIP = 'c7d10304-0b13-4d03-8b13-000000000004';
const ORDINARY_MEMBERSHIP = 'c7d10305-0b13-4d03-8b13-000000000005';
const ADMIN_ROLE = 'BE05_COMPATIBILITY_ADMIN';
const ORDINARY_ROLE = 'BE05_COMPATIBILITY_MEMBER';

const PRIVATE_PRODUCT = ProductId('c7d10404-0b13-4d04-8b13-000000000004');
const SECOND_PRIVATE_PRODUCT = ProductId('c7d10405-0b13-4d04-8b13-000000000005');
const FOREIGN_PRODUCT = ProductId('c7d10406-0b13-4d04-8b13-000000000006');
const GLOBAL_PRODUCT = ProductId('c7d10407-0b13-4d04-8b13-000000000007');
const RETIRED_PRODUCT = ProductId('c7d10408-0b13-4d04-8b13-000000000008');

const PRIVATE_CONCEPT = IngredientConceptId('c7d10505-0b13-4d05-8b13-000000000005');
const SECOND_PRIVATE_CONCEPT = IngredientConceptId('c7d10506-0b13-4d05-8b13-000000000006');
const FOREIGN_CONCEPT = IngredientConceptId('c7d10507-0b13-4d05-8b13-000000000007');
const GLOBAL_CONCEPT = IngredientConceptId('c7d10508-0b13-4d05-8b13-000000000008');
const RETIRED_CONCEPT = IngredientConceptId('c7d10509-0b13-4d05-8b13-000000000009');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id,display_name) values
         ($1::uuid,'Compatibility Admin'),
         ($2::uuid,'Compatibility Second Admin'),
         ($3::uuid,'Compatibility Ordinary')`,
      [ADMIN, SECOND_ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id,display_name) values
         ($1::uuid,'Compatibility Household'),
         ($2::uuid,'Compatibility Foreign Household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code,display_name,lifecycle_status) values
         ($1,'Compatibility admin','ACTIVE'),
         ($2,'Compatibility ordinary','ACTIVE')`,
      [ADMIN_ROLE, ORDINARY_ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code,capability_code)
       values ($1,'HOUSEHOLD_CATALOG_ADMINISTER')`,
      [ADMIN_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to
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
      `insert into fridge.product (
         product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values
         ($1::uuid,'HOUSEHOLD',$6::uuid,'Compatibility Private Product','ACTIVE'),
         ($2::uuid,'HOUSEHOLD',$6::uuid,'Compatibility Second Product','ACTIVE'),
         ($3::uuid,'HOUSEHOLD',$7::uuid,'Compatibility Foreign Product','ACTIVE'),
         ($4::uuid,'GLOBAL',null,'Compatibility Global Product','ACTIVE'),
         ($5::uuid,'HOUSEHOLD',$6::uuid,'Compatibility Retired Product','RETIRED')`,
      [
        PRIVATE_PRODUCT,
        SECOND_PRIVATE_PRODUCT,
        FOREIGN_PRODUCT,
        GLOBAL_PRODUCT,
        RETIRED_PRODUCT,
        HOUSEHOLD,
        FOREIGN_HOUSEHOLD,
      ],
    );
    await pool.query(
      `insert into fridge.ingredient_concept (
         ingredient_concept_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values
         ($1::uuid,'HOUSEHOLD',$6::uuid,'Compatibility Private Concept','ACTIVE'),
         ($2::uuid,'HOUSEHOLD',$6::uuid,'Compatibility Second Concept','ACTIVE'),
         ($3::uuid,'HOUSEHOLD',$7::uuid,'Compatibility Foreign Concept','ACTIVE'),
         ($4::uuid,'GLOBAL',null,'Compatibility Global Concept','ACTIVE'),
         ($5::uuid,'HOUSEHOLD',$6::uuid,'Compatibility Retired Concept','RETIRED')`,
      [
        PRIVATE_CONCEPT,
        SECOND_PRIVATE_CONCEPT,
        FOREIGN_CONCEPT,
        GLOBAL_CONCEPT,
        RETIRED_CONCEPT,
        HOUSEHOLD,
        FOREIGN_HOUSEHOLD,
      ],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function creator(
  database: PgDatabase,
  familyId: CompatibilityMappingFamilyId,
  mappingId: CompatibilityMappingId,
): CreateHouseholdCompatibilityMappingUseCase {
  return new CreateHouseholdCompatibilityMappingUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdCompatibilityMappingWriter(),
    { generate: () => familyId },
    { generate: () => mappingId },
  );
}

function input(
  commandId: CommandId,
  actorPrincipalId: PrincipalId = ADMIN,
  productId: ProductId = PRIVATE_PRODUCT,
  ingredientConceptId: IngredientConceptId = PRIVATE_CONCEPT,
) {
  return {
    commandId,
    actorPrincipalId,
    householdId: HOUSEHOLD,
    productId,
    ingredientConceptId,
  };
}

test('creates Household family version 1 with server-sampled current interval', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const familyId = CompatibilityMappingFamilyId('c7d11111-0b13-4d11-8b13-000000000011');
  const mappingId = CompatibilityMappingId('c7d11212-0b13-4d12-8b13-000000000012');
  const commandId = CommandId('c7d11313-0b13-4d13-8b13-000000000013');
  try {
    const before = new Date();
    const output = await creator(database, familyId, mappingId).execute(input(commandId));
    const after = new Date();
    assert.deepEqual(output, { mappingFamilyId: familyId, compatibilityMappingId: mappingId });

    const row = (
      await admin.query<{
        mapping_family_id: string;
        version_no: number;
        catalog_scope: string;
        owner_household_id: string;
        product_id: string;
        ingredient_concept_id: string;
        effective_from: Date;
        effective_to: Date | null;
        lifecycle_status: string;
        recorded_at: Date;
        intent_code: string;
      }>(
        `select m.mapping_family_id::text,m.version_no,m.catalog_scope::text,
                m.owner_household_id::text,m.product_id::text,m.ingredient_concept_id::text,
                m.effective_from,m.effective_to,m.lifecycle_status,m.recorded_at,r.intent_code
           from fridge.product_ingredient_compatibility m
           join fridge.household_compatibility_mapping_create_command c
             on c.result_compatibility_mapping_id=m.compatibility_mapping_id
           join fridge.household_catalog_command_registry r
             on r.household_id=c.household_id and r.command_id=c.command_id
          where m.compatibility_mapping_id=$1::uuid`,
        [mappingId],
      )
    ).rows[0];
    assert.ok(row);
    assert.equal(row.mapping_family_id, familyId);
    assert.equal(row.version_no, 1);
    assert.equal(row.catalog_scope, 'HOUSEHOLD');
    assert.equal(row.owner_household_id, HOUSEHOLD);
    assert.equal(row.product_id, PRIVATE_PRODUCT);
    assert.equal(row.ingredient_concept_id, PRIVATE_CONCEPT);
    assert.equal(row.effective_to, null);
    assert.equal(row.lifecycle_status, 'ACTIVE');
    assert.equal(row.intent_code, 'CREATE_HOUSEHOLD_COMPATIBILITY_MAPPING');
    assert.equal(row.recorded_at.getTime(), row.effective_from.getTime());
    assert.ok(row.effective_from.getTime() >= before.getTime() - 2000);
    assert.ok(row.effective_from.getTime() <= after.getTime() + 2000);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('Household mapping may use GLOBAL endpoints while retaining Household ownership', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const familyId = CompatibilityMappingFamilyId('c7d12121-0b13-4d21-8b13-000000000021');
  const mappingId = CompatibilityMappingId('c7d12222-0b13-4d22-8b13-000000000022');
  try {
    await creator(database, familyId, mappingId).execute(
      input(
        CommandId('c7d12323-0b13-4d23-8b13-000000000023'),
        ADMIN,
        GLOBAL_PRODUCT,
        GLOBAL_CONCEPT,
      ),
    );
    const row = (
      await admin.query<{ catalog_scope: string; owner_household_id: string }>(
        `select catalog_scope::text,owner_household_id::text
           from fridge.product_ingredient_compatibility
          where compatibility_mapping_id=$1::uuid`,
        [mappingId],
      )
    ).rows[0];
    assert.deepEqual(row, { catalog_scope: 'HOUSEHOLD', owner_household_id: HOUSEHOLD });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('foreign, retired and missing endpoints collapse to NotFound', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const cases: Array<[ProductId, IngredientConceptId]> = [
    [FOREIGN_PRODUCT, PRIVATE_CONCEPT],
    [PRIVATE_PRODUCT, FOREIGN_CONCEPT],
    [RETIRED_PRODUCT, PRIVATE_CONCEPT],
    [PRIVATE_PRODUCT, RETIRED_CONCEPT],
    [ProductId('c7d13001-0b13-4d30-8b13-000000000001'), PRIVATE_CONCEPT],
    [PRIVATE_PRODUCT, IngredientConceptId('c7d13002-0b13-4d30-8b13-000000000002')],
  ];
  try {
    for (let index = 0; index < cases.length; index += 1) {
      const pair = cases[index];
      assert.ok(pair);
      const [productId, ingredientConceptId] = pair;
      const suffix = String(index + 1).padStart(2, '0');
      await assert.rejects(
        creator(
          database,
          CompatibilityMappingFamilyId(`c7d131${suffix}-0b13-4d31-8b13-0000000000${suffix}`),
          CompatibilityMappingId(`c7d132${suffix}-0b13-4d32-8b13-0000000000${suffix}`),
        ).execute(
          input(
            CommandId(`c7d133${suffix}-0b13-4d33-8b13-0000000000${suffix}`),
            ADMIN,
            productId,
            ingredientConceptId,
          ),
        ),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('historical mapping family prevents parallel lineage for the same Household endpoint pair', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const firstFamily = CompatibilityMappingFamilyId('c7d14141-0b13-4d41-8b13-000000000041');
  const firstMapping = CompatibilityMappingId('c7d14242-0b13-4d42-8b13-000000000042');
  try {
    await creator(database, firstFamily, firstMapping).execute(
      input(
        CommandId('c7d14343-0b13-4d43-8b13-000000000043'),
        ADMIN,
        SECOND_PRIVATE_PRODUCT,
        SECOND_PRIVATE_CONCEPT,
      ),
    );
    await admin.query(
      `update fridge.product_ingredient_compatibility
          set effective_to=clock_timestamp(), lifecycle_status='RETIRED'
        where compatibility_mapping_id=$1::uuid`,
      [firstMapping],
    );

    await assert.rejects(
      creator(
        database,
        CompatibilityMappingFamilyId('c7d14444-0b13-4d44-8b13-000000000044'),
        CompatibilityMappingId('c7d14545-0b13-4d45-8b13-000000000045'),
      ).execute(
        input(
          CommandId('c7d14646-0b13-4d46-8b13-000000000046'),
          ADMIN,
          SECOND_PRIVATE_PRODUCT,
          SECOND_PRIVATE_CONCEPT,
        ),
      ),
      ConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('committed replay is non-restoring and semantic fingerprint covers actor and both endpoints', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const familyId = CompatibilityMappingFamilyId('c7d15151-0b13-4d51-8b13-000000000051');
  const mappingId = CompatibilityMappingId('c7d15252-0b13-4d52-8b13-000000000052');
  const commandId = CommandId('c7d15353-0b13-4d53-8b13-000000000053');
  try {
    await creator(database, familyId, mappingId).execute(
      input(commandId, ADMIN, PRIVATE_PRODUCT, SECOND_PRIVATE_CONCEPT),
    );
    await admin.query(
      `update fridge.product_ingredient_compatibility
          set effective_to=clock_timestamp(), lifecycle_status='RETIRED'
        where compatibility_mapping_id=$1::uuid`,
      [mappingId],
    );

    const replay = await creator(
      database,
      CompatibilityMappingFamilyId('c7d15454-0b13-4d54-8b13-000000000054'),
      CompatibilityMappingId('c7d15555-0b13-4d55-8b13-000000000055'),
    ).execute(input(commandId, ADMIN, PRIVATE_PRODUCT, SECOND_PRIVATE_CONCEPT));
    assert.deepEqual(replay, { mappingFamilyId: familyId, compatibilityMappingId: mappingId });

    const state = (
      await admin.query<{ lifecycle_status: string; ended: boolean }>(
        `select lifecycle_status,(effective_to is not null) as ended
           from fridge.product_ingredient_compatibility
          where compatibility_mapping_id=$1::uuid`,
        [mappingId],
      )
    ).rows[0];
    assert.deepEqual(state, { lifecycle_status: 'RETIRED', ended: true });

    await assert.rejects(
      creator(
        database,
        CompatibilityMappingFamilyId('c7d15656-0b13-4d56-8b13-000000000056'),
        CompatibilityMappingId('c7d15757-0b13-4d57-8b13-000000000057'),
      ).execute(input(commandId, SECOND_ADMIN, PRIVATE_PRODUCT, SECOND_PRIVATE_CONCEPT)),
      IdempotencyConflictError,
    );
    await assert.rejects(
      creator(
        database,
        CompatibilityMappingFamilyId('c7d15858-0b13-4d58-8b13-000000000058'),
        CompatibilityMappingId('c7d15959-0b13-4d59-8b13-000000000059'),
      ).execute(input(commandId, ADMIN, SECOND_PRIVATE_PRODUCT, SECOND_PRIVATE_CONCEPT)),
      IdempotencyConflictError,
    );
    await assert.rejects(
      creator(
        database,
        CompatibilityMappingFamilyId('c7d16060-0b13-4d60-8b13-000000000060'),
        CompatibilityMappingId('c7d16161-0b13-4d61-8b13-000000000061'),
      ).execute(input(commandId, ADMIN, PRIVATE_PRODUCT, PRIVATE_CONCEPT)),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('cross-intent CommandId reuse conflicts and ordinary member lacks mutation authority', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const commandId = CommandId('c7d17171-0b13-4d71-8b13-000000000071');
  try {
    await creator(
      database,
      CompatibilityMappingFamilyId('c7d17272-0b13-4d72-8b13-000000000072'),
      CompatibilityMappingId('c7d17373-0b13-4d73-8b13-000000000073'),
    ).execute(input(commandId, ADMIN, GLOBAL_PRODUCT, PRIVATE_CONCEPT));

    const productCreator = new CreateHouseholdProductUseCase(
      new PgHouseholdCatalogAdministrationTransactionManager(database),
      new PgHouseholdProductWriter(),
      { generate: () => ProductId('c7d17474-0b13-4d74-8b13-000000000074') },
    );
    await assert.rejects(
      productCreator.execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        canonicalName: 'Cross intent product',
      }),
      IdempotencyConflictError,
    );

    await assert.rejects(
      creator(
        database,
        CompatibilityMappingFamilyId('c7d17575-0b13-4d75-8b13-000000000075'),
        CompatibilityMappingId('c7d17676-0b13-4d76-8b13-000000000076'),
      ).execute(
        input(
          CommandId('c7d17777-0b13-4d77-8b13-000000000077'),
          ORDINARY,
          GLOBAL_PRODUCT,
          SECOND_PRIVATE_CONCEPT,
        ),
      ),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});
