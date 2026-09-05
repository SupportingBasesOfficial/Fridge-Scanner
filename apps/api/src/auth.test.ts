import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyRequest } from 'fastify';
import {
  PrincipalId,
  UnauthenticatedError,
} from '@fridge/application';
import {
  BearerAuthenticatedPrincipalResolver,
  type AuthenticationEvidenceVerifier,
  type PlatformPrincipalMapper,
  type VerifiedExternalIdentity,
} from './auth.js';

const principalId = PrincipalId('11111111-1111-4111-8111-111111111111');
const verifiedIdentity: VerifiedExternalIdentity = {
  authority: 'https://identity.example.test',
  subject: 'provider-subject-123',
};

function request(headers: Record<string, string | string[] | undefined> = {}): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

function verifier(
  verify: AuthenticationEvidenceVerifier['verify'],
): AuthenticationEvidenceVerifier {
  return { verify };
}

function mapper(
  resolve: PlatformPrincipalMapper['resolve'],
): PlatformPrincipalMapper {
  return { resolve };
}

test('missing Authorization evidence fails closed before verifier or mapper execution', async () => {
  let verifications = 0;
  let mappings = 0;
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async () => {
      verifications += 1;
      return verifiedIdentity;
    }),
    mapper(async () => {
      mappings += 1;
      return principalId;
    }),
  );

  await assert.rejects(
    resolver.resolve(request({ 'x-principal-id': String(principalId) })),
    UnauthenticatedError,
  );
  assert.equal(verifications, 0);
  assert.equal(mappings, 0);
});

test('non-Bearer authorization evidence is rejected before verification', async () => {
  let verifications = 0;
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async () => {
      verifications += 1;
      return verifiedIdentity;
    }),
    mapper(async () => principalId),
  );

  await assert.rejects(
    resolver.resolve(request({ authorization: 'Basic Zm9vOmJhcg==' })),
    UnauthenticatedError,
  );
  assert.equal(verifications, 0);
});

test('malformed Bearer framing is rejected rather than normalized', async () => {
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async () => verifiedIdentity),
    mapper(async () => principalId),
  );

  for (const authorization of [
    'Bearer',
    'Bearer  token',
    'Bearer token extra',
    'Bearer token,second',
  ]) {
    await assert.rejects(
      resolver.resolve(request({ authorization })),
      UnauthenticatedError,
    );
  }
});

test('valid Bearer evidence crosses verifier then exact external-identity mapping', async () => {
  const calls: string[] = [];
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async (evidence) => {
      calls.push(`verify:${evidence.kind}:${evidence.token}`);
      return verifiedIdentity;
    }),
    mapper(async (identity) => {
      calls.push(`map:${identity.authority}:${identity.subject}`);
      assert.deepEqual(identity, verifiedIdentity);
      return principalId;
    }),
  );

  const result = await resolver.resolve(request({
    authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature',
    'x-principal-id': '99999999-9999-4999-8999-999999999999',
  }));

  assert.equal(result, principalId);
  assert.deepEqual(calls, [
    'verify:bearer:eyJhbGciOiJSUzI1NiJ9.payload.signature',
    'map:https://identity.example.test:provider-subject-123',
  ]);
});

test('invalid verifier output fails closed before platform mapping', async () => {
  let mappings = 0;
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async () => ({ authority: '', subject: 'subject' })),
    mapper(async () => {
      mappings += 1;
      return principalId;
    }),
  );

  await assert.rejects(
    resolver.resolve(request({ authorization: 'Bearer opaque-token' })),
    UnauthenticatedError,
  );
  assert.equal(mappings, 0);
});
