import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeConfig } from '@fridge/config';
import type { PgDatabase } from '@fridge/database';
import { UnauthenticatedError } from '@fridge/application';
import { buildRuntimeAuthenticatedPrincipalResolver } from './runtime-auth.js';

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

test('runtime authentication remains fail closed when trust configuration is absent', async () => {
  const resolver = buildRuntimeAuthenticatedPrincipalResolver(
    config,
    {} as PgDatabase,
  );

  await assert.rejects(
    resolver.resolve({ headers: {} } as never),
    UnauthenticatedError,
  );
});
