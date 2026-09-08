import { randomUUID } from 'node:crypto';
import {
  AddHouseholdMemberUseCase,
  ChangeCompartmentMetadataUseCase,
  ChangeStorageLocationMetadataUseCase,
  CompartmentId,
  CreateCompartmentUseCase,
  CreateStorageLocationUseCase,
  GetCurrentCompartmentUseCase,
  GetCurrentStorageLocationUseCase,
  HouseholdMembershipId,
  ListCurrentCompartmentsUseCase,
  ListCurrentStorageLocationsUseCase,
  ReadAuthorizedHouseholdContext,
  ReadCurrentHouseholdMembersUseCase,
  RetireCompartmentUseCase,
  RetireStorageLocationUseCase,
  StorageLocationId,
} from '@fridge/application';
import { parseRuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { PgCompartmentMetadataChanger } from '@fridge/database/change-compartment-metadata';
import { PgStorageLocationMetadataChanger } from '@fridge/database/change-storage-location-metadata';
import { PgCompartmentWriter } from '@fridge/database/compartment';
import { PgCurrentCompartmentReader } from '@fridge/database/compartment-read';
import { PgCurrentHouseholdMembershipReader } from '@fridge/database/membership-read';
import { PgCompartmentRetirer } from '@fridge/database/retire-compartment';
import { PgStorageLocationRetirer } from '@fridge/database/retire-storage-location';
import { PgHouseholdStorageAdministrationTransactionManager } from '@fridge/database/storage-administration';
import { PgStorageLocationWriter } from '@fridge/database/storage-location';
import { PgCurrentStorageLocationReader } from '@fridge/database/storage-location-read';
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
const readCurrentHouseholdMembers = new ReadCurrentHouseholdMembersUseCase(
  database,
  new PgCurrentHouseholdMembershipReader(),
);
const addHouseholdMember = new AddHouseholdMemberUseCase(
  database,
  database,
  {
    generate: () => HouseholdMembershipId(randomUUID()),
  },
);

const storageAdministration = new PgHouseholdStorageAdministrationTransactionManager(database);
const currentStorageLocations = new PgCurrentStorageLocationReader();
const currentCompartments = new PgCurrentCompartmentReader();
const storageTopology = {
  listCurrentStorageLocations: new ListCurrentStorageLocationsUseCase(
    database,
    currentStorageLocations,
  ),
  getCurrentStorageLocation: new GetCurrentStorageLocationUseCase(
    database,
    currentStorageLocations,
  ),
  createStorageLocation: new CreateStorageLocationUseCase(
    storageAdministration,
    new PgStorageLocationWriter(),
    { generate: () => StorageLocationId(randomUUID()) },
  ),
  changeStorageLocationMetadata: new ChangeStorageLocationMetadataUseCase(
    storageAdministration,
    new PgStorageLocationMetadataChanger(),
  ),
  retireStorageLocation: new RetireStorageLocationUseCase(
    storageAdministration,
    new PgStorageLocationRetirer(),
  ),
  listCurrentCompartments: new ListCurrentCompartmentsUseCase(
    database,
    currentCompartments,
  ),
  getCurrentCompartment: new GetCurrentCompartmentUseCase(
    database,
    currentCompartments,
  ),
  createCompartment: new CreateCompartmentUseCase(
    storageAdministration,
    new PgCompartmentWriter(),
    { generate: () => CompartmentId(randomUUID()) },
  ),
  changeCompartmentMetadata: new ChangeCompartmentMetadataUseCase(
    storageAdministration,
    new PgCompartmentMetadataChanger(),
  ),
  retireCompartment: new RetireCompartmentUseCase(
    storageAdministration,
    new PgCompartmentRetirer(),
  ),
};

const authenticatedPrincipal = buildRuntimeAuthenticatedPrincipalResolver(
  config,
  database,
);
const server = buildApiServer({
  config,
  readiness: database,
  authenticatedPrincipal,
  readAuthorizedHouseholdContext,
  readCurrentHouseholdMembers,
  addHouseholdMember,
  storageTopology,
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
