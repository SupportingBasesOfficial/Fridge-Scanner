import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  ApplicationError,
  CommandId,
  HouseholdId,
  InvalidInputError,
  PrincipalId,
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
import type { AuthenticatedPrincipalResolver } from './auth.js';

export {
  rejectUnauthenticatedPrincipal,
  type AuthenticatedPrincipalResolver,
} from './auth.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface ApiServerDependencies {
  readonly config: RuntimeConfig;
  readonly readiness: ReadinessProbe;
  readonly authenticatedPrincipal: AuthenticatedPrincipalResolver;
  readonly readAuthorizedHouseholdContext: UseCase<
    ReadAuthorizedHouseholdContextInput,
    AuthorizedHouseholdContext
  >;
  readonly readCurrentHouseholdMembers: UseCase<
    ReadCurrentHouseholdMembersInput,
    ReadCurrentHouseholdMembersOutput
  >;
  readonly addHouseholdMember: UseCase<
    AddHouseholdMemberInput,
    AddHouseholdMemberOutput
  >;
}

function parseHouseholdId(value: string) {
  try {
    return HouseholdId(value);
  } catch (error) {
    throw new InvalidInputError('Household identifier is invalid', error);
  }
}

function parsePrincipalId(value: unknown) {
  if (typeof value !== 'string') {
    throw new InvalidInputError('Principal identifier is invalid');
  }
  try {
    return PrincipalId(value);
  } catch (error) {
    throw new InvalidInputError('Principal identifier is invalid', error);
  }
}

function parseCommandId(value: unknown) {
  if (typeof value !== 'string') {
    throw new InvalidInputError('Command identifier is invalid');
  }
  try {
    return CommandId(value);
  } catch (error) {
    throw new InvalidInputError('Command identifier is invalid', error);
  }
}

function requireRoleCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidInputError('Household role code is invalid');
  }
  return value;
}

function serializeAuthorizedHouseholdContext(context: AuthorizedHouseholdContext) {
  return {
    principalId: String(context.principalId),
    householdId: String(context.householdId),
    householdDisplayName: context.householdDisplayName,
    membershipId: String(context.membershipId),
    householdRoleCode: context.householdRoleCode,
  };
}

function serializeCurrentHouseholdMembers(output: ReadCurrentHouseholdMembersOutput) {
  return {
    members: output.members.map((member) => ({
      membershipId: String(member.membershipId),
      principalId: String(member.principalId),
      displayName: member.displayName,
      roleCode: member.roleCode,
      effectiveFrom: String(member.effectiveFrom),
      effectiveTo: member.effectiveTo === null ? null : String(member.effectiveTo),
    })),
  };
}

function applicationStatusCode(error: ApplicationError): number {
  switch (error.code) {
    case 'INVALID_INPUT': return 400;
    case 'UNAUTHENTICATED': return 401;
    case 'HOUSEHOLD_UNAUTHORIZED':
    case 'NOT_FOUND': return 404;
    case 'CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
    case 'IDEMPOTENCY_IN_PROGRESS': return 409;
    case 'DEPENDENCY_UNAVAILABLE': return 503;
    case 'INTERNAL': return 500;
  }
}

function externalApplicationErrorCode(error: ApplicationError): string {
  if (error.code === 'HOUSEHOLD_UNAUTHORIZED' || error.code === 'NOT_FOUND') {
    return 'NOT_FOUND';
  }
  return error.code;
}

export function buildApiServer(dependencies: ApiServerDependencies): FastifyInstance {
  const {
    config,
    readiness,
    authenticatedPrincipal,
    readAuthorizedHouseholdContext,
    readCurrentHouseholdMembers,
    addHouseholdMember,
  } = dependencies;

  const server = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId(request) {
      const supplied = request.headers['x-request-id'];
      if (typeof supplied === 'string' && REQUEST_ID_PATTERN.test(supplied)) {
        return supplied;
      }
      return randomUUID();
    },
  });

  server.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  server.get('/health/live', async () => ({
    status: 'live',
  }));

  server.get('/health/ready', async (_request, reply) => {
    const result = await readiness.check();

    if (!result.ready) {
      return reply.code(503).send({
        status: 'not_ready',
        reason: result.reason ?? 'dependency_unavailable',
      });
    }

    return {
      status: 'ready',
    };
  });

  server.get<{ Params: { householdId: string } }>(
    '/be01/proving/households/:householdId/context',
    async (request) => {
      const principalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const context = await readAuthorizedHouseholdContext.execute({ principalId, householdId });
      return serializeAuthorizedHouseholdContext(context);
    },
  );

  server.get<{ Params: { householdId: string } }>(
    '/households/:householdId/members',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await readCurrentHouseholdMembers.execute({
        actorPrincipalId,
        householdId,
      });
      return serializeCurrentHouseholdMembers(output);
    },
  );

  server.post<{
    Params: { householdId: string };
    Body: {
      commandId?: unknown;
      targetPrincipalId?: unknown;
      roleCode?: unknown;
    };
  }>(
    '/households/:householdId/members',
    async (request, reply) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const commandId = parseCommandId(request.body?.commandId);
      const targetPrincipalId = parsePrincipalId(request.body?.targetPrincipalId);
      const roleCode = requireRoleCode(request.body?.roleCode);

      const output = await addHouseholdMember.execute({
        commandId,
        actorPrincipalId,
        householdId,
        targetPrincipalId,
        roleCode,
      });

      return reply.code(201).send({
        membershipId: String(output.membershipId),
      });
    },
  );

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ApplicationError) {
      const statusCode = applicationStatusCode(error);
      if (statusCode >= 500) {
        request.log.error({ err: error }, 'application request failed');
      }
      void reply.code(statusCode).send({
        error: {
          code: externalApplicationErrorCode(error),
          requestId: request.id,
        },
      });
      return;
    }

    request.log.error({ err: error }, 'request failed');
    void reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        requestId: request.id,
      },
    });
  });

  return server;
}
