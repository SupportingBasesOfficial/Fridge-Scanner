import { ReadAuthorizedHouseholdContext } from '@fridge/application';
import { parseRuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { buildRuntimeAuthenticatedPrincipalResolver } from './runtime-auth.js';
import { buildApiServer } from './server.js';

const config = parseRuntimeConfig(process.env);
const database = new PgDatabase({
  connectionString: config.databaseUrl,
  capabilityRole: config.databaseCapabilityRole,
});
const householdProfiles = new PgHouseholdProfileReader();
const readAuthorizedHouseholdContext = new ReadAuthorizedHouseholdContext(
  database,
  householdProfiles,
);
const authenticatedPrincipal = buildRuntimeAuthenticatedPrincipalResolver(
  config,
  database,
);
const server = buildApiServer({
  config,
  readiness: database,
  authenticatedPrincipal,
  readAuthorizedHouseholdContext,
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server.log.info({ signal }, 'shutdown requested');

  const forceExitTimer = setTimeout(() => {
    server.log.fatal({ signal }, 'graceful shutdown deadline exceeded');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  forceExitTimer.unref();

  try {
    await server.close();
    await database.close();
    clearTimeout(forceExitTimer);
    server.log.info({ signal }, 'shutdown complete');
  } catch (error) {
    clearTimeout(forceExitTimer);
    server.log.error({ err: error, signal }, 'shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

try {
  await server.listen({
    host: config.httpHost,
    port: config.httpPort,
  });
} catch (error) {
  server.log.fatal({ err: error }, 'API startup failed');
  await database.close().catch(() => undefined);
  process.exitCode = 1;
}
