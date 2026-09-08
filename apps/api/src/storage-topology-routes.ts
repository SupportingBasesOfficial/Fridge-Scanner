import type { FastifyInstance } from 'fastify';
import {
  CommandId,
  CompartmentId,
  HouseholdId,
  InvalidInputError,
  StorageLocationId,
  type ChangeCompartmentMetadataInput,
  type ChangeCompartmentMetadataOutput,
  type ChangeStorageLocationMetadataInput,
  type ChangeStorageLocationMetadataOutput,
  type CreateCompartmentInput,
  type CreateCompartmentOutput,
  type CreateStorageLocationInput,
  type CreateStorageLocationOutput,
  type CurrentCompartment,
  type CurrentStorageLocation,
  type GetCurrentCompartmentInput,
  type GetCurrentStorageLocationInput,
  type ListCurrentCompartmentsInput,
  type ListCurrentStorageLocationsInput,
  type RetireCompartmentInput,
  type RetireCompartmentOutput,
  type RetireStorageLocationInput,
  type RetireStorageLocationOutput,
  type UseCase,
} from '@fridge/application';
import type { AuthenticatedPrincipalResolver } from './auth.js';

export interface StorageTopologyRouteDependencies {
  readonly listCurrentStorageLocations: UseCase<
    ListCurrentStorageLocationsInput,
    { readonly storageLocations: readonly CurrentStorageLocation[] }
  >;
  readonly getCurrentStorageLocation: UseCase<
    GetCurrentStorageLocationInput,
    { readonly storageLocation: CurrentStorageLocation }
  >;
  readonly createStorageLocation: UseCase<
    CreateStorageLocationInput,
    CreateStorageLocationOutput
  >;
  readonly changeStorageLocationMetadata: UseCase<
    ChangeStorageLocationMetadataInput,
    ChangeStorageLocationMetadataOutput
  >;
  readonly retireStorageLocation: UseCase<
    RetireStorageLocationInput,
    RetireStorageLocationOutput
  >;
  readonly listCurrentCompartments: UseCase<
    ListCurrentCompartmentsInput,
    { readonly compartments: readonly CurrentCompartment[] }
  >;
  readonly getCurrentCompartment: UseCase<
    GetCurrentCompartmentInput,
    { readonly compartment: CurrentCompartment }
  >;
  readonly createCompartment: UseCase<CreateCompartmentInput, CreateCompartmentOutput>;
  readonly changeCompartmentMetadata: UseCase<
    ChangeCompartmentMetadataInput,
    ChangeCompartmentMetadataOutput
  >;
  readonly retireCompartment: UseCase<RetireCompartmentInput, RetireCompartmentOutput>;
}

function parseHouseholdId(value: string) {
  try {
    return HouseholdId(value);
  } catch (error) {
    throw new InvalidInputError('Household identifier is invalid', error);
  }
}

function parseStorageLocationId(value: string) {
  try {
    return StorageLocationId(value);
  } catch (error) {
    throw new InvalidInputError('StorageLocation identifier is invalid', error);
  }
}

function parseCompartmentId(value: string) {
  try {
    return CompartmentId(value);
  } catch (error) {
    throw new InvalidInputError('Compartment identifier is invalid', error);
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

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new InvalidInputError(`${label} is invalid`);
  }
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireString(value, label);
}

function requireNullableInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InvalidInputError(`${label} is invalid`);
  }
  return value;
}

function serializeStorageLocation(storageLocation: CurrentStorageLocation) {
  return {
    storageLocationId: String(storageLocation.storageLocationId),
    kindCode: storageLocation.kindCode,
    displayName: storageLocation.displayName,
    sortOrder: storageLocation.sortOrder,
    createdAt: String(storageLocation.createdAt),
  };
}

function serializeCompartment(compartment: CurrentCompartment) {
  return {
    compartmentId: String(compartment.compartmentId),
    storageLocationId: String(compartment.storageLocationId),
    kindCode: compartment.kindCode,
    displayName: compartment.displayName,
    sortOrder: compartment.sortOrder,
    createdAt: String(compartment.createdAt),
  };
}

