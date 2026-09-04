import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HouseholdId,
  HouseholdMembershipId,
  HouseholdUnauthorizedError,
  PrincipalId,
  type AuthorizedHouseholdContext,
  type ReadAuthorizedHouseholdContextInput,
  type ReadinessProbe,
  type UseCase,
} from '@fridge/application';
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

const principalId = PrincipalId('11111111-1111-4111-8111-111111111111');
const householdId = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const membershipId = HouseholdMembershipId('33333333-3333-4333-8333-333333333333');

function readiness(ready: boolean): ReadinessProbe {
  return {
    async check() {
      return ready ? { ready: true } : { ready: false, reason: 'database_unavailable' };
    },
  };
}

function householdContextUseCase(
  execute?: (input: ReadAuthorizedHouseholdContextInput) => Promise<AuthorizedHouseholdContext>,
): UseCase<ReadAuthorizedHouseholdContextInput, AuthorizedHouseholdContext> {
  return {
    async execute(input) {
      if (execute !== undefined) return execute(input);
      return {
        principalId: input.principalId,
        householdId: input.householdId,
        householdDisplayName: 'Casa Principal',
        membershipId,
        householdRoleCode: 'OWNER',
      };
    },
  };
}

function buildTestServer(
  ready = true,
  useCase = householdContextUseCase(),
) {
  return buildApiServer({
    config,
    readiness: readiness(ready),
    readAuthorizedHouseholdContext: useCase,
  });
}

test('liveness is independent from dependency readiness', async () => {
  const server = buildTestServer(false);

  try {
    const response = await server.inject({ method: 'GET', url: '/health/live' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'live' });
  } finally {
    await server.close();
  }
});

test('readiness returns 503 when a required dependency is unavailable', async () => {
  const server = buildTestServer(false);

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
  const server = buildTestServer(true);

  try {
    const response = await server.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ready' });
  } finally {
    await server.close();
  }
});

test('valid inbound request id is preserved', async () => {
  const server = buildTestServer(true);

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

test('proving route parses untrusted identifiers once and explicitly serializes verified context', async () => {
  const server = buildTestServer(true, householdContextUseCase(async (input) => {
    assert.equal(input.principalId, principalId);
    assert.equal(input.householdId, householdId);
    return {
      principalId: input.principalId,
      householdId: input.householdId,
      householdDisplayName: 'Casa Principal',
      membershipId,
      householdRoleCode: 'OWNER',
    };
  }));

  try {
    const response = await server.inject({
      method: 'GET',
      url: `/be01/proving/households/${householdId}/context`,
      headers: { 'x-principal-id': principalId },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      principalId: String(principalId),
      householdId: String(householdId),
      householdDisplayName: 'Casa Principal',
      membershipId: String(membershipId),
      householdRoleCode: 'OWNER',
    });
  } finally {
    await server.close();
  }
});

test('proving route rejects missing or malformed identity before use-case execution', async () => {
  let executions = 0;
  const server = buildTestServer(true, householdContextUseCase(async () => {
    executions += 1;
    throw new Error('must not execute');
  }));

  try {
    const missingPrincipal = await server.inject({
      method: 'GET',
      url: `/be01/proving/households/${householdId}/context`,
    });
    assert.equal(missingPrincipal.statusCode, 401);

    const malformedHousehold = await server.inject({
      method: 'GET',
      url: '/be01/proving/households/not-a-uuid/context',
      headers: { 'x-principal-id': principalId },
    });
    assert.equal(malformedHousehold.statusCode, 400);
    assert.equal(executions, 0);
  } finally {
    await server.close();
  }
});

test('unauthorized Household access is externally indistinguishable from missing Household', async () => {
  const server = buildTestServer(true, householdContextUseCase(async () => {
    throw new HouseholdUnauthorizedError();
  }));

  try {
    const response = await server.inject({
      method: 'GET',
      url: `/be01/proving/households/${householdId}/context`,
      headers: { 'x-principal-id': principalId },
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'HOUSEHOLD_UNAUTHORIZED');
  } finally {
    await server.close();
  }
});
