import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  HouseholdId,
  PrincipalId,
  ProductId,
  ProductIdentifierId,
  ProductIdentifierNormalizationRuleId,
  ResolveProductIdentifierUseCase,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgProductIdentifierResolver } from './resolve-product-identifier.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('b2c10101-0b12-4d01-8b12-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('b2c10102-0b12-4d01-8b12-000000000002');
const ACTOR = PrincipalId('b2c10202-0b12-4d02-8b12-000000000002');
const UNAUTHORIZED_ACTOR = PrincipalId('b2c10203-0b12-4d02-8b12-000000000003');
const MEMBERSHIP = 'b2c10303-0b12-4d03-8b12-000000000003';
const ROLE = 'BE05_IDENTIFIER_RESOLVER';

const GLOBAL_PRODUCT = ProductId('b2c10404-0b12-4d04-8b12-000000000004');
const PRIVATE_PRODUCT = ProductId('b2c10405-0b12-4d04-8b12-000000000005');
const FOREIGN_PRODUCT = ProductId('b2c10406-0b12-4d04-8b12-000000000006');
const RETIRED_PRODUCT = ProductId('b2c10407-0b12-4d04-8b12-000000000007');

const GLOBAL_RULE = ProductIdentifierNormalizationRuleId('b2c10505-0b12-4d05-8b12-000000000005');
const ISSUER_RULE = ProductIdentifierNormalizationRuleId('b2c10506-0b12-4d05-8b12-000000000006');

const GLOBAL_IDENTIFIER = ProductIdentifierId('b2c10606-0b12-4d06-8b12-000000000006');
const PRIVATE_IDENTIFIER = ProductIdentifierId('b2c10607-0b12-4d06-8b12-000000000007');
const FOREIGN_IDENTIFIER = ProductIdentifierId('b2c10608-0b12-4d06-8b12-000000000008');
const RETIRED_PRODUCT_IDENTIFIER = ProductIdentifierId('b2c10609-0b12-4d06-8b12-000000000009');
const RETIRED_IDENTIFIER = ProductIdentifierId('b2c1060a-0b12-4d06-8b12-00000000000a');
const SPACED_IDENTIFIER = ProductIdentifierId('b2c1060b-0b12-4d06-8b12-00000000000b');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id,display_name)
       values ($1::uuid,'Identifier Resolver')`,
      [ACTOR],
    );
    await pool.query(
      `insert into fridge.household (household_id,display_name) values
         ($1::uuid,'Resolution Household'),
         ($2::uuid,'Resolution Foreign Household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code,display_name,lifecycle_status)
       values ($1,'Identifier resolver','ACTIVE')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to
       ) values ($1::uuid,$2::uuid,$3::uuid,$4,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,
      [MEMBERSHIP, HOUSEHOLD, ACTOR, ROLE],
    );
    await pool.query(
      `insert into fridge.product (
         product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values
         ($1::uuid,'GLOBAL',null,'Resolution Global','ACTIVE'),
         ($2::uuid,'HOUSEHOLD',$5::uuid,'Resolution Private','ACTIVE'),
         ($3::uuid,'HOUSEHOLD',$6::uuid,'Resolution Foreign','ACTIVE'),
         ($4::uuid,'HOUSEHOLD',$5::uuid,'Resolution Retired Product','RETIRED')`,
      [GLOBAL_PRODUCT, PRIVATE_PRODUCT, FOREIGN_PRODUCT, RETIRED_PRODUCT, HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.product_identifier_normalization_rule (
         normalization_rule_id,scheme_code,namespace_mode,issuer_namespace,rule_version,
         normalization_algorithm_code,normalization_algorithm_version,effective_from,lifecycle_status,provenance
       ) values
         ($1::uuid,'GTIN','GLOBAL',null,1,'GTIN_DIGITS','1',clock_timestamp()-interval '1 day','RETIRED','fixture'),
         ($2::uuid,'INTERNAL_SKU','ISSUER_SCOPED','retailer.example',1,'EXACT','1',clock_timestamp()-interval '1 day','ACTIVE','fixture')`,
      [GLOBAL_RULE, ISSUER_RULE],
    );
    await pool.query(
      `insert into fridge.product_identifier (
         product_identifier_id,product_id,scheme_code,issuer_namespace,source_value,normalized_value,
         normalization_rule_id,lifecycle_status,provenance,recorded_at,retired_at
       ) values
         ($1::uuid,$5::uuid,'GTIN',null,'000123','000123',$8::uuid,'ACTIVE','fixture',clock_timestamp()-interval '2 hours',null),
         ($2::uuid,$6::uuid,'INTERNAL_SKU','retailer.example','SKU-42','SKU-42',$9::uuid,'ACTIVE','fixture',clock_timestamp()-interval '2 hours',null),
         ($3::uuid,$7::uuid,'INTERNAL_SKU','retailer.example','FOREIGN-42','FOREIGN-42',$9::uuid,'ACTIVE','fixture',clock_timestamp()-interval '2 hours',null),
         ($4::uuid,$6::uuid,'INTERNAL_SKU','retailer.example','RETIRED-ID','RETIRED-ID',$9::uuid,'RETIRED','fixture',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')`,
      [
        GLOBAL_IDENTIFIER,
        PRIVATE_IDENTIFIER,
        FOREIGN_IDENTIFIER,
        RETIRED_IDENTIFIER,
        GLOBAL_PRODUCT,
        PRIVATE_PRODUCT,
        FOREIGN_PRODUCT,
        GLOBAL_RULE,
        ISSUER_RULE,
      ],
    );

    // This row intentionally represents corruption that normal governed writes
    // forbid. Seed it only as the administrative superuser with trigger firing
    // disabled inside this transaction, then restore normal trigger behavior at
    // commit. Resolution must still fail closed on the retired Product.
    await pool.query('begin');
    try {
      await pool.query(`set local session_replication_role = 'replica'`);
      await pool.query(
        `insert into fridge.product_identifier (
           product_identifier_id,product_id,scheme_code,issuer_namespace,source_value,normalized_value,
           normalization_rule_id,lifecycle_status,provenance,recorded_at,retired_at
         ) values ($1::uuid,$2::uuid,'INTERNAL_SKU','retailer.example','RETIRED-PRODUCT','RETIRED-PRODUCT',
                   $3::uuid,'ACTIVE','corrupt-fixture',clock_timestamp()-interval '2 hours',null)`,
        [RETIRED_PRODUCT_IDENTIFIER, RETIRED_PRODUCT, ISSUER_RULE],
      );
      await pool.query('commit');
    } catch (error) {
      await pool.query('rollback').catch(() => undefined);
      throw error;
    }

    await pool.query(
      `insert into fridge.product_identifier (
         product_identifier_id,product_id,scheme_code,issuer_namespace,source_value,normalized_value,
         normalization_rule_id,lifecycle_status,provenance,recorded_at,retired_at
       ) values ($1::uuid,$2::uuid,'INTERNAL_SKU','retailer.example',' spaced ',' SKU-SPACED ',
                 $3::uuid,'ACTIVE','fixture',clock_timestamp()-interval '2 hours',null)`,
      [SPACED_IDENTIFIER, PRIVATE_PRODUCT, ISSUER_RULE],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function resolver(database: PgDatabase): ResolveProductIdentifierUseCase {
  return new ResolveProductIdentifierUseCase(database, new PgProductIdentifierResolver());
}

function input(overrides: Partial<Parameters<ResolveProductIdentifierUseCase['execute']>[0]> = {}) {
  return {
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    schemeCode: 'INTERNAL_SKU',
    issuerNamespace: 'retailer.example',
    normalizationRuleId: ISSUER_RULE,
    normalizedValue: 'SKU-42',
    ...overrides,
  };
}

test('resolves an ACTIVE same-Household canonical issuer-scoped binding', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    assert.deepEqual(await resolver(database).execute(input()), {
      resolution: { productIdentifierId: PRIVATE_IDENTIFIER, productId: PRIVATE_PRODUCT },
    });
  } finally {
    await database.close();
  }
});

test('resolves a GLOBAL binding even when its exact historical normalization rule is retired', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    assert.deepEqual(
      await resolver(database).execute(
        input({
          schemeCode: 'GTIN',
          issuerNamespace: null,
          normalizationRuleId: GLOBAL_RULE,
          normalizedValue: '000123',
        }),
      ),
      { resolution: { productIdentifierId: GLOBAL_IDENTIFIER, productId: GLOBAL_PRODUCT } },
    );
  } finally {
    await database.close();
  }
});

