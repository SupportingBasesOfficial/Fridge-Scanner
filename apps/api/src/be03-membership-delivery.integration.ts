import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Pool } from 'pg';
import {
  AddHouseholdMemberUseCase,
  HouseholdMembershipId,
  ReadAuthorizedHouseholdContext,
  ReadCurrentHouseholdMembersUseCase,
} from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { PgCurrentHouseholdMembershipReader } from '@fridge/database/membership-read';
import { buildRuntimeAuthenticatedPrincipalResolver } from './runtime-auth.js';
import { buildApiServer } from './server.js';

const databaseUrl = process.env.BE00_TEST_DATABASE_URL;
const adminDatabaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('BE00_TEST_DATABASE_URL is required for BE-03 delivery integration tests');
}
if (adminDatabaseUrl === undefined || adminDatabaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for BE-03 delivery integration tests');
}

const issuer = 'https://be03-delivery.example.test';
const audience = 'fridge-api';
const nowMs = Date.UTC(2026, 8, 7, 22, 0, 0);
const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = {
  ...keyPair.publicKey.export({ format: 'jwk' }),
  kid: 'be03-delivery-key',
  alg: 'ES256',
  use: 'sig',
  key_ops: ['verify'],
};

const household = 'f3000000-0000-4000-8000-000000000001';
const actor = 'f3000000-0000-4000-8000-000000000011';
const target = 'f3000000-0000-4000-8000-000000000012';
const actorMembership = 'f3000000-0000-4000-8000-000000000021';
const candidateMembership = 'f3000000-0000-4000-8000-000000000022';
const externalIdentityLink = 'f3000000-0000-4000-8000-000000000031';
const commandId = 'f3000000-0000-4000-8000-000000000041';
const adminRole = 'BE03_HTTP_ADMIN';
const memberRole = 'BE03_HTTP_MEMBER';
const subject = 'be03-http-admin-subject';