export function registerStorageTopologyRoutes(
  server: FastifyInstance,
  authenticatedPrincipal: AuthenticatedPrincipalResolver,
  dependencies: StorageTopologyRouteDependencies,
): void {
  server.get<{ Params: { householdId: string } }>(
    '/households/:householdId/storage-locations',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.listCurrentStorageLocations.execute({
        actorPrincipalId,
        householdId,
      });
      return { storageLocations: output.storageLocations.map(serializeStorageLocation) };
    },
  );

  server.get<{ Params: { householdId: string; storageLocationId: string } }>(
    '/households/:householdId/storage-locations/:storageLocationId',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const storageLocationId = parseStorageLocationId(request.params.storageLocationId);
      const output = await dependencies.getCurrentStorageLocation.execute({
        actorPrincipalId,
        householdId,
        storageLocationId,
      });
      return { storageLocation: serializeStorageLocation(output.storageLocation) };
    },
  );

  server.post<{
    Params: { householdId: string };
    Body: {
      commandId?: unknown;
      kindCode?: unknown;
      displayName?: unknown;
      sortOrder?: unknown;
    };
  }>(
    '/households/:householdId/storage-locations',
    async (request, reply) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.createStorageLocation.execute({
        commandId: parseCommandId(request.body?.commandId),
        actorPrincipalId,
        householdId,
        kindCode: requireString(request.body?.kindCode, 'StorageLocation kind code'),
        displayName: requireString(request.body?.displayName, 'StorageLocation display name'),
        sortOrder: requireNullableInteger(request.body?.sortOrder, 'StorageLocation sort order'),
      });
      return reply.code(201).send({ storageLocationId: String(output.storageLocationId) });
    },
  );

  server.post<{
    Params: { householdId: string; storageLocationId: string };
    Body: {
      commandId?: unknown;
      kindCode?: unknown;
      displayName?: unknown;
      sortOrder?: unknown;
    };
  }>(
    '/households/:householdId/storage-locations/:storageLocationId/metadata-changes',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.changeStorageLocationMetadata.execute({
        commandId: parseCommandId(request.body?.commandId),
        actorPrincipalId,
        householdId,
        storageLocationId: parseStorageLocationId(request.params.storageLocationId),
        kindCode: requireString(request.body?.kindCode, 'StorageLocation kind code'),
        displayName: requireString(request.body?.displayName, 'StorageLocation display name'),
        sortOrder: requireNullableInteger(request.body?.sortOrder, 'StorageLocation sort order'),
      });
      return { storageLocationId: String(output.storageLocationId) };
    },
  );

  server.post<{
    Params: { householdId: string; storageLocationId: string };
    Body: { commandId?: unknown };
  }>(
    '/households/:householdId/storage-locations/:storageLocationId/retirements',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.retireStorageLocation.execute({
        commandId: parseCommandId(request.body?.commandId),
        actorPrincipalId,
        householdId,
        storageLocationId: parseStorageLocationId(request.params.storageLocationId),
      });
      return { storageLocationId: String(output.storageLocationId) };
    },
  );

  server.get<{ Params: { householdId: string; storageLocationId: string } }>(
    '/households/:householdId/storage-locations/:storageLocationId/compartments',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const storageLocationId = parseStorageLocationId(request.params.storageLocationId);
      const output = await dependencies.listCurrentCompartments.execute({
        actorPrincipalId,
        householdId,
        storageLocationId,
      });
      return { compartments: output.compartments.map(serializeCompartment) };
    },
  );

  server.post<{
    Params: { householdId: string; storageLocationId: string };
    Body: {
      commandId?: unknown;
      kindCode?: unknown;
      displayName?: unknown;
      sortOrder?: unknown;
    };
  }>(
    '/households/:householdId/storage-locations/:storageLocationId/compartments',
    async (request, reply) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.createCompartment.execute({
        commandId: parseCommandId(request.body?.commandId),
        actorPrincipalId,
        householdId,
        storageLocationId: parseStorageLocationId(request.params.storageLocationId),
        kindCode: requireNullableString(request.body?.kindCode, 'Compartment kind code'),
        displayName: requireString(request.body?.displayName, 'Compartment display name'),
        sortOrder: requireNullableInteger(request.body?.sortOrder, 'Compartment sort order'),
      });
      return reply.code(201).send({ compartmentId: String(output.compartmentId) });
    },
  );

  server.get<{ Params: { householdId: string; compartmentId: string } }>(
    '/households/:householdId/compartments/:compartmentId',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const compartmentId = parseCompartmentId(request.params.compartmentId);
      const output = await dependencies.getCurrentCompartment.execute({
        actorPrincipalId,
        householdId,
        compartmentId,
      });
      return { compartment: serializeCompartment(output.compartment) };
    },
  );

  server.post<{
    Params: { householdId: string; compartmentId: string };
    Body: {
      commandId?: unknown;
      kindCode?: unknown;
      displayName?: unknown;
      sortOrder?: unknown;
    };
  }>(
    '/households/:householdId/compartments/:compartmentId/metadata-changes',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.changeCompartmentMetadata.execute({
        commandId: parseCommandId(request.body?.commandId),
        actorPrincipalId,
        householdId,
        compartmentId: parseCompartmentId(request.params.compartmentId),
        kindCode: requireNullableString(request.body?.kindCode, 'Compartment kind code'),
        displayName: requireString(request.body?.displayName, 'Compartment display name'),
        sortOrder: requireNullableInteger(request.body?.sortOrder, 'Compartment sort order'),
      });
      return { compartmentId: String(output.compartmentId) };
    },
  );

  server.post<{
    Params: { householdId: string; compartmentId: string };
    Body: { commandId?: unknown };
  }>(
    '/households/:householdId/compartments/:compartmentId/retirements',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.retireCompartment.execute({
        commandId: parseCommandId(request.body?.commandId),
        actorPrincipalId,
        householdId,
        compartmentId: parseCompartmentId(request.params.compartmentId),
      });
      return { compartmentId: String(output.compartmentId) };
    },
  );
}
