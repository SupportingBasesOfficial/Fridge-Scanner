import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRuntimeConfig, RuntimeConfigError } from './index.js';

test('parseRuntimeConfig applies safe non-secret defaults', () => {
  const config = parseRuntimeConfig({
    DATABASE_URL: 'postgresql://app:secret@localhost:5432/fridge',
  });

  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.httpHost, '0.0.0.0');
  assert.equal(config.httpPort, 3000);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.shutdownTimeoutMs, 10_000);
});

test('parseRuntimeConfig fails closed when DATABASE_URL is absent', () => {
  assert.throws(
    () => parseRuntimeConfig({}),
    (error: unknown) => {
      if (!(error instanceof RuntimeConfigError)) {
        return false;
      }
      assert.match(error.message, /DATABASE_URL/);
      return true;
    },
  );
});

test('configuration errors never echo the rejected database URL value', () => {
  const rejected = 'not-a-url-containing-super-secret-password';

  assert.throws(
    () => parseRuntimeConfig({ DATABASE_URL: rejected }),
    (error: unknown) => {
      if (!(error instanceof RuntimeConfigError)) {
        return false;
      }
      assert.doesNotMatch(error.message, /super-secret-password/);
      return true;
    },
  );
});
