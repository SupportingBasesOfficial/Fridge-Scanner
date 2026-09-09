import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompatibilityEvidenceId,
  CompatibilityMappingId,
  CommitCompatibilityDecisionEvidenceUseCase,
  HouseholdId,
  IdempotencyConflictError,
  PrincipalId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgCompatibilityDecisionEvidenceWriter } from './commit-compatibility-decision-evidence.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('f0e10101-0b13-4d01-8b13-000000000001');
const ACTOR_A = PrincipalId('f0e10202-0b13-4d02-8b13-000000000002');
const ACTOR_B = PrincipalId('f0e10203-0b13-4d02-8b13-000000000003');
const MEMBERSHIP_A = 'f0e10303-0b13-4d03-8b13-000000000003';
const MEMBERSHIP_B = 'f0e10304-0b13-4d03-8b13-000000000004';
const ROLE = 'BE05_EVIDENCE_CONCURRENT_MEMBER';
const PRODUCT = 'f0e10404-0b13-4d04-8b13-000000000004';
const CONCEPT = 'f0e10505-0b13-4d05-8b13-000000000005';
const MAPPING = CompatibilityMappingId('f0e10606-0b13-4d06-8b13-000000000006');
const COMMAND = CommandId('f0e10707-0b13-4d07-8b13-000000000007');
const EVIDENCE_A = CompatibilityEvidenceId('f0e10808-0b13-4d08-8b13-000000000008');
const EVIDENCE_B = CompatibilityEvidenceId('f0e10909-0b13-4d09-8b13-000000000009');

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id,display_name) values
         ($1::uuid,'Evidence Concurrent A'),($2::uuid,'Evidence Concurrent B')`,
      [ACTOR_A, ACTOR_B],
    );
    await pool.query(
      `insert into fridge.household (household_id,display_name)
       values ($1::uuid,'Evidence Concurrent Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code,display_name,lifecycle_status)
       values ($1,'Evidence concurrent member','ACTIVE')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to
       ) values
         ($1::uuid,$3::uuid,$4::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null),
         ($2::uuid,$3::uuid,$5::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,
      [MEMBERSHIP_A, MEMBERSHIP_B, HOUSEHOLD, ACTOR_A, ACTOR_B, ROLE],
    );
    await pool.query(
      `insert into fridge.product (product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status)
       values ($1::uuid,'HOUSEHOLD',$2::uuid,'Evidence Concurrent Product','ACTIVE')`,
      [PRODUCT, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.ingredient_concept (
         ingredient_concept_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values ($1::uuid,'HOUSEHOLD',$2::uuid,'Evidence Concurrent Concept','ACTIVE')`,
      [CONCEPT, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.product_ingredient_compatibility (
         compatibility_mapping_id,mapping_family_id,version_no,catalog_scope,owner_household_id,
         product_id,ingredient_concept_id,effective_from,effective_to,lifecycle_status,recorded_at
       ) values (
         $1::uuid,'f0e11606-0b13-4d16-8b13-000000000006',1,'HOUSEHOLD',$2::uuid,
         $3::uuid,$4::uuid,clock_timestamp()-interval '1 hour',null,'ACTIVE',clock_timestamp()-interval '1 hour'
       )`,
      [MAPPING, HOUSEHOLD, PRODUCT, CONCEPT],
    );
  } finally {
    await pool.end();
  }
}

await seed();

function committer(database: PgDatabase, evidenceId: CompatibilityEvidenceId) {
  return new CommitCompatibilityDecisionEvidenceUseCase(
    database,
    new PgCompatibilityDecisionEvidenceWriter(),
    { generate: () => evidenceId },
  );
}

test('concurrent first use of the same evidence CommandId commits exactly one evidence row', async () => {
  const databaseA = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const databaseB = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 2 });
  const blocker = await admin.connect();
  try {
    await blocker.query('begin');
    await blocker.query(
      `select household_id from fridge.household where household_id=$1::uuid for update`,
      [HOUSEHOLD],
    );

    const firstPromise = committer(databaseA, EVIDENCE_A).execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR_A,
      householdId: HOUSEHOLD,
      compatibilityMappingId: MAPPING,
      provenance: 'concurrent-first-use',
    });
    const secondPromise = committer(databaseB, EVIDENCE_B).execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR_B,
      householdId: HOUSEHOLD,
      compatibilityMappingId: MAPPING,
      provenance: 'concurrent-first-use',
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    await blocker.query('commit');

    const outcomes = await Promise.allSettled([firstPromise, secondPromise]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<typeof firstPromise>> =>
        outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.reason instanceof IdempotencyConflictError);

    const state = (
      await admin.query<{ evidence_count: number; command_count: number }>(
        `select
           (select count(*)::int from fridge.compatibility_decision_evidence
             where compatibility_evidence_id in ($1::uuid,$2::uuid)) as evidence_count,
           (select count(*)::int from fridge.household_compatibility_evidence_commit_command
             where household_id=$3::uuid and command_id=$4::uuid) as command_count`,
        [EVIDENCE_A, EVIDENCE_B, HOUSEHOLD, COMMAND],
      )
    ).rows[0];
    assert.deepEqual(state, { evidence_count: 1, command_count: 1 });
  } finally {
    try {
      await blocker.query('rollback');
    } catch {
      // Already committed or connection is being released.
    }
    blocker.release();
    await databaseA.close();
    await databaseB.close();
    await admin.end();
  }
});
