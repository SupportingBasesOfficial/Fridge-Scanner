import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  StorageLocationId,
} from '@fridge/domain';
import {
  CreateStorageLocationUseCase,
  InvalidInputError,
  type CreateStorageLocationPersistenceInput,
  type HouseholdStorageAdministrationTransaction,
  type HouseholdStorageAdministrationTransactionManager,
  type StorageLocationWriter,
} from './index.js';

const COMMAND = CommandId('f4b40101-0b04-4b01-8b04-000000000001');
const ACTOR = PrincipalId('f4b40202-0b04-4b02-8b04-000000000002');
const HOUSEHOLD = HouseholdId('f4b40303-0b04-4b03-8b04-000000000003');
const ACTOR_MEMBERSHIP = HouseholdMembershipId('f4b40404-0b04-4b04-8b04-000000000004');
const CANDIDATE = StorageLocationId('f4b40505-0b04-4b05-8b04-000000000005');
const PERSISTED = StorageLocationId('f4b40606-0b04-4b06-8b04-000000000006');

function fakeStorageAdministrationTransaction(): HouseholdStorageAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: ACTOR_MEMBERSHIP,
    householdRoleCode: 'BE04_STORAGE_ADMIN',
    storageAdministrationCapability: 'HOUSEHOLD_STORAGE_ADMINISTER',
  } as unknown as HouseholdStorageAdministrationTransaction;
}

test('CreateStorageLocationUseCase generates an internal candidate and binds command facts', async () => {
  let requestedActor: unknown;
  let requestedHousehold: unknown;
  let persisted: CreateStorageLocationPersistenceInput | undefined;

  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction(principalId, householdId, operation) {
      requestedActor = principalId;
      requestedHousehold = householdId;
      return operation(fakeStorageAdministrationTransaction());
    },
  };

  const storageLocations: StorageLocationWriter = {
    async createStorageLocation(_transaction, input) {
      persisted = input;
      return PERSISTED;
    },
  };

  const useCase = new CreateStorageLocationUseCase(
    transactions,
    storageLocations,
    { generate: () => CANDIDATE },
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    kindCode: 'FRIDGE',
    displayName: 'Kitchen Fridge',
    sortOrder: 10,
  });

  assert.equal(requestedActor, ACTOR);
  assert.equal(requestedHousehold, HOUSEHOLD);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    candidateStorageLocationId: CANDIDATE,
    kindCode: 'FRIDGE',
    displayName: 'Kitchen Fridge',
    sortOrder: 10,
  });
  assert.deepEqual(output, { storageLocationId: PERSISTED });
});

test('CreateStorageLocationUseCase rejects non-exact metadata before authority acquisition', async () => {
  let transactionRequested = false;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };
  const storageLocations: StorageLocationWriter = {
    async createStorageLocation() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreateStorageLocationUseCase(
    transactions,
    storageLocations,
    { generate: () => CANDIDATE },
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      kindCode: ' FRIDGE ',
      displayName: 'Kitchen Fridge',
      sortOrder: null,
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});

test('CreateStorageLocationUseCase rejects sort order outside PostgreSQL integer range', async () => {
  let transactionRequested = false;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };
  const storageLocations: StorageLocationWriter = {
    async createStorageLocation() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreateStorageLocationUseCase(
    transactions,
    storageLocations,
    { generate: () => CANDIDATE },
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      kindCode: 'FRIDGE',
      displayName: 'Kitchen Fridge',
      sortOrder: 2147483648,
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});
