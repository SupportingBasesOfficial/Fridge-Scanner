import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  HouseholdId,
  IdempotencyConflictError,
  NotFoundError,
  ObserveProductIdentifierUseCase,
  PrincipalId,
  ProductId,
  StagedIdentifierClaimId,
  instant,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgProductIdentifierObservationWriter } from './observe-product-identifier.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('a1b10101-0b10-4d01-8b10-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('a1b10102-0b10-4d01-8b10-000000000002');
const OBSERVER = PrincipalId('a1b10202-0b10-4d02-8b10-000000000002');
const SECOND_OBSERVER = PrincipalId('a1b10203-0b10-4d02-8b10-000000000003');
const DISABLED_ROLE_OBSERVER = PrincipalId('a1b10204-0b10-4d02-8b10-000000000004');
const OBSERVER_MEMBERSHIP = 'a1b10303-0b10-4d03-8b10-000000000003';
const SECOND_OBSERVER_MEMBERSHIP = 'a1b10304-0b10-4d03-8b10-000000000004';
const DISABLED_MEMBERSHIP = 'a1b10305-0b10-4d03-8b10-000000000005';
const OBSERVER_ROLE = 'BE05_IDENTIFIER_OBSERVER';
const DISABLED_ROLE = 'BE05_IDENTIFIER_DISABLED';
const PRIVATE_PRODUCT = ProductId('a1b10404-0b10-4d04-8b10-000000000004');
const SECOND_PRIVATE_PRODUCT = ProductId('a1b10405-0b10-4d04-8b10-000000000005');
const FOREIGN_PRODUCT = ProductId('a1b10406-0b10-4d04-8b10-000000000006');
const GLOBAL_PRODUCT = ProductId('a1b10407-0b10-4d04-8b10-000000000007');
const RETIRED_PRODUCT = ProductId('a1b10408-0b10-4d04-8b10-000000000008');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name) values
         ($1::uuid,'Identifier Observer'),
         ($2::uuid,'Identifier Second Observer'),
         ($3::uuid,'Identifier Disabled Observer')`,
      [OBSERVER, SECOND_OBSERVER, DISABLED_ROLE_OBSERVER],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name) values
         ($1::uuid,'Identifier Household'),
         ($2::uuid,'Identifier Foreign Household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name, lifecycle_status) values
         ($1,'Identifier observer','ACTIVE'),
         ($2,'Disabled identifier observer','RETIRED')`,
      [OBSERVER_ROLE, DISABLED_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to
       ) values
         ($1::uuid,$4::uuid,$5::uuid,$8,'ACTIVE',clock_timestamp()-interval '1 hour',null),
         ($2::uuid,$4::uuid,$6::uuid,$8,'ACTIVE',clock_timestamp()-interval '1 hour',null),
         ($3::uuid,$4::uuid,$7::uuid,$9,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,
      [
        OBSERVER_MEMBERSHIP,
        SECOND_OBSERVER_MEMBERSHIP,
        DISABLED_MEMBERSHIP,
        HOUSEHOLD,
        OBSERVER,
        SECOND_OBSERVER,
        DISABLED_ROLE_OBSERVER,
        OBSERVER_ROLE,
        DISABLED_ROLE,
      ],
    );
    await pool.query(
      `insert into fridge.product (
         product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values
         ($1::uuid,'HOUSEHOLD',$6::uuid,'Private Product','ACTIVE'),
         ($2::uuid,'HOUSEHOLD',$6::uuid,'Second Private Product','ACTIVE'),
         ($3::uuid,'HOUSEHOLD',$7::uuid,'Foreign Product','ACTIVE'),
         ($4::uuid,'GLOBAL',null,'Global Product','ACTIVE'),
         ($5::uuid,'HOUSEHOLD',$6::uuid,'Retired Product','RETIRED')`,
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
  } finally {
    await pool.end();
  }
}

await seedFixture();

function observer(database: PgDatabase, claimId: StagedIdentifierClaimId): ObserveProductIdentifierUseCase {
  return new ObserveProductIdentifierUseCase(
    database,
    new PgProductIdentifierObservationWriter(),
    { generate: () => claimId },
  );
}

const BASE_OBSERVED_AT = instant('2026-09-09T00:00:00Z');

function input(
  commandId: CommandId,
  overrides: Partial<Parameters<ObserveProductIdentifierUseCase['execute']>[0]> = {},
): Parameters<ObserveProductIdentifierUseCase['execute']>[0] {
  return {
    commandId,
    actorPrincipalId: OBSERVER,
    householdId: HOUSEHOLD,
    candidateProductId: PRIVATE_PRODUCT,
    schemeCode: 'GTIN',
    issuerNamespace: null,
    sourceValue: ' 0012345678905 ',
    observedAt: BASE_OBSERVED_AT,
    ...overrides,
  };
}

