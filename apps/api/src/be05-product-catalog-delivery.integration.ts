import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  AddHouseholdMemberUseCase,
  CreateHouseholdProductUseCase,
  GetCurrentProductUseCase,
  HouseholdMembershipId,
  ListCurrentProductsUseCase,
  PrincipalId,
  ProductId,
  ReadAuthorizedHouseholdContext,
  ReadCurrentHouseholdMembersUseCase,
} from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { PgHouseholdCatalogAdministrationTransactionManager } from '@fridge/database/catalog-administration';
import { PgHouseholdProductWriter } from '@fridge/database/create-household-product';
import { PgCurrentHouseholdMembershipReader } from '@fridge/database/membership-read';
import { PgCurrentProductReader } from '@fridge/database/product-read';
import {
  BearerAuthenticatedPrincipalResolver,
  type PlatformPrincipalMapper,
} from './auth.js';
import { JwtJwksAuthenticationEvidenceVerifier } from './jwt-jwks-verifier.js';
import { buildApiServer } from './server.js';

const databaseUrl = process.env.BE00_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('BE00_TEST_DATABASE_URL is required for BE-05 delivery integration tests');

const issuer = 'https://be05-issuer.example.test';
const audience = 'fridge-api';
const nowMs = Date.UTC(2026, 8, 9, 8, 0, 0);
const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = {
  ...keyPair.publicKey.export({ format: 'jwk' }),
  kid: 'be05-delivery-key',
  alg: 'ES256',
  use: 'sig',
  key_ops: ['verify'],
};

// Reuse the accepted CreateHouseholdProduct fixture established by the database
// integration suite immediately before API integration runs in BE-00.
const HOUSEHOLD = 'c5c40101-0b05-4c01-8b05-000000000001';
const FOREIGN_CONTEXT = 'c5c4ffff-0b05-4fff-8b05-00000000ffff';
const ADMIN = PrincipalId('c5c40202-0b05-4c02-8b05-000000000002');
const ORDINARY = PrincipalId('c5c40303-0b05-4c03-8b05-000000000003');
const CREATED_PRODUCT = ProductId('c5c4f101-0b05-4f01-8b05-000000000101');
const RETRY_CANDIDATE = ProductId('c5c4f102-0b05-4f02-8b05-000000000102');
const DENIED_CANDIDATE = ProductId('c5c4f103-0b05-4f03-8b05-000000000103');
const ADMIN_SUBJECT = 'be05-catalog-admin-subject';
const ORDINARY_SUBJECT = 'be05-catalog-ordinary-subject';

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

