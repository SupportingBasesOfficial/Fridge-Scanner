import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyRequest } from 'fastify';
import {
  DependencyUnavailableError,
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

function unsafeVerifier(value: unknown): AuthenticationEvidenceVerifier {
  return {
    async verify() {
      return value as VerifiedExternalIdentity;
    },
  };
}

function mapper(resolve: PlatformPrincipalMapper['resolve']): PlatformPrincipalMapper {
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

test('untyped verifier output is validated before dereferencing or platform mapping', async () => {
  const invalidOutputs: unknown[] = [
    null,
    undefined,
    {},
    { subject: 'subject' },
    { authority: 'authority' },
    { authority: null, subject: 'subject' },
    { authority: 'authority', subject: null },
    { authority: 42, subject: 'subject' },
    { authority: 'authority', subject: 42 },
  ];

  for (const output of invalidOutputs) {
    let mappings = 0;
    const resolver = new BearerAuthenticatedPrincipalResolver(
      unsafeVerifier(output),
      mapper(async () => {
        mappings += 1;
        return principalId;
      }),
    );

    await assert.rejects(
      resolver.resolve(request({ authorization: 'Bearer opaque-token' })),
      (error: unknown) => {
        assert.ok(error instanceof UnauthenticatedError);
        assert.equal(error.cause, undefined);
        return true;
      },
    );
    assert.equal(mappings, 0);
  }
});

test('throwing identity accessors are sanitized before mapping', async () => {
  let mappings = 0;
  const hostileIdentity = Object.defineProperties({}, {
    authority: {
      enumerable: true,
      get() {
        throw new Error('provider getter leaked secret diagnostic');
      },
    },
    subject: {
      enumerable: true,
      value: 'subject',
    },
  });

  const resolver = new BearerAuthenticatedPrincipalResolver(
    unsafeVerifier(hostileIdentity),
    mapper(async () => {
      mappings += 1;
      return principalId;
    }),
  );

  await assert.rejects(
    resolver.resolve(request({ authorization: 'Bearer opaque-token' })),
    (error: unknown) => {
      assert.ok(error instanceof UnauthenticatedError);
      assert.equal(error.cause, undefined);
      assert.equal(String(error).includes('secret diagnostic'), false);
      return true;
    },
  );
  assert.equal(mappings, 0);
});

test('mapper receives a minimal stable identity snapshot instead of provider object', async () => {
  let authority = verifiedIdentity.authority;
  let subject = verifiedIdentity.subject;
  const providerObject = {
    get authority() {
      return authority;
    },
    get subject() {
      return subject;
    },
    rawToken: 'must-not-cross-boundary',
    claims: { role: 'provider-admin' },
  };

  const resolver = new BearerAuthenticatedPrincipalResolver(
    unsafeVerifier(providerObject),
    mapper(async (identity) => {
      assert.deepEqual(identity, verifiedIdentity);
      assert.notEqual(identity, providerObject);
      assert.deepEqual(Object.keys(identity).sort(), ['authority', 'subject']);
      assert.equal('rawToken' in identity, false);
      assert.equal('claims' in identity, false);
      authority = 'https://mutated.example.test';
      subject = 'mutated-subject';
      assert.deepEqual(identity, verifiedIdentity);
      return principalId;
    }),
  );

  assert.equal(
    await resolver.resolve(request({ authorization: 'Bearer opaque-token' })),
    principalId,
  );
});

test('verifier exceptions are translated without leaking credential-bearing diagnostics', async () => {
  const token = 'secret-token-material';
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async () => {
      throw new Error(`provider rejected ${token} with decoded claims`);
    }),
    mapper(async () => principalId),
  );

  await assert.rejects(
    resolver.resolve(request({ authorization: `Bearer ${token}` })),
    (error: unknown) => {
      assert.ok(error instanceof UnauthenticatedError);
      assert.equal(error.message, 'authentication is required');
      assert.equal(error.cause, undefined);
      assert.equal(String(error).includes(token), false);
      return true;
    },
  );
});

test('verifier dependency failures preserve availability semantics without provider diagnostics', async () => {
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async () => {
      throw new DependencyUnavailableError('identity provider unavailable: secret diagnostic');
    }),
    mapper(async () => principalId),
  );

  await assert.rejects(
    resolver.resolve(request({ authorization: 'Bearer opaque-token' })),
    (error: unknown) => {
      assert.ok(error instanceof DependencyUnavailableError);
      assert.equal(error.message, 'required dependency is unavailable');
      assert.equal(error.cause, undefined);
      assert.equal(String(error).includes('secret diagnostic'), false);
      return true;
    },
  );
});

test('principal mapper failures become unauthenticated without leaking external identity diagnostics', async () => {
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async () => verifiedIdentity),
    mapper(async (identity) => {
      throw new Error(`mapping failed for ${identity.authority} / ${identity.subject}`);
    }),
  );

  await assert.rejects(
    resolver.resolve(request({ authorization: 'Bearer opaque-token' })),
    (error: unknown) => {
      assert.ok(error instanceof UnauthenticatedError);
      assert.equal(error.message, 'authentication is required');
      assert.equal(error.cause, undefined);
      assert.equal(String(error).includes(verifiedIdentity.authority), false);
      assert.equal(String(error).includes(verifiedIdentity.subject), false);
      return true;
    },
  );
});

test('principal mapper dependency failures preserve availability semantics without mapper diagnostics', async () => {
  const resolver = new BearerAuthenticatedPrincipalResolver(
    verifier(async () => verifiedIdentity),
    mapper(async () => {
      throw new DependencyUnavailableError('mapping database unavailable: secret diagnostic');
    }),
  );

  await assert.rejects(
    resolver.resolve(request({ authorization: 'Bearer opaque-token' })),
    (error: unknown) => {
      assert.ok(error instanceof DependencyUnavailableError);
      assert.equal(error.message, 'required dependency is unavailable');
      assert.equal(error.cause, undefined);
      assert.equal(String(error).includes('secret diagnostic'), false);
      return true;
    },
  );
});