test('ordinary current member stages exact raw evidence without catalog authority or canonical binding', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const claimId = StagedIdentifierClaimId('a1b11111-0b10-4d11-8b10-000000000011');
  const commandId = CommandId('a1b11212-0b10-4d12-8b10-000000000012');
  try {
    const result = await observer(database, claimId).execute(input(commandId));
    assert.equal(result.stagedIdentifierClaimId, claimId);

    const staged = (
      await admin.query(
        `select household_id::text,candidate_product_id::text,scheme_code,issuer_namespace,
                source_value,normalized_value,normalization_rule_id::text,lifecycle_status,
                provenance,resolved_product_identifier_id::text,resolved_at
           from fridge.staged_identifier_claim
          where staged_identifier_claim_id=$1::uuid`,
        [claimId],
      )
    ).rows[0];
    assert.deepEqual(staged, {
      household_id: HOUSEHOLD,
      candidate_product_id: PRIVATE_PRODUCT,
      scheme_code: 'GTIN',
      issuer_namespace: null,
      source_value: ' 0012345678905 ',
      normalized_value: null,
      normalization_rule_id: null,
      lifecycle_status: 'STAGED',
      provenance: 'BE-05 ObserveProductIdentifier',
      resolved_product_identifier_id: null,
      resolved_at: null,
    });

    const canonicalCount = Number(
      (
        await admin.query(
          `select count(*) from fridge.product_identifier
            where scheme_code='GTIN' and source_value=' 0012345678905 '`,
        )
      ).rows[0].count,
    );
    assert.equal(canonicalCount, 0);

    const observationIntent = (
      await admin.query(
        `select intent_code from fridge.household_identifier_observation_command_registry
          where household_id=$1::uuid and command_id=$2::uuid`,
        [HOUSEHOLD, commandId],
      )
    ).rows[0];
    assert.deepEqual(observationIntent, { intent_code: 'OBSERVE_PRODUCT_IDENTIFIER' });

    const catalogReservationCount = Number(
      (
        await admin.query(
          `select count(*) from fridge.household_catalog_command_registry
            where household_id=$1::uuid and command_id=$2::uuid`,
          [HOUSEHOLD, commandId],
        )
      ).rows[0].count,
    );
    assert.equal(catalogReservationCount, 0);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('same raw observation under different CommandIds remains independent staged evidence', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const first = StagedIdentifierClaimId('a1b12121-0b10-4d21-8b10-000000000021');
  const second = StagedIdentifierClaimId('a1b12222-0b10-4d22-8b10-000000000022');
  try {
    const firstResult = await observer(database, first).execute(
      input(CommandId('a1b12323-0b10-4d23-8b10-000000000023'), { candidateProductId: null }),
    );
    const secondResult = await observer(database, second).execute(
      input(CommandId('a1b12424-0b10-4d24-8b10-000000000024'), { candidateProductId: null }),
    );
    assert.equal(firstResult.stagedIdentifierClaimId, first);
    assert.equal(secondResult.stagedIdentifierClaimId, second);
  } finally {
    await database.close();
  }
});

test('committed retry returns original staged identity and does not revalidate later candidate lifecycle', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const first = StagedIdentifierClaimId('a1b13131-0b10-4d31-8b10-000000000031');
  const retryCandidate = StagedIdentifierClaimId('a1b13232-0b10-4d32-8b10-000000000032');
  const commandId = CommandId('a1b13333-0b10-4d33-8b10-000000000033');
  try {
    await observer(database, first).execute(input(commandId));
    await admin.query(
      `update fridge.product set lifecycle_status='RETIRED' where product_id=$1::uuid`,
      [PRIVATE_PRODUCT],
    );
    const replay = await observer(database, retryCandidate).execute(input(commandId));
    assert.equal(replay.stagedIdentifierClaimId, first);

    const count = Number(
      (
        await admin.query(
          `select count(*) from fridge.staged_identifier_claim
            where staged_identifier_claim_id in ($1::uuid,$2::uuid)`,
          [first, retryCandidate],
        )
      ).rows[0].count,
    );
    assert.equal(count, 1);
    await admin.query(
      `update fridge.product set lifecycle_status='ACTIVE' where product_id=$1::uuid`,
      [PRIVATE_PRODUCT],
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('same observation CommandId rejects every divergent semantic fingerprint fact', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const claimId = StagedIdentifierClaimId('a1b14141-0b10-4d41-8b10-000000000041');
  const commandId = CommandId('a1b14242-0b10-4d42-8b10-000000000042');
  try {
    await observer(database, claimId).execute(input(commandId));
    const divergentInputs = [
      input(commandId, { actorPrincipalId: SECOND_OBSERVER }),
      input(commandId, { candidateProductId: SECOND_PRIVATE_PRODUCT }),
      input(commandId, { schemeCode: 'EAN' }),
      input(commandId, { issuerNamespace: 'GS1-BR' }),
      input(commandId, { sourceValue: '0012345678905' }),
      input(commandId, { observedAt: instant('2026-09-09T00:00:01Z') }),
    ];
    for (const divergent of divergentInputs) {
      await assert.rejects(
        observer(
          database,
          StagedIdentifierClaimId('a1b14343-0b10-4d43-8b10-000000000043'),
        ).execute(divergent),
        IdempotencyConflictError,
      );
    }
  } finally {
    await database.close();
  }
});

test('foreign, GLOBAL, retired and missing candidate Products collapse to NotFound', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const candidates = [
    FOREIGN_PRODUCT,
    GLOBAL_PRODUCT,
    RETIRED_PRODUCT,
    ProductId('a1b15151-0b10-4d51-8b10-000000000051'),
  ];
  const commands = [
    CommandId('a1b15252-0b10-4d52-8b10-000000000052'),
    CommandId('a1b15353-0b10-4d53-8b10-000000000053'),
    CommandId('a1b15454-0b10-4d54-8b10-000000000054'),
    CommandId('a1b15555-0b10-4d55-8b10-000000000055'),
  ];
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      await assert.rejects(
        observer(
          database,
          StagedIdentifierClaimId(`a1b1565${index}-0b10-4d56-8b10-00000000005${index}`),
        ).execute(input(commands[index]!, { candidateProductId: candidates[index]! })),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('retired Household role is denied by observation boundary even when membership row is current', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      observer(
        database,
        StagedIdentifierClaimId('a1b16161-0b10-4d61-8b10-000000000061'),
      ).execute(
        input(CommandId('a1b16262-0b10-4d62-8b10-000000000062'), {
          actorPrincipalId: DISABLED_ROLE_OBSERVER,
          candidateProductId: null,
        }),
      ),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});
