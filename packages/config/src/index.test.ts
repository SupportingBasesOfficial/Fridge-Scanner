import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRuntimeConfig, RuntimeConfigError } from './index.js';

const DATABASE_URL = 'postgresql://app:secret@localhost:5432/fridge';

function completeAuthEnv() {
  return {
    AUTH_JWT_ISSUER: 'https://issuer.example.test/auth/v1',
    AUTH_JWT_AUDIENCE: 'fridge-api',
    AUTH_JWT_JWKS_URL: 'https://issuer.example.test/auth/v1/.well-known/jwks.json',
    AUTH_JWT_ALGORITHMS: 'ES256,RS256',
  };
}

test('parseRuntimeConfig applies safe non-secret defaults', () => {
  const config = parseRuntimeConfig({ DATABASE_URL });

  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.databaseCapabilityRole, 'fridge_app');
  assert.equal(config.httpHost, '0.0.0.0');
  assert.equal(config.httpPort, 3000);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.shutdownTimeoutMs, 10_000);
  assert.equal(config.authentication, null);
});

test('parseRuntimeConfig accepts complete asymmetric JWT trust configuration', () => {
  const config = parseRuntimeConfig({
    DATABASE_URL,
    ...completeAuthEnv(),
  });

  assert.deepEqual(config.authentication, {
    issuer: 'https://issuer.example.test/auth/v1',
    audience: 'fridge-api',
    jwksUrl: 'https://issuer.example.test/auth/v1/.well-known/jwks.json',
    algorithms: ['ES256', 'RS256'],
  });
});

test('configured authentication requires fridge_app database capability', () => {
  for (const role of ['fridge_worker', 'fridge_readonly']) {
    assert.throws(
      () => parseRuntimeConfig({
        DATABASE_URL,
        DATABASE_CAPABILITY_ROLE: role,
        ...completeAuthEnv(),
      }),
      (error: unknown) => {
        if (!(error instanceof RuntimeConfigError)) return false;
        assert.match(error.message, /DATABASE_CAPABILITY_ROLE/);
        assert.match(error.message, /fridge_app/);
        return true;
      },
    );
  }
});

test('partial JWT trust configuration fails closed', () => {
  assert.throws(
    () => parseRuntimeConfig({
      DATABASE_URL,
      AUTH_JWT_ISSUER: 'https://issuer.example.test/auth/v1',
    }),
    RuntimeConfigError,
  );
});

test('JWT trust configuration rejects symmetric, unknown, spaced and duplicate algorithms', () => {
  for (const algorithms of ['HS256', 'ES384', 'ES256, RS256', 'ES256,ES256']) {
    assert.throws(
      () => parseRuntimeConfig({
        DATABASE_URL,
        AUTH_JWT_ISSUER: 'https://issuer.example.test/auth/v1',
        AUTH_JWT_AUDIENCE: 'fridge-api',
        AUTH_JWT_JWKS_URL: 'https://issuer.example.test/jwks.json',
        AUTH_JWT_ALGORITHMS: algorithms,
      }),
      RuntimeConfigError,
    );
  }
});

test('production JWT trust requires HTTPS JWKS transport', () => {
  assert.throws(
    () => parseRuntimeConfig({
      NODE_ENV: 'production',
      DATABASE_URL,
      AUTH_JWT_ISSUER: 'https://issuer.example.test/auth/v1',
      AUTH_JWT_AUDIENCE: 'fridge-api',
      AUTH_JWT_JWKS_URL: 'http://issuer.example.test/jwks.json',
      AUTH_JWT_ALGORITHMS: 'ES256',
    }),
    RuntimeConfigError,
  );
});

test('parseRuntimeConfig rejects privileged database roles', () => {
  assert.throws(
    () => parseRuntimeConfig({
      DATABASE_URL,
      DATABASE_CAPABILITY_ROLE: 'fridge_owner',
    }),
    (error: unknown) => {
      if (!(error instanceof RuntimeConfigError)) return false;
      assert.match(error.message, /DATABASE_CAPABILITY_ROLE/);
      return true;
    },
  );
});

test('parseRuntimeConfig fails closed when DATABASE_URL is absent', () => {
  assert.throws(() => parseRuntimeConfig({}), RuntimeConfigError);
});

test('configuration errors never echo the rejected database URL value', () => {
  const rejected = 'not-a-url-containing-super-secret-password';
  assert.throws(
    () => parseRuntimeConfig({ DATABASE_URL: rejected }),
    (error: unknown) => {
      if (!(error instanceof RuntimeConfigError)) return false;
      assert.doesNotMatch(error.message, /super-secret-password/);
      return true;
    },
  );
});
