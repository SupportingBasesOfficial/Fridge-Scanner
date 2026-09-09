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
  NotFoundError,
  PrincipalId,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgCompatibilityDecisionEvidenceWriter } from './commit-compatibility-decision-evidence.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('e9d10101-0b13-4d01-8b13-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('e9d10102-0b13-4d01-8b13-000000000002');
const ACTOR = PrincipalId('e9d10202-0b13-4d02-8b13-000000000002');
const SECOND_ACTOR = PrincipalId('e9d10203-0b13-4d02-8b13-000000000003');
const MEMBERSHIP = 'e9d10303-0b13-4d03-8b13-000000000003';
const SECOND_MEMBERSHIP = 'e9d10304-0b13-4d03-8b13-000000000004';
const ROLE = 'BE05_EVIDENCE_MEMBER';

const LOCAL_PRODUCT = 'e9d10404-0b13-4d04-8b13-000000000004';
const GLOBAL_PRODUCT = 'e9d10405-0b13-4d04-8b13-000000000005';
const FOREIGN_PRODUCT = 'e9d10406-0b13-4d04-8b13-000000000006';
const LOCAL_CONCEPT = 'e9d10505-0b13-4d05-8b13-000000000005';
const GLOBAL_CONCEPT = 'e9d10506-0b13-4d05-8b13-000000000006';
const FOREIGN_CONCEPT = 'e9d10507-0b13-4d05-8b13-000000000007';

