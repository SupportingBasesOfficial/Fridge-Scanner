import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { DependencyUnavailableError, UnauthenticatedError } from '@fridge/application';
import type { JwtAuthenticationConfig } from '@fridge/config';
import { JwtJwksAuthenticationEvidenceVerifier } from './jwt-jwks-verifier.js';

const NOW_MS = Date.UTC(2026, 8, 5, 18, 0, 0);
const trust: JwtAuthenticationConfig = Object.freeze({
  issuer: 'https://issuer.example.test/auth/v1',
  audience: 'fridge-api',
  jwksUrl: 'https://issuer.example.test/.well-known/jwks.json',
  algorithms: Object.freeze(['ES256', 'RS256'] as const),
});

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function buildJwt(
  algorithm: 'ES256' | 'RS256',
  privateKey: KeyObject,
  kid: string,
  payloadOverrides: Record<string, unknown> = {},
): string {
  const header = encodeJson({ alg: algorithm, typ: 'JWT', kid });
  const payload = encodeJson({
    iss: trust.issuer,
    sub: 'provider-subject-123',
    aud: trust.audience,
    exp: Math.floor(NOW_MS / 1000) + 300,
    ...payloadOverrides,
  });
  const input = `${header}.${payload}`;
  const signature = sign(
    'sha256',
    Buffer.from(input, 'ascii'),
    algorithm === 'ES256'
      ? { key: privateKey, dsaEncoding: 'ieee-p1363' }
      : privateKey,
  );
  return `${input}.${signature.toString('base64url')}`;
}

function createFixture(algorithm: 'ES256' | 'RS256', kid = `${algorithm}-kid`) {
  const pair = algorithm === 'ES256'
    ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = pair.publicKey.export({ format: 'jwk' });
  return {
    kid,
    pair,
    jwk: { ...publicJwk, kid, alg: algorithm, use: 'sig', key_ops: ['verify'] },
  };
}

function verifier(keys: readonly unknown[], options: { status?: number } = {}) {
  return new JwtJwksAuthenticationEvidenceVerifier({
    trust,
    now: () => NOW_MS,
    jwksCacheMs: 0,
    fetch: async () => new Response(
      JSON.stringify({ keys }),
      { status: options.status ?? 200, headers: { 'content-type': 'application/json' } },
    ),
  });
}

test('ES256 token verifies to provider-neutral authority and subject', async () => {
  const fixture = createFixture('ES256');
  const result = await verifier([fixture.jwk]).verify({
    kind: 'bearer',
    token: buildJwt('ES256', fixture.pair.privateKey, fixture.kid),
  });
  assert.deepEqual(result, { authority: trust.issuer, subject: 'provider-subject-123' });
});

test('RS256 token verifies when explicitly allowed', async () => {
  const fixture = createFixture('RS256');
  const result = await verifier([fixture.jwk]).verify({
    kind: 'bearer',
    token: buildJwt('RS256', fixture.pair.privateKey, fixture.kid),
  });
  assert.equal(result.subject, 'provider-subject-123');
});

test('RS256 rejects RSA keys below the 2048-bit security floor', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const kid = 'weak-rsa-kid';
  const publicJwk = pair.publicKey.export({ format: 'jwk' });
  const weakJwk = { ...publicJwk, kid, alg: 'RS256', use: 'sig', key_ops: ['verify'] };
  const token = buildJwt('RS256', pair.privateKey, kid);

  await assert.rejects(
    verifier([weakJwk]).verify({ kind: 'bearer', token }),
    UnauthenticatedError,
  );
});

test('forged signature, wrong issuer, wrong audience, expiry and future nbf fail closed', async () => {
  const fixture = createFixture('ES256');
  const attacker = createFixture('ES256', fixture.kid);
  const cases = [
    buildJwt('ES256', attacker.pair.privateKey, fixture.kid),
    buildJwt('ES256', fixture.pair.privateKey, fixture.kid, { iss: 'https://evil.example.test' }),
    buildJwt('ES256', fixture.pair.privateKey, fixture.kid, { aud: 'other-api' }),
    buildJwt('ES256', fixture.pair.privateKey, fixture.kid, { exp: Math.floor(NOW_MS / 1000) }),
    buildJwt('ES256', fixture.pair.privateKey, fixture.kid, { nbf: Math.floor(NOW_MS / 1000) + 60 }),
  ];
  for (const token of cases) {
    await assert.rejects(verifier([fixture.jwk]).verify({ kind: 'bearer', token }), UnauthenticatedError);
  }
});