function issueToken(subject: string): string {
  const header = encodeJson({ alg: 'ES256', typ: 'JWT', kid: 'be05-delivery-key' });
  const payload = encodeJson({
    iss: issuer,
    sub: subject,
    aud: audience,
    exp: Math.floor(nowMs / 1000) + 300,
    // Deliberately untrusted provider-side claims. They must never create
    // HOUSEHOLD_CATALOG_ADMINISTER or select the authoritative Household.
    role: 'provider-super-admin',
    household_id: FOREIGN_CONTEXT,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput, 'ascii'), {
    key: keyPair.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function buildIntegrationServer(database: PgDatabase) {
  const verifier = new JwtJwksAuthenticationEvidenceVerifier({
    trust: config.authentication!,
    now: () => nowMs,
    fetch: async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const principalMapper: PlatformPrincipalMapper = {
    async resolve(identity) {
      assert.equal(identity.authority, issuer);
      if (identity.subject === ADMIN_SUBJECT) return ADMIN;
      if (identity.subject === ORDINARY_SUBJECT) return ORDINARY;
      throw new Error('unexpected BE-05 integration identity subject');
    },
  };
  const authenticatedPrincipal = new BearerAuthenticatedPrincipalResolver(verifier, principalMapper);
  const productReader = new PgCurrentProductReader();
  const productCandidates = [CREATED_PRODUCT, RETRY_CANDIDATE, DENIED_CANDIDATE];
  let productCandidateIndex = 0;

  return buildApiServer({
    config,
    readiness: database,
    authenticatedPrincipal,
    readAuthorizedHouseholdContext: new ReadAuthorizedHouseholdContext(database, new PgHouseholdProfileReader()),
    readCurrentHouseholdMembers: new ReadCurrentHouseholdMembersUseCase(database, new PgCurrentHouseholdMembershipReader()),
    addHouseholdMember: new AddHouseholdMemberUseCase(
      database,
      database,
      { generate: () => HouseholdMembershipId('c5c4f901-0b05-4f09-8b05-000000000901') },
    ),
    catalogProducts: {
      listCurrentProducts: new ListCurrentProductsUseCase(database, productReader),
      getCurrentProduct: new GetCurrentProductUseCase(database, productReader),
      createHouseholdProduct: new CreateHouseholdProductUseCase(
        new PgHouseholdCatalogAdministrationTransactionManager(database),
        new PgHouseholdProductWriter(),
        {
          generate() {
            const candidate = productCandidates[productCandidateIndex++];
            if (candidate === undefined) throw new Error('unexpected Product candidate exhaustion');
            return candidate;
          },
        },
      ),
    },
  });
}

test('B5-039 authenticated HTTP phase exit proves catalog authority, durable mutation, replay and subsequent observation', async () => {
  const database = new PgDatabase({ connectionString: databaseUrl, capabilityRole: 'fridge_app', maxConnections: 4 });
  const server = buildIntegrationServer(database);
  const adminToken = issueToken(ADMIN_SUBJECT);
  const ordinaryToken = issueToken(ORDINARY_SUBJECT);
  const commandId = 'c5c4fa01-0b05-4f0a-8b05-000000001001';

  try {
    const created = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/products`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-principal-id': String(ORDINARY),
      },
      payload: { commandId, canonicalName: 'Authenticated Phase Exit Product' },
    });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(created.json(), { productId: String(CREATED_PRODUCT) });

    const replay = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/products`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { commandId, canonicalName: 'Authenticated Phase Exit Product' },
    });
    assert.equal(replay.statusCode, 201);
    assert.deepEqual(replay.json(), { productId: String(CREATED_PRODUCT) });

    const observed = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/products/${CREATED_PRODUCT}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(observed.statusCode, 200);
    assert.equal(observed.json().product.productId, String(CREATED_PRODUCT));
    assert.equal(observed.json().product.catalogScope, 'HOUSEHOLD');
    assert.equal(observed.json().product.ownerHouseholdId, HOUSEHOLD);
    assert.equal(observed.json().product.canonicalName, 'Authenticated Phase Exit Product');

    // Ordinary current membership is sufficient for observation but never upgrades
    // into catalog mutation authority, even with privileged provider claims.
    const ordinaryRead = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/products/${CREATED_PRODUCT}`,
      headers: { authorization: `Bearer ${ordinaryToken}` },
    });
    assert.equal(ordinaryRead.statusCode, 200);

    const ordinaryCreate = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/products`,
      headers: { authorization: `Bearer ${ordinaryToken}` },
      payload: {
        commandId: 'c5c4fa02-0b05-4f0a-8b05-000000001002',
        canonicalName: 'Must Not Exist',
      },
    });
    assert.equal(ordinaryCreate.statusCode, 404);
    assert.equal(ordinaryCreate.json().error.code, 'NOT_FOUND');

    const deniedCandidateRead = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/products/${DENIED_CANDIDATE}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deniedCandidateRead.statusCode, 404);
    assert.equal(deniedCandidateRead.json().error.code, 'NOT_FOUND');

    // A provider-supplied Household claim cannot authorize another Household context.
    const foreignRead = await server.inject({
      method: 'GET',
      url: `/households/${FOREIGN_CONTEXT}/products/${CREATED_PRODUCT}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(foreignRead.statusCode, 404);
    assert.equal(foreignRead.json().error.code, 'NOT_FOUND');

    const listed = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/products`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listed.statusCode, 200);
    assert.ok(listed.json().products.some((product: { productId: string }) => product.productId === String(CREATED_PRODUCT)));
  } finally {
    await server.close();
    await database.close();
  }
});
