import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HouseholdMembershipId,
  PrincipalId,
  type AuthorizedHouseholdContext,
  type ReadAuthorizedHouseholdContextInput,
  type ReadCurrentHouseholdMembersInput,
  type ReadCurrentHouseholdMembersOutput,
  type AddHouseholdMemberInput,
  type AddHouseholdMemberOutput,
  type UseCase,
} from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import { buildApiServer } from './server.js';

const principalId = PrincipalId('11111111-1111-4111-8111-111111111111');
const membershipId = HouseholdMembershipId('33333333-3333-4333-8333-333333333333');
const householdId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function buildServer(executionCounter: { value: number }) {
  const context: UseCase<ReadAuthorizedHouseholdContextInput, AuthorizedHouseholdContext> = {
    async execute(input) {
      return {
        principalId: input.principalId,
        householdId: input.householdId,
        householdDisplayName: 'Household',
        membershipId,
        householdRoleCode: 'MEMBER',
      };
    },
  };
  const members: UseCase<ReadCurrentHouseholdMembersInput, ReadCurrentHouseholdMembersOutput> = {
    async execute() {
      return { members: [] };
    },
  };
  const add: UseCase<AddHouseholdMemberInput, AddHouseholdMemberOutput> = {
    async execute() {
      executionCounter.value += 1;
      throw new Error('application use case must not execute for parser failures');
    },
  };

  return buildApiServer({
    config,
    readiness: { async check() { return { ready: true }; } },
    authenticatedPrincipal: { async resolve() { return principalId; } },
    readAuthorizedHouseholdContext: context,
    readCurrentHouseholdMembers: members,
    addHouseholdMember: add,
  });
}

test('malformed JSON preserves Fastify 400 while normalizing the public error body', async () => {
  const executions = { value: 0 };
  const server = buildServer(executions);

  try {
    const response = await server.inject({
      method: 'POST',
      url: `/households/${householdId}/members`,
      headers: { 'content-type': 'application/json' },
      payload: '{"commandId":',
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');
    assert.equal(typeof response.json().error.requestId, 'string');
    assert.equal(executions.value, 0);
  } finally {
    await server.close();
  }
});

test('unsupported media type preserves Fastify 415 while normalizing the public error body', async () => {
  const executions = { value: 0 };
  const server = buildServer(executions);

  try {
    const response = await server.inject({
      method: 'POST',
      url: `/households/${householdId}/members`,
      headers: { 'content-type': 'application/xml' },
      payload: '<membership/>',
    });

    assert.equal(response.statusCode, 415);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');
    assert.equal(typeof response.json().error.requestId, 'string');
    assert.equal(executions.value, 0);
  } finally {
    await server.close();
  }
});
