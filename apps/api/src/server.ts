import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  ApplicationError,
  HouseholdId,
  InvalidInputError,
  PrincipalId,
  UnauthenticatedError,
  type AuthorizedHouseholdContext,
  type ReadAuthorizedHouseholdContextInput,
  type ReadinessProbe,
  type UseCase,
} from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface ApiServerDependencies {
  readonly config: RuntimeConfig;
  readonly readiness: ReadinessProbe;
  readonly readAuthorizedHouseholdContext: UseCase<
    ReadAuthorizedHouseholdContextInput,
    AuthorizedHouseholdContext
  >;
}

function parsePrincipalId(value: string | undefined) {
  if (value === undefined) throw new UnauthenticatedError();
  try {
    return PrincipalId(value);
  } catch (error) {
    throw new InvalidInputError('principal identifier is invalid', error);
  }
}

function parseHouseholdId(value: string) {
  try {
    return HouseholdId(value);
  } catch (error) {
    throw new InvalidInputError('Household identifier is invalid', error);
  }
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

export function buildApiServer(dependencies: ApiServerDependencies): FastifyInstance {
  const { config, readiness, readAuthorizedHouseholdContext } = dependencies;

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
      const principalHeader = request.headers['x-principal-id'];
      const principalId = parsePrincipalId(
        typeof principalHeader === 'string' ? principalHeader : undefined,
      );
      const householdId = parseHouseholdId(request.params.householdId);
      const context = await readAuthorizedHouseholdContext.execute({ principalId, householdId });
      return serializeAuthorizedHouseholdContext(context);
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
          code: error.code,
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
