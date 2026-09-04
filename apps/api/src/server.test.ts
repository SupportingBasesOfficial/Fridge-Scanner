import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReadinessProbe } from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import { buildApiServer } from './server.js';

const config: RuntimeConfig = {
  nodeEnv: 'test',
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
  databaseCapabilityRole: 'fridge_app',
  httpHost: '127.0.0.1',
  httpPort: 3000,
  logLevel: 'fatal',
  shutdownTimeoutMs: 1_000,
};

function readiness(ready: boolean): ReadinessProbe {
  return {
    async check() {
      return ready ? { ready: true } : { ready: false, reason: 'database_unavailable' };
    },
  };
}

test('liveness is independent from dependency readiness', async () => {
  const server = buildApiServer({ config, readiness: readiness(false) });

  try {
    const response = await server.inject({ method: 'GET', url: '/health/live' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'live' });
  } finally {
    await server.close();
  }
});

test('readiness returns 503 when a required dependency is unavailable', async () => {
  const server = buildApiServer({ config, readiness: readiness(false) });

  try {
    const response = await server.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      status: 'not_ready',
      reason: 'database_unavailable',
    });
  } finally {
    await server.close();
  }
});

test('readiness returns 200 when dependencies are available', async () => {
  const server = buildApiServer({ config, readiness: readiness(true) });

  try {
    const response = await server.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ready' });
  } finally {
    await server.close();
  }
});

test('valid inbound request id is preserved', async () => {
  const server = buildApiServer({ config, readiness: readiness(true) });

  try {
    const response = await server.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'client-request-123' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-request-id'], 'client-request-123');
  } finally {
    await server.close();
  }
});
