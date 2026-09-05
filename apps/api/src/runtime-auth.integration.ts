import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { ReadAuthorizedHouseholdContext } from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { buildRuntimeAuthenticatedPrincipalResolver } from './runtime-auth.js';
import { buildApiServer } from './server.js';

const databaseUrl = process.env.BE00_TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('BE00_TEST_DATABASE_URL is required for runtime auth integration tests');
}

const issuer = 'https://issuer-a.example.test';
const audience = 'fridge-api';
const householdA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const householdB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const nowMs = Date.UTC(2026, 8, 5, 20, 0, 0);
const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = {
  ...keyPair.publicKey.export({ format: 'jwk' }),
  kid: 'runtime-integration-key',
  alg: 'ES256',
  use: 'sig',
  key_ops: ['verify'],
};

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
    jwksUrl: 'https://issuer-a.example.test/.well-known/jwks.json',
    algorithms: Object.freeze(['ES256'] as const),
  }),
};

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function issueToken(subject: string, overrides: Record<string, unknown> = {}): string {
  const header = encodeJson({
    alg: 'ES256',
    typ: 'JWT',
    kid: 'runtime-integration-key',
  });
  const payload = encodeJson({
    iss: issuer,
    sub: subject,
    aud: audience,
    exp: Math.floor(nowMs / 1000) + 300,
    ...overrides,
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

  return buildApiServer({
    config,
    readiness: database,
    authenticatedPrincipal,
    readAuthorizedHouseholdContext,
  });
}

test('configured runtime authenticates through JWT, mapping and current Household authorization', async () => {
  const database = new PgDatabase({
    connectionString: databaseUrl,
    capabilityRole: 'fridge_app',
  });
  const server = buildIntegrationServer(database);

  try {
    const token = issueToken('shared-subject', {
      role: 'provider-admin',
      household_id: householdB,
    });
    const response = await server.inject({
      method: 'GET',
      url: `/be01/proving/households/${householdA}/context`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-principal-id': '22222222-2222-4222-8222-222222222222',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      principalId: '11111111-1111-4111-8111-111111111111',
      householdId: householdA,
      householdDisplayName: 'BE00 Household A',
      membershipId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      householdRoleCode: 'MEMBER',
    });
  } finally {
    await server.close();
    await database.close();
  }
});

test('valid token cannot revive an ended Household membership', async () => {
  const database = new PgDatabase({
    connectionString: databaseUrl,
    capabilityRole: 'fridge_app',
  });
  const server = buildIntegrationServer(database);

  try {
    const response = await server.inject({
      method: 'GET',
      url: `/be01/proving/households/${householdB}/context`,
      headers: { authorization: `Bearer ${issueToken('shared-subject')}` },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'NOT_FOUND');
  } finally {
    await server.close();
    await database.close();
  }
});

test('valid signed token with unknown platform mapping fails as unauthenticated', async () => {
  const database = new PgDatabase({
    connectionString: databaseUrl,
    capabilityRole: 'fridge_app',
  });
  const server = buildIntegrationServer(database);

  try {
    const response = await server.inject({
      method: 'GET',
      url: `/be01/proving/households/${householdA}/context`,
      headers: { authorization: `Bearer ${issueToken('unknown-subject')}` },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'UNAUTHENTICATED');
  } finally {
    await server.close();
    await database.close();
  }
});

test('valid signed token with revoked platform identity link fails as unauthenticated', async () => {
  const database = new PgDatabase({
    connectionString: databaseUrl,
    capabilityRole: 'fridge_app',
  });
  const server = buildIntegrationServer(database);

  try {
    const response = await server.inject({
      method: 'GET',
      url: `/be01/proving/households/${householdA}/context`,
      headers: { authorization: `Bearer ${issueToken('revoked-subject')}` },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'UNAUTHENTICATED');
  } finally {
    await server.close();
    await database.close();
  }
});
