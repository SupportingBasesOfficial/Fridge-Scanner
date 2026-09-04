import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ReadinessProbe } from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface ApiServerDependencies {
  readonly config: RuntimeConfig;
  readonly readiness: ReadinessProbe;
}

export function buildApiServer(dependencies: ApiServerDependencies): FastifyInstance {
  const { config, readiness } = dependencies;

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

  server.setErrorHandler((error, request, reply) => {
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
