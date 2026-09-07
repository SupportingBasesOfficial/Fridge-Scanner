import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  AddHouseholdMemberUseCase,
  HouseholdMembershipId,
  PrincipalId,
  ReadAuthorizedHouseholdContext,
  ReadCurrentHouseholdMembersUseCase,
} from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { PgCurrentHouseholdMembershipReader } from '@fridge/database/membership-read';
import {
  BearerAuthenticatedPrincipalResolver,
  type PlatformPrincipalMapper,
} from './auth.js';
import { JwtJwksAuthenticationEvidenceVerifier } from './jwt-jwks-verifier.js';
import { buildApiServer } from './server.js';

const databaseUrl = process.env.BE00_TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('BE00_TEST_DATABASE_URL is required for BE-03 delivery integration tests');
}

const issuer = 'https://issuer-a.example.test';
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

const household = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = PrincipalId('33333333-3333-4333-8333-333333333333');
// The database integration suite deliberately leaves this existing principal
// with ended Household-A history and no current authority. The HTTP proof therefore
// exercises the accepted rejoin path rather than colliding with the suite's
// already-added current member fixture.
const target = 'bbbbbbbb-7777-4777-8777-aaaaaaaaaaaa';
const candidateMembership = 'f3000000-0000-4000-8000-000000000022';
const commandId = 'f3000000-0000-4000-8000-000000000041';
const subject = 'be03-admin-subject';

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
    household_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    'sha256',
    Buffer.from(signingInput, 'ascii'),
    { key: keyPair.privateKey, dsaEncoding: 'ieee-p1363' },
  );
  return `${signingInput}.${signature.toString('base64url')}`;
}

function buildIntegrationServer(database: PgDatabase) {
  const verifier = new JwtJwksAuthenticationEvidenceVerifier({
    trust: config.authentication!,
    now: () => nowMs,
    fetch: async () => new Response(
      JSON.stringify({ keys: [publicJwk] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  });
  const principalMapper: PlatformPrincipalMapper = {
    async resolve(identity) {
      assert.deepEqual(identity, { authority: issuer, subject });
      return actor;
    },
  };
  const authenticatedPrincipal = new BearerAuthenticatedPrincipalResolver(
    verifier,
    principalMapper,
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

test('B3-030 authenticated HTTP request crosses BE-02 verification into governed durable membership rejoin', async () => {
  const database = new PgDatabase({ connectionString: databaseUrl, capabilityRole: 'fridge_app' });
  const server = buildIntegrationServer(database);

  try {
    const token = issueToken();
    const response = await server.inject({
      method: 'POST',
      url: `/households/${household}/members`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-principal-id': '99999999-9999-4999-8999-999999999999',
      },
      payload: {
        commandId,
        targetPrincipalId: target,
        roleCode: 'MEMBER',
      },
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json(), { membershipId: candidateMembership });

    const observation = await server.inject({
      method: 'GET',
      url: `/households/${household}/members`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(observation.statusCode, 200);
    const body = observation.json() as {
      members: Array<{
        membershipId: string;
        principalId: string;
        displayName: string | null;
        roleCode: string;
        effectiveFrom: string;
        effectiveTo: string | null;
      }>;
    };
    const created = body.members.find((member) => member.principalId === target);
    assert.ok(created);
    assert.equal(created.membershipId, candidateMembership);
    assert.equal(created.displayName, 'BE03 Replay Target');
    assert.equal(created.roleCode, 'MEMBER');
    assert.equal(created.effectiveTo, null);
    assert.match(created.effectiveFrom, /Z$/);
  } finally {
    await server.close();
    await database.close();
  }
});
