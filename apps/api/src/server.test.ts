import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  HouseholdUnauthorizedError,
  PrincipalId,
  UnauthenticatedError,
  instant,
  type AddHouseholdMemberInput,
  type AddHouseholdMemberOutput,
  type AuthorizedHouseholdContext,
  type ReadAuthorizedHouseholdContextInput,
  type ReadCurrentHouseholdMembersInput,
  type ReadCurrentHouseholdMembersOutput,
  type ReadinessProbe,
  type UseCase,
} from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import {
  buildApiServer,
  type AuthenticatedPrincipalResolver,
} from './server.js';

const config: RuntimeConfig = {
  nodeEnv: 'test',
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
  databaseCapabilityRole: 'fridge_app',
  httpHost: '127.0.0.1',
  httpPort: 3000,
  logLevel: 'fatal',
  shutdownTimeoutMs: 1_000,
  authentication: null,
};

const principalId = PrincipalId('11111111-1111-4111-8111-111111111111');
const targetPrincipalId = PrincipalId('22222222-2222-4222-8222-222222222222');
const householdId = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const membershipId = HouseholdMembershipId('33333333-3333-4333-8333-333333333333');
const commandId = CommandId('44444444-4444-4444-8444-444444444444');

function readiness(ready: boolean): ReadinessProbe {
  return {
    async check() {
      return ready ? { ready: true } : { ready: false, reason: 'database_unavailable' };
    },
  };
}

function authenticatedPrincipal(
  resolve: AuthenticatedPrincipalResolver['resolve'] = async () => principalId,
): AuthenticatedPrincipalResolver {
  return { resolve };
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

function currentMembersUseCase(
  execute?: (input: ReadCurrentHouseholdMembersInput) => Promise<ReadCurrentHouseholdMembersOutput>,
): UseCase<ReadCurrentHouseholdMembersInput, ReadCurrentHouseholdMembersOutput> {
  return {
    async execute(input) {
      if (execute !== undefined) return execute(input);
      return {
        members: [{
          membershipId,
          principalId,
          displayName: 'Casa Principal',
          roleCode: 'OWNER',
          effectiveFrom: instant('2026-09-07T00:00:00Z'),
          effectiveTo: null,
        }],
      };
    },
  };
}

function addMemberUseCase(
  execute?: (input: AddHouseholdMemberInput) => Promise<AddHouseholdMemberOutput>,
): UseCase<AddHouseholdMemberInput, AddHouseholdMemberOutput> {
  return {
    async execute(input) {
      if (execute !== undefined) return execute(input);
      return { membershipId };
    },
  };
}

function buildTestServer(
  ready = true,
  useCase = householdContextUseCase(),
  principal = authenticatedPrincipal(),
  currentMembers = currentMembersUseCase(),
  addMember = addMemberUseCase(),
) {
  return buildApiServer({
    config,
    readiness: readiness(ready),
    authenticatedPrincipal: principal,
    readAuthorizedHouseholdContext: useCase,
    readCurrentHouseholdMembers: currentMembers,
    addHouseholdMember: addMember,
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

test('proving route uses injected authenticated principal and explicitly serializes verified context', async () => {
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

test('current-member route resolves authenticated principal and returns provider-neutral wire fields', async () => {
  const server = buildTestServer(
    true,
    householdContextUseCase(),
    authenticatedPrincipal(),
    currentMembersUseCase(async (input) => {
      assert.equal(input.actorPrincipalId, principalId);
      assert.equal(input.householdId, householdId);
      return {
        members: [{
          membershipId,
          principalId: targetPrincipalId,
          displayName: 'Target',
          roleCode: 'MEMBER',
          effectiveFrom: instant('2026-09-07T01:02:03Z'),
          effectiveTo: null,
        }],
      };
    }),
  );

  try {
    const response = await server.inject({
      method: 'GET',
      url: `/households/${householdId}/members`,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      members: [{
        membershipId: String(membershipId),
        principalId: String(targetPrincipalId),
        displayName: 'Target',
        roleCode: 'MEMBER',
        effectiveFrom: '2026-09-07T01:02:03Z',
        effectiveTo: null,
      }],
    });
  } finally {
    await server.close();
  }
});

test('add-member route preserves caller CommandId and authenticated actor identity', async () => {
  const server = buildTestServer(
    true,
    householdContextUseCase(),
    authenticatedPrincipal(),
    currentMembersUseCase(),
    addMemberUseCase(async (input) => {
      assert.equal(input.commandId, commandId);
      assert.equal(input.actorPrincipalId, principalId);
      assert.equal(input.householdId, householdId);
      assert.equal(input.targetPrincipalId, targetPrincipalId);
      assert.equal(input.roleCode, 'MEMBER');
      return { membershipId };
    }),
  );

  try {
    const response = await server.inject({
      method: 'POST',
      url: `/households/${householdId}/members`,
      payload: {
        commandId: String(commandId),
        targetPrincipalId: String(targetPrincipalId),
        roleCode: 'MEMBER',
      },
    });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json(), { membershipId: String(membershipId) });
  } finally {
    await server.close();
  }
});

test('malformed add-member wire identity is rejected before application execution', async () => {
  let executions = 0;
  const server = buildTestServer(
    true,
    householdContextUseCase(),
    authenticatedPrincipal(),
    currentMembersUseCase(),
    addMemberUseCase(async () => {
      executions += 1;
      throw new Error('must not execute');
    }),
  );

  try {
    const response = await server.inject({
      method: 'POST',
      url: `/households/${householdId}/members`,
      payload: {
        commandId: 'not-a-uuid',
        targetPrincipalId: String(targetPrincipalId),
        roleCode: 'MEMBER',
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(executions, 0);
  } finally {
    await server.close();
  }
});

test('proving route fails closed when authentication authority cannot resolve a principal', async () => {
  let executions = 0;
  const server = buildTestServer(
    true,
    householdContextUseCase(async () => {
      executions += 1;
      throw new Error('must not execute');
    }),
    authenticatedPrincipal(async () => {
      throw new UnauthenticatedError();
    }),
  );

  try {
    const response = await server.inject({
      method: 'GET',
      url: `/be01/proving/households/${householdId}/context`,
    });
    assert.equal(response.statusCode, 401);
    assert.equal(executions, 0);
  } finally {
    await server.close();
  }
});

test('malformed Household identifier is rejected before use-case execution', async () => {
  let executions = 0;
  const server = buildTestServer(true, householdContextUseCase(async () => {
    executions += 1;
    throw new Error('must not execute');
  }));

  try {
    const response = await server.inject({
      method: 'GET',
      url: '/be01/proving/households/not-a-uuid/context',
    });
    assert.equal(response.statusCode, 400);
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
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'NOT_FOUND');
  } finally {
    await server.close();
  }
});