test('missing subject and unknown kid fail closed', async () => {
  const fixture = createFixture('ES256');
  await assert.rejects(
    verifier([fixture.jwk]).verify({
      kind: 'bearer',
      token: buildJwt('ES256', fixture.pair.privateKey, fixture.kid, { sub: '' }),
    }),
    UnauthenticatedError,
  );
  await assert.rejects(
    verifier([fixture.jwk]).verify({
      kind: 'bearer',
      token: buildJwt('ES256', fixture.pair.privateKey, 'unknown-kid'),
    }),
    UnauthenticatedError,
  );
});

test('JWKS transport or service failure preserves dependency-unavailable semantics', async () => {
  const fixture = createFixture('ES256');
  const token = buildJwt('ES256', fixture.pair.privateKey, fixture.kid);
  const unavailable = new JwtJwksAuthenticationEvidenceVerifier({
    trust,
    now: () => NOW_MS,
    fetch: async () => { throw new Error('provider secret diagnostic'); },
  });
  await assert.rejects(unavailable.verify({ kind: 'bearer', token }), DependencyUnavailableError);
  await assert.rejects(verifier([], { status: 503 }).verify({ kind: 'bearer', token }), DependencyUnavailableError);
});

test('JWKS fetch deadline covers a transport that never resolves', async () => {
  const fixture = createFixture('ES256');
  const token = buildJwt('ES256', fixture.pair.privateKey, fixture.kid);
  const hanging = new JwtJwksAuthenticationEvidenceVerifier({
    trust,
    now: () => NOW_MS,
    jwksFetchTimeoutMs: 100,
    fetch: async () => new Promise<Response>(() => undefined),
  });

  await assert.rejects(
    hanging.verify({ kind: 'bearer', token }),
    DependencyUnavailableError,
  );
});

test('JWKS body is rejected as soon as the bounded response size is exceeded', async () => {
  const fixture = createFixture('ES256');
  const token = buildJwt('ES256', fixture.pair.privateKey, fixture.kid);
  const oversized = new JwtJwksAuthenticationEvidenceVerifier({
    trust,
    now: () => NOW_MS,
    fetch: async () => new Response('x'.repeat(262_145), { status: 200 }),
  });

  await assert.rejects(
    oversized.verify({ kind: 'bearer', token }),
    DependencyUnavailableError,
  );
});

test('repeated unknown kid cannot trigger unbounded forced JWKS refreshes', async () => {
  const fixture = createFixture('ES256');
  const unknownKidToken = buildJwt('ES256', fixture.pair.privateKey, 'unknown-kid');
  let fetches = 0;
  const protectedVerifier = new JwtJwksAuthenticationEvidenceVerifier({
    trust,
    now: () => NOW_MS,
    jwksCacheMs: 60_000,
    fetch: async () => {
      fetches += 1;
      return new Response(JSON.stringify({ keys: [fixture.jwk] }), { status: 200 });
    },
  });

  await assert.rejects(
    protectedVerifier.verify({ kind: 'bearer', token: unknownKidToken }),
    UnauthenticatedError,
  );
  await assert.rejects(
    protectedVerifier.verify({ kind: 'bearer', token: unknownKidToken }),
    UnauthenticatedError,
  );
  assert.equal(fetches, 2);
});

test('JWT verification ignores provider roles and tenant hints for returned authority', async () => {
  const fixture = createFixture('ES256');
  const result = await verifier([fixture.jwk]).verify({
    kind: 'bearer',
    token: buildJwt('ES256', fixture.pair.privateKey, fixture.kid, {
      role: 'provider-admin',
      organization: 'other-household',
      household_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }),
  });
  assert.deepEqual(Object.keys(result).sort(), ['authority', 'subject']);
});