test('preserves exact normalized values including governed surrounding whitespace', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    assert.deepEqual(await resolver(database).execute(input({ normalizedValue: ' SKU-SPACED ' })), {
      resolution: { productIdentifierId: SPACED_IDENTIFIER, productId: PRIVATE_PRODUCT },
    });
    assert.deepEqual(await resolver(database).execute(input({ normalizedValue: 'SKU-SPACED' })), {
      resolution: null,
    });
  } finally {
    await database.close();
  }
});

test('wrong namespace, rule, scheme or normalized value resolves to null without heuristic fallback', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    assert.deepEqual(await resolver(database).execute(input({ issuerNamespace: 'other.example' })), {
      resolution: null,
    });
    assert.deepEqual(await resolver(database).execute(input({ normalizationRuleId: GLOBAL_RULE })), {
      resolution: null,
    });
    assert.deepEqual(await resolver(database).execute(input({ schemeCode: 'GTIN' })), { resolution: null });
    assert.deepEqual(await resolver(database).execute(input({ normalizedValue: 'sku-42' })), {
      resolution: null,
    });
  } finally {
    await database.close();
  }
});

test('foreign private, retired Product and retired ProductIdentifier bindings collapse to null', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    assert.deepEqual(await resolver(database).execute(input({ normalizedValue: 'FOREIGN-42' })), {
      resolution: null,
    });
    assert.deepEqual(await resolver(database).execute(input({ normalizedValue: 'RETIRED-PRODUCT' })), {
      resolution: null,
    });
    assert.deepEqual(await resolver(database).execute(input({ normalizedValue: 'RETIRED-ID' })), {
      resolution: null,
    });
    assert.deepEqual(await resolver(database).execute(input({ normalizedValue: 'MISSING' })), {
      resolution: null,
    });
  } finally {
    await database.close();
  }
});

test('principal without a current Household membership is denied before resolution', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      resolver(database).execute(input({ actorPrincipalId: UNAUTHORIZED_ACTOR })),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});

test('resolution is observational and does not mutate canonical or staged identifier state', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const before = (
      await admin.query(`select
        (select count(*)::int from fridge.product_identifier) as canonical_count,
        (select count(*)::int from fridge.staged_identifier_claim) as staged_count`)
    ).rows[0];
    await resolver(database).execute(input());
    const after = (
      await admin.query(`select
        (select count(*)::int from fridge.product_identifier) as canonical_count,
        (select count(*)::int from fridge.staged_identifier_claim) as staged_count`)
    ).rows[0];
    assert.deepEqual(after, before);
  } finally {
    await database.close();
    await admin.end();
  }
});
