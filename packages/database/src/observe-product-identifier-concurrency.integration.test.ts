import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  HouseholdId,
  IdempotencyConflictError,
  ObserveProductIdentifierUseCase,
  PrincipalId,
  ProductId,
  StagedIdentifierClaimId,
  instant,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgProductIdentifierObservationWriter } from './observe-product-identifier.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('a2b20101-0b10-4d01-8b10-000000000001');
const FIRST_ACTOR = PrincipalId('a2b20202-0b10-4d02-8b10-000000000002');
const SECOND_ACTOR = PrincipalId('a2b20203-0b10-4d02-8b10-000000000003');
const FIRST_MEMBERSHIP = 'a2b20303-0b10-4d03-8b10-000000000003';
const SECOND_MEMBERSHIP = 'a2b20304-0b10-4d03-8b10-000000000004';
const ROLE = 'BE05_IDENTIFIER_CONCURRENCY_OBSERVER';
const PRODUCT = ProductId('a2b20404-0b10-4d04-8b10-000000000004');
const COMMAND = CommandId('a2b20505-0b10-4d05-8b10-000000000005');
const FIRST_CLAIM = StagedIdentifierClaimId('a2b20606-0b10-4d06-8b10-000000000006');
const SECOND_CLAIM = StagedIdentifierClaimId('a2b20707-0b10-4d07-8b10-000000000007');
const OBSERVED_AT = instant('2026-09-09T01:00:00Z');

type ObservationResult = { readonly stagedIdentifierClaimId: StagedIdentifierClaimId };

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name) values
         ($1::uuid,'Concurrency Observer One'),
         ($2::uuid,'Concurrency Observer Two')`,
      [FIRST_ACTOR, SECOND_ACTOR],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid,'Identifier Concurrency Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name, lifecycle_status)
       values ($1,'Identifier concurrency observer','ACTIVE')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to
       ) values
         ($1::uuid,$3::uuid,$4::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null),
         ($2::uuid,$3::uuid,$5::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,
      [FIRST_MEMBERSHIP, SECOND_MEMBERSHIP, HOUSEHOLD, FIRST_ACTOR, SECOND_ACTOR, ROLE],
    );
    await pool.query(
      `insert into fridge.product (
         product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values ($1::uuid,'HOUSEHOLD',$2::uuid,'Concurrency Candidate','ACTIVE')`,
      [PRODUCT, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function observer(
  database: PgDatabase,
  claimId: StagedIdentifierClaimId,
): ObserveProductIdentifierUseCase {
  return new ObserveProductIdentifierUseCase(
    database,
    new PgProductIdentifierObservationWriter(),
    { generate: () => claimId },
  );
}

async function waitForBothObserversBlocked(pool: Pool): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ blocked_count: number }>(
      `select count(*)::int as blocked_count
         from pg_stat_activity
        where state = 'active'
          and wait_event_type = 'Lock'
          and query like '%fridge_internal.observe_product_identifier%'`,
    );
    if ((result.rows[0]?.blocked_count ?? 0) >= 2) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('both concurrent ObserveProductIdentifier calls did not reach the locked candidate');
}

test('concurrent first use of one CommandId serializes to one staged claim and deterministic actor conflict', async () => {
  const firstDatabase = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const secondDatabase = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const blocker = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const observerPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  let firstPromise: Promise<ObservationResult> | undefined;
  let secondPromise: Promise<ObservationResult> | undefined;

  try {
    await blocker.query('begin');
    await blocker.query(
      `select product_id from fridge.product where product_id=$1::uuid for update`,
      [PRODUCT],
    );

    firstPromise = observer(firstDatabase, FIRST_CLAIM).execute({
      commandId: COMMAND,
      actorPrincipalId: FIRST_ACTOR,
      householdId: HOUSEHOLD,
      candidateProductId: PRODUCT,
      schemeCode: 'GTIN',
      issuerNamespace: null,
      sourceValue: '0099999999999',
      observedAt: OBSERVED_AT,
    });
    secondPromise = observer(secondDatabase, SECOND_CLAIM).execute({
      commandId: COMMAND,
      actorPrincipalId: SECOND_ACTOR,
      householdId: HOUSEHOLD,
      candidateProductId: PRODUCT,
      schemeCode: 'GTIN',
      issuerNamespace: null,
      sourceValue: '0099999999999',
      observedAt: OBSERVED_AT,
    });

    await waitForBothObserversBlocked(observerPool);
    await blocker.query('commit');

    const results = await Promise.allSettled([firstPromise, secondPromise]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<ObservationResult> => result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]!.reason instanceof IdempotencyConflictError);
    assert.ok(
      fulfilled[0]!.value.stagedIdentifierClaimId === FIRST_CLAIM ||
        fulfilled[0]!.value.stagedIdentifierClaimId === SECOND_CLAIM,
    );

    const persisted = (
      await observerPool.query<{ claim_count: number; command_count: number }>(
        `select
           (select count(*)::int from fridge.staged_identifier_claim
             where staged_identifier_claim_id in ($1::uuid,$2::uuid)) as claim_count,
           (select count(*)::int from fridge.household_product_identifier_observation_command
             where household_id=$3::uuid and command_id=$4::uuid) as command_count`,
        [FIRST_CLAIM, SECOND_CLAIM, HOUSEHOLD, COMMAND],
      )
    ).rows[0];
    assert.deepEqual(persisted, { claim_count: 1, command_count: 1 });
  } finally {
    await blocker.query('rollback').catch(() => undefined);
    const pending = [firstPromise, secondPromise].filter(
      (promise): promise is Promise<ObservationResult> => promise !== undefined,
    );
    if (pending.length > 0) await Promise.allSettled(pending);
    await firstDatabase.close();
    await secondDatabase.close();
    await blocker.end();
    await observerPool.end();
  }
});
