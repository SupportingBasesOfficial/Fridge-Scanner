import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompatibilityMappingFamilyId,
  CompatibilityMappingId,
  ConflictError,
  CreateHouseholdCompatibilityMappingUseCase,
  HouseholdId,
  IngredientConceptId,
  PrincipalId,
  ProductId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdCompatibilityMappingWriter } from './create-household-compatibility-mapping.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('c8e10101-0b13-4e01-8b13-000000000001');
const FIRST_ADMIN = PrincipalId('c8e10202-0b13-4e02-8b13-000000000002');
const SECOND_ADMIN = PrincipalId('c8e10203-0b13-4e02-8b13-000000000003');
const FIRST_MEMBERSHIP = 'c8e10303-0b13-4e03-8b13-000000000003';
const SECOND_MEMBERSHIP = 'c8e10304-0b13-4e03-8b13-000000000004';
const ROLE = 'BE05_COMPATIBILITY_CONCURRENCY_ADMIN';
const PRODUCT = ProductId('c8e10404-0b13-4e04-8b13-000000000004');
const CONCEPT = IngredientConceptId('c8e10505-0b13-4e05-8b13-000000000005');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id,display_name) values
         ($1::uuid,'Compatibility Concurrent Admin One'),
         ($2::uuid,'Compatibility Concurrent Admin Two')`,
      [FIRST_ADMIN, SECOND_ADMIN],
    );
    await pool.query(
      `insert into fridge.household (household_id,display_name)
       values ($1::uuid,'Compatibility Concurrency Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code,display_name,lifecycle_status)
       values ($1,'Compatibility concurrency admin','ACTIVE')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code,capability_code)
       values ($1,'HOUSEHOLD_CATALOG_ADMINISTER')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to
       ) values
         ($1::uuid,$3::uuid,$4::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null),
         ($2::uuid,$3::uuid,$5::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,
      [FIRST_MEMBERSHIP, SECOND_MEMBERSHIP, HOUSEHOLD, FIRST_ADMIN, SECOND_ADMIN, ROLE],
    );
    await pool.query(
      `insert into fridge.product (
         product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values ($1::uuid,'HOUSEHOLD',$2::uuid,'Concurrent Compatibility Product','ACTIVE')`,
      [PRODUCT, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.ingredient_concept (
         ingredient_concept_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values ($1::uuid,'HOUSEHOLD',$2::uuid,'Concurrent Compatibility Concept','ACTIVE')`,
      [CONCEPT, HOUSEHOLD],
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

async function waitForBothAuthorityCallsBlocked(pool: Pool): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ blocked_count: number }>(
      `select count(*)::int as blocked_count
         from pg_stat_activity
        where state='active'
          and wait_event_type='Lock'
          and query like '%fridge_internal.acquire_household_catalog_admin_authority%'`,
    );
    if ((result.rows[0]?.blocked_count ?? 0) >= 2) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('both compatibility creators did not reach Household authority serialization');
}

test('concurrent family creation for one Household endpoint pair commits exactly one lineage', async () => {
  const firstDatabase = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const secondDatabase = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const blocker = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const monitor = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  let firstPromise: Promise<unknown> | undefined;
  let secondPromise: Promise<unknown> | undefined;

  try {
    await blocker.query('begin');
    await blocker.query(
      `select household_id from fridge.household where household_id=$1::uuid for update`,
      [HOUSEHOLD],
    );

    firstPromise = creator(
      firstDatabase,
      CompatibilityMappingFamilyId('c8e11111-0b13-4e11-8b13-000000000011'),
      CompatibilityMappingId('c8e11212-0b13-4e12-8b13-000000000012'),
    ).execute({
      commandId: CommandId('c8e11313-0b13-4e13-8b13-000000000013'),
      actorPrincipalId: FIRST_ADMIN,
      householdId: HOUSEHOLD,
      productId: PRODUCT,
      ingredientConceptId: CONCEPT,
    });

    secondPromise = creator(
      secondDatabase,
      CompatibilityMappingFamilyId('c8e11414-0b13-4e14-8b13-000000000014'),
      CompatibilityMappingId('c8e11515-0b13-4e15-8b13-000000000015'),
    ).execute({
      commandId: CommandId('c8e11616-0b13-4e16-8b13-000000000016'),
      actorPrincipalId: SECOND_ADMIN,
      householdId: HOUSEHOLD,
      productId: PRODUCT,
      ingredientConceptId: CONCEPT,
    });

    await waitForBothAuthorityCallsBlocked(monitor);
    await blocker.query('commit');

    const results = await Promise.allSettled([firstPromise, secondPromise]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.reason instanceof ConflictError);

    const persisted = (
      await monitor.query<{ mapping_count: number; family_count: number }>(
        `select count(*)::int as mapping_count,
                count(distinct mapping_family_id)::int as family_count
           from fridge.product_ingredient_compatibility
          where catalog_scope='HOUSEHOLD'
            and owner_household_id=$1::uuid
            and product_id=$2::uuid
            and ingredient_concept_id=$3::uuid`,
        [HOUSEHOLD, PRODUCT, CONCEPT],
      )
    ).rows[0];
    assert.deepEqual(persisted, { mapping_count: 1, family_count: 1 });
  } finally {
    await blocker.query('rollback').catch(() => undefined);
    const pending = [firstPromise, secondPromise].filter(
      (promise): promise is Promise<unknown> => promise !== undefined,
    );
    if (pending.length > 0) await Promise.allSettled(pending);
    await firstDatabase.close();
    await secondDatabase.close();
    await blocker.end();
    await monitor.end();
  }
});