const LOCAL_MAPPING = CompatibilityMappingId('e9d10606-0b13-4d06-8b13-000000000006');
const GLOBAL_MAPPING = CompatibilityMappingId('e9d10607-0b13-4d06-8b13-000000000007');
const FOREIGN_MAPPING = CompatibilityMappingId('e9d10608-0b13-4d06-8b13-000000000008');
const RETIRED_MAPPING = CompatibilityMappingId('e9d10609-0b13-4d06-8b13-000000000009');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id,display_name) values
         ($1::uuid,'Evidence Member'),
         ($2::uuid,'Evidence Second Member')`,
      [ACTOR, SECOND_ACTOR],
    );
    await pool.query(
      `insert into fridge.household (household_id,display_name) values
         ($1::uuid,'Evidence Household'),
         ($2::uuid,'Evidence Foreign Household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code,display_name,lifecycle_status)
       values ($1,'Evidence member','ACTIVE')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to
       ) values
         ($1::uuid,$3::uuid,$4::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null),
         ($2::uuid,$3::uuid,$5::uuid,$6,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,
      [MEMBERSHIP, SECOND_MEMBERSHIP, HOUSEHOLD, ACTOR, SECOND_ACTOR, ROLE],
    );
    await pool.query(
      `insert into fridge.product (
         product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values
         ($1::uuid,'HOUSEHOLD',$4::uuid,'Evidence Local Product','ACTIVE'),
         ($2::uuid,'GLOBAL',null,'Evidence Global Product','ACTIVE'),
         ($3::uuid,'HOUSEHOLD',$5::uuid,'Evidence Foreign Product','ACTIVE')`,
      [LOCAL_PRODUCT, GLOBAL_PRODUCT, FOREIGN_PRODUCT, HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.ingredient_concept (
         ingredient_concept_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status
       ) values
         ($1::uuid,'HOUSEHOLD',$4::uuid,'Evidence Local Concept','ACTIVE'),
         ($2::uuid,'GLOBAL',null,'Evidence Global Concept','ACTIVE'),
         ($3::uuid,'HOUSEHOLD',$5::uuid,'Evidence Foreign Concept','ACTIVE')`,
      [LOCAL_CONCEPT, GLOBAL_CONCEPT, FOREIGN_CONCEPT, HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.product_ingredient_compatibility (
         compatibility_mapping_id,mapping_family_id,version_no,catalog_scope,owner_household_id,
         product_id,ingredient_concept_id,effective_from,effective_to,lifecycle_status,recorded_at
       ) values
         ($1::uuid,'e9d11606-0b13-4d16-8b13-000000000006',1,'HOUSEHOLD',$5::uuid,$6::uuid,$7::uuid,clock_timestamp()-interval '1 hour',null,'ACTIVE',clock_timestamp()-interval '1 hour'),
         ($2::uuid,'e9d11607-0b13-4d16-8b13-000000000007',1,'GLOBAL',null,$8::uuid,$9::uuid,clock_timestamp()-interval '1 hour',null,'ACTIVE',clock_timestamp()-interval '1 hour'),
         ($3::uuid,'e9d11608-0b13-4d16-8b13-000000000008',1,'HOUSEHOLD',$10::uuid,$11::uuid,$12::uuid,clock_timestamp()-interval '1 hour',null,'ACTIVE',clock_timestamp()-interval '1 hour'),
         ($4::uuid,'e9d11609-0b13-4d16-8b13-000000000009',1,'HOUSEHOLD',$5::uuid,$6::uuid,$7::uuid,clock_timestamp()-interval '2 hour',clock_timestamp()-interval '1 hour','RETIRED',clock_timestamp()-interval '2 hour')`,
      [
        LOCAL_MAPPING,
        GLOBAL_MAPPING,
        FOREIGN_MAPPING,
        RETIRED_MAPPING,
        HOUSEHOLD,
        LOCAL_PRODUCT,
        LOCAL_CONCEPT,
        GLOBAL_PRODUCT,
        GLOBAL_CONCEPT,
        FOREIGN_HOUSEHOLD,
        FOREIGN_PRODUCT,
        FOREIGN_CONCEPT,
      ],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function committer(database: PgDatabase, evidenceId: CompatibilityEvidenceId) {
  return new CommitCompatibilityDecisionEvidenceUseCase(
    database,
    new PgCompatibilityDecisionEvidenceWriter(),
    { generate: () => evidenceId },
  );
}

test('ordinary current member commits immutable evidence with server anchor and exact provenance', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const evidenceId = CompatibilityEvidenceId('e9d12121-0b13-4d21-8b13-000000000021');
  try {
    const before = Date.now();
    const output = await committer(database, evidenceId).execute({
      commandId: CommandId('e9d12222-0b13-4d22-8b13-000000000022'),
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      compatibilityMappingId: LOCAL_MAPPING,
      provenance: ' scanner:compatibility-v1 ',
    });
    const after = Date.now();
    assert.equal(output.compatibilityEvidenceId, evidenceId);
    assert.ok(Date.parse(output.evaluationAnchor) >= before - 2000);
    assert.ok(Date.parse(output.evaluationAnchor) <= after + 2000);

    const row = (
      await admin.query<{
        household_id: string;
        product_id: string;
        ingredient_concept_id: string;
        compatibility_mapping_id: string;
        evaluation_anchor: Date;
        approved_by_user_id: string | null;
        approval_reason: string | null;
        provenance: string;
        recorded_at: Date;
      }>(
        `select household_id::text,product_id::text,ingredient_concept_id::text,
                compatibility_mapping_id::text,evaluation_anchor,approved_by_user_id::text,
                approval_reason,provenance,recorded_at
           from fridge.compatibility_decision_evidence
          where compatibility_evidence_id=$1::uuid`,
        [evidenceId],
      )
    ).rows[0];
    assert.ok(row);
    assert.equal(row.household_id, HOUSEHOLD);
    assert.equal(row.product_id, LOCAL_PRODUCT);
    assert.equal(row.ingredient_concept_id, LOCAL_CONCEPT);
    assert.equal(row.compatibility_mapping_id, LOCAL_MAPPING);
    assert.equal(row.approved_by_user_id, null);
    assert.equal(row.approval_reason, null);
    assert.equal(row.provenance, ' scanner:compatibility-v1 ');
    assert.equal(row.recorded_at.getTime(), row.evaluation_anchor.getTime());

    await assert.rejects(
      admin.query(
        `update fridge.compatibility_decision_evidence set provenance='rewritten'
          where compatibility_evidence_id=$1::uuid`,
        [evidenceId],
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

test('Household evidence can pin current GLOBAL mapping but remains Household-scoped', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const evidenceId = CompatibilityEvidenceId('e9d13131-0b13-4d31-8b13-000000000031');
  try {
    await committer(database, evidenceId).execute({
      commandId: CommandId('e9d13232-0b13-4d32-8b13-000000000032'),
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      compatibilityMappingId: GLOBAL_MAPPING,
      provenance: 'global mapping used by household decision',
    });
    const row = (
      await admin.query<{ household_id: string; product_id: string; ingredient_concept_id: string }>(
        `select household_id::text,product_id::text,ingredient_concept_id::text
           from fridge.compatibility_decision_evidence
          where compatibility_evidence_id=$1::uuid`,
        [evidenceId],
      )
    ).rows[0];
    assert.deepEqual(row, {
      household_id: HOUSEHOLD,
      product_id: GLOBAL_PRODUCT,
      ingredient_concept_id: GLOBAL_CONCEPT,
    });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('foreign, retired and missing mappings are nondisclosure-safe NotFound', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const mappings = [
    FOREIGN_MAPPING,
    RETIRED_MAPPING,
    CompatibilityMappingId('e9d14001-0b13-4d40-8b13-000000000001'),
  ];
  try {
    for (let index = 0; index < mappings.length; index += 1) {
      const evidenceId = CompatibilityEvidenceId(
        ['e9d14101-0b13-4d41-8b13-000000000001','e9d14102-0b13-4d41-8b13-000000000002','e9d14103-0b13-4d41-8b13-000000000003'][index]!,
      );
      const commandId = CommandId(
        ['e9d14201-0b13-4d42-8b13-000000000001','e9d14202-0b13-4d42-8b13-000000000002','e9d14203-0b13-4d42-8b13-000000000003'][index]!,
      );
      await assert.rejects(
        committer(database, evidenceId).execute({
          commandId,
          actorPrincipalId: ACTOR,
          householdId: HOUSEHOLD,
          compatibilityMappingId: mappings[index]!,
          provenance: 'negative visibility case',
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('replay survives later mapping retirement and divergent fingerprints conflict', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const evidenceId = CompatibilityEvidenceId('e9d15151-0b13-4d51-8b13-000000000051');
  const commandId = CommandId('e9d15252-0b13-4d52-8b13-000000000052');
  try {
    const first = await committer(database, evidenceId).execute({
      commandId,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      compatibilityMappingId: LOCAL_MAPPING,
      provenance: 'replay-proof',
    });

    await admin.query(
      `update fridge.product_ingredient_compatibility
          set effective_to=clock_timestamp(), lifecycle_status='RETIRED'
        where compatibility_mapping_id=$1::uuid`,
      [LOCAL_MAPPING],
    );

    const replay = await committer(
      database,
      CompatibilityEvidenceId('e9d15353-0b13-4d53-8b13-000000000053'),
    ).execute({
      commandId,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      compatibilityMappingId: LOCAL_MAPPING,
      provenance: 'replay-proof',
    });
    assert.deepEqual(replay, first);

    await assert.rejects(
      committer(database, CompatibilityEvidenceId('e9d15454-0b13-4d54-8b13-000000000054')).execute({
        commandId,
        actorPrincipalId: SECOND_ACTOR,
        householdId: HOUSEHOLD,
        compatibilityMappingId: LOCAL_MAPPING,
        provenance: 'replay-proof',
      }),
      IdempotencyConflictError,
    );
    await assert.rejects(
      committer(database, CompatibilityEvidenceId('e9d15555-0b13-4d55-8b13-000000000055')).execute({
        commandId,
        actorPrincipalId: ACTOR,
        householdId: HOUSEHOLD,
        compatibilityMappingId: GLOBAL_MAPPING,
        provenance: 'replay-proof',
      }),
      IdempotencyConflictError,
    );
    await assert.rejects(
      committer(database, CompatibilityEvidenceId('e9d15656-0b13-4d56-8b13-000000000056')).execute({
        commandId,
        actorPrincipalId: ACTOR,
        householdId: HOUSEHOLD,
        compatibilityMappingId: LOCAL_MAPPING,
        provenance: 'different-provenance',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('non-member is denied', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      committer(database, CompatibilityEvidenceId('e9d16161-0b13-4d61-8b13-000000000061')).execute({
        commandId: CommandId('e9d16262-0b13-4d62-8b13-000000000062'),
        actorPrincipalId: PrincipalId('e9d16363-0b13-4d63-8b13-000000000063'),
        householdId: HOUSEHOLD,
        compatibilityMappingId: GLOBAL_MAPPING,
        provenance: 'unauthorized',
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});