const config: RuntimeConfig = {
  nodeEnv: 'test',
  databaseUrl,
  databaseCapabilityRole: 'fridge_app',
  httpHost: '127.0.0.1',
  httpPort: 3000,
  logLevel: 'fatal',
  shutdownTimeoutMs: 1_000,
  authentication: Object.freeze({
    issuer,
    audience,
    jwksUrl: `${issuer}/.well-known/jwks.json`,
    algorithms: Object.freeze(['ES256'] as const),
  }),
};

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function issueToken(): string {
  const header = encodeJson({ alg: 'ES256', typ: 'JWT', kid: 'be03-delivery-key' });
  const payload = encodeJson({
    iss: issuer,
    sub: subject,
    aud: audience,
    exp: Math.floor(nowMs / 1000) + 300,
    role: 'provider-super-admin',
    household_id: '00000000-0000-0000-0000-000000000000',
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    'sha256',
    Buffer.from(signingInput, 'ascii'),
    { key: keyPair.privateKey, dsaEncoding: 'ieee-p1363' },
  );
  return `${signingInput}.${signature.toString('base64url')}`;
}

async function seed(adminPool: Pool): Promise<void> {
  await adminPool.query(
    `insert into fridge.household_role (role_code, display_name, is_assignable, lifecycle_status)
     values
       ($1::text, 'BE03 HTTP Admin', true, 'ACTIVE'),
       ($2::text, 'BE03 HTTP Member', true, 'ACTIVE')
     on conflict (role_code) do update
       set is_assignable = excluded.is_assignable,
           lifecycle_status = excluded.lifecycle_status`,
    [adminRole, memberRole],
  );
  await adminPool.query(
    `insert into fridge.household_role_capability (role_code, capability_code)
     values ($1::text, 'HOUSEHOLD_MEMBERSHIP_ADMINISTER')
     on conflict do nothing`,
    [adminRole],
  );
  await adminPool.query(
    `insert into fridge.user_profile (user_id, display_name, lifecycle_status)
     values
       ($1::uuid, 'BE03 HTTP Actor', 'ACTIVE'),
       ($2::uuid, 'BE03 HTTP Target', 'ACTIVE')
     on conflict (user_id) do update
       set lifecycle_status = 'ACTIVE'`,
    [actor, target],
  );
  await adminPool.query(
    `insert into fridge.household (household_id, display_name, lifecycle_status)
     values ($1::uuid, 'BE03 HTTP Household', 'ACTIVE')
     on conflict (household_id) do update
       set lifecycle_status = 'ACTIVE'`,
    [household],
  );
  await adminPool.query(
    `insert into fridge.household_membership (
       membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
     ) values ($1::uuid, $2::uuid, $3::uuid, $4::text, 'ACTIVE', clock_timestamp() - interval '1 hour', null)
     on conflict (membership_id) do nothing`,
    [actorMembership, household, actor, adminRole],
  );
  await adminPool.query(
    `insert into fridge.external_identity_link (
       external_identity_link_id, authority, subject, user_id, revoked_at
     ) values ($1::uuid, $2::text, $3::text, $4::uuid, null)
     on conflict (external_identity_link_id) do nothing`,
    [externalIdentityLink, issuer, subject, actor],
  );
}

function buildIntegrationServer(database: PgDatabase) {
  const authenticatedPrincipal = buildRuntimeAuthenticatedPrincipalResolver(
    config,
    database,
    {
      now: () => nowMs,
      fetch: async () => new Response(
        JSON.stringify({ keys: [publicJwk] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    },
  );
  const readAuthorizedHouseholdContext = new ReadAuthorizedHouseholdContext(
    database,
    new PgHouseholdProfileReader(),
  );
  const readCurrentHouseholdMembers = new ReadCurrentHouseholdMembersUseCase(
    database,
    new PgCurrentHouseholdMembershipReader(),
  );
  const addHouseholdMember = new AddHouseholdMemberUseCase(
    database,
    database,
    { generate: () => HouseholdMembershipId(candidateMembership) },
  );

  return buildApiServer({
    config,
    readiness: database,
    authenticatedPrincipal,
    readAuthorizedHouseholdContext,
    readCurrentHouseholdMembers,
    addHouseholdMember,
  });
}

test('B3-030 authenticated HTTP request crosses BE-02 identity into governed durable membership mutation', async () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  const database = new PgDatabase({ connectionString: databaseUrl, capabilityRole: 'fridge_app' });
  const server = buildIntegrationServer(database);

  try {
    await seed(adminPool);

    const response = await server.inject({
      method: 'POST',
      url: `/households/${household}/members`,
      headers: {
        authorization: `Bearer ${issueToken()}`,
        'x-principal-id': '99999999-9999-4999-8999-999999999999',
      },
      payload: {
        commandId,
        targetPrincipalId: target,
        roleCode: memberRole,
      },
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json(), { membershipId: candidateMembership });

    const durable = await adminPool.query<{
      membership_id: string;
      user_id: string;
      role_code: string;
      created_by_user_id: string | null;
      effective_to: Date | null;
    }>(
      `select membership_id::text,
              user_id::text,
              role_code,
              created_by_user_id::text,
              effective_to
         from fridge.household_membership
        where household_id = $1::uuid
          and user_id = $2::uuid
          and membership_id = $3::uuid`,
      [household, target, candidateMembership],
    );

    assert.equal(durable.rows.length, 1);
    assert.equal(durable.rows[0]?.user_id, target);
    assert.equal(durable.rows[0]?.role_code, memberRole);
    assert.equal(durable.rows[0]?.created_by_user_id, actor);
    assert.equal(durable.rows[0]?.effective_to, null);

    const command = await adminPool.query<{
      actor_user_id: string;
      target_user_id: string;
      requested_role_code: string;
      result_membership_id: string | null;
      outcome_code: string;
    }>(
      `select actor_user_id::text,
              target_user_id::text,
              requested_role_code,
              result_membership_id::text,
              outcome_code
         from fridge.household_membership_add_command
        where household_id = $1::uuid
          and command_id = $2::uuid`,
      [household, commandId],
    );

    assert.deepEqual(command.rows[0], {
      actor_user_id: actor,
      target_user_id: target,
      requested_role_code: memberRole,
      result_membership_id: candidateMembership,
      outcome_code: 'MEMBERSHIP_ADDED',
    });
  } finally {
    await server.close();
    await database.close();
    await adminPool.end();
  }
});
