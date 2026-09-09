import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompatibilityMappingId,
  HouseholdId,
  NotFoundError,
  PrincipalId,
  RetireHouseholdCompatibilityMappingUseCase,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdCompatibilityMappingRetirer } from './retire-household-compatibility-mapping.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('daf20101-0b14-4d01-8b14-000000000001');
const FIRST_ADMIN = PrincipalId('daf20202-0b14-4d02-8b14-000000000002');
const SECOND_ADMIN = PrincipalId('daf20203-0b14-4d02-8b14-000000000003');
const FIRST_MEMBERSHIP = 'daf20303-0b14-4d03-8b14-000000000003';
const SECOND_MEMBERSHIP = 'daf20304-0b14-4d03-8b14-000000000004';
const ROLE = 'BE05_COMPATIBILITY_RETIRE_CONCURRENCY_ADMIN';
const PRODUCT = 'daf20404-0b14-4d04-8b14-000000000004';
const CONCEPT = 'daf20505-0b14-4d05-8b14-000000000005';
const MAPPING = CompatibilityMappingId('daf20606-0b14-4d06-8b14-000000000006');
const FIRST_COMMAND = CommandId('daf20707-0b14-4d07-8b14-000000000007');
const SECOND_COMMAND = CommandId('daf20808-0b14-4d08-8b14-000000000008');

type RetireResult = { readonly compatibilityMappingId: CompatibilityMappingId };

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id,display_name) values
         ($1::uuid,'Compatibility Retire Concurrent One'),
         ($2::uuid,'Compatibility Retire Concurrent Two')`,
      [FIRST_ADMIN, SECOND_ADMIN],
    );
    await pool.query(
      `insert into fridge.household (household_id,display_name)
       values ($1::uuid,'Compatibility Retire Concurrent Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code,display_name,lifecycle_status)
       values ($1,'Compatibility retire concurrency admin','ACTIVE')`,
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
       ) values ($1::uuid,'HOUSEHOLD',$2::uuid,'Concurrent retire Product','ACTIVE')`,
      [PRODUCT, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.ingredient_concept (
         ingredient_concept_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values ($1::uuid,'HOUSEHOLD',$2::uuid,'Concurrent retire Concept','ACTIVE')`,
      [CONCEPT, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.product_ingredient_compatibility (
         compatibility_mapping_id,mapping_family_id,version_no,catalog_scope,owner_household_id,
         product_id,ingredient_concept_id,effective_from,effective_to,lifecycle_status
       ) values (
         $1::uuid,'daf20909-0b14-4d09-8b14-000000000009'::uuid,1,'HOUSEHOLD',$2::uuid,
         $3::uuid,$4::uuid,clock_timestamp()-interval '1 hour',null,'ACTIVE'
       )`,
      [MAPPING, HOUSEHOLD, PRODUCT, CONCEPT],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function retirer(database: PgDatabase): RetireHouseholdCompatibilityMappingUseCase {
  return new RetireHouseholdCompatibilityMappingUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdCompatibilityMappingRetirer(),
  );
}

async function waitForBothRetirersBlocked(pool: Pool): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ blocked_count: number }>(
      `select count(*)::int as blocked_count
         from pg_stat_activity
        where state='active'
          and wait_event_type='Lock'
          and query like '%acquire_household_catalog_admin_authority%'`,
    );
    if ((result.rows[0]?.blocked_count ?? 0) >= 2) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('both concurrent compatibility retire calls did not reach Household serialization');
}

test('concurrent retirement of one mapping commits once and the second caller observes NotFound', async () => {
  const firstDatabase = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const secondDatabase = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const blocker = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const observer = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  let firstPromise: Promise<RetireResult> | undefined;
  let secondPromise: Promise<RetireResult> | undefined;

  try {
    await blocker.query('begin');
    await blocker.query(
      `select household_id from fridge.household where household_id=$1::uuid for update`,
      [HOUSEHOLD],
    );

    firstPromise = retirer(firstDatabase).execute({
      commandId: FIRST_COMMAND,
      actorPrincipalId: FIRST_ADMIN,
      householdId: HOUSEHOLD,
      compatibilityMappingId: MAPPING,
    });
    secondPromise = retirer(secondDatabase).execute({
      commandId: SECOND_COMMAND,
      actorPrincipalId: SECOND_ADMIN,
      householdId: HOUSEHOLD,
      compatibilityMappingId: MAPPING,
    });

    await waitForBothRetirersBlocked(observer);
    await blocker.query('commit');

    const results = await Promise.allSettled([firstPromise, secondPromise]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<RetireResult> => result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]!.reason instanceof NotFoundError);
    assert.deepEqual(fulfilled[0]!.value, { compatibilityMappingId: MAPPING });

    const persisted = (
      await observer.query<{
        lifecycle_status: string;
        ended: boolean;
        command_count: number;
      }>(
        `select m.lifecycle_status,
                (m.effective_to is not null) as ended,
                (select count(*)::int
                   from fridge.household_compatibility_mapping_retire_command c
                  where c.household_id=$2::uuid
                    and c.compatibility_mapping_id=m.compatibility_mapping_id) as command_count
           from fridge.product_ingredient_compatibility m
          where m.compatibility_mapping_id=$1::uuid`,
        [MAPPING, HOUSEHOLD],
      )
    ).rows[0];
    assert.deepEqual(persisted, {
      lifecycle_status: 'RETIRED',
      ended: true,
      command_count: 1,
    });
  } finally {
    await blocker.query('rollback').catch(() => undefined);
    const pending = [firstPromise, secondPromise].filter(
      (promise): promise is Promise<RetireResult> => promise !== undefined,
    );
    if (pending.length > 0) await Promise.allSettled(pending);
    await firstDatabase.close();
    await secondDatabase.close();
    await blocker.end();
    await observer.end();
  }
});
