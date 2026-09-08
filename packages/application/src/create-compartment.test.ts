import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CompartmentId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  StorageLocationId,
} from '@fridge/domain';
import {
  CreateCompartmentUseCase,
  InvalidInputError,
  type CompartmentWriter,
  type CreateCompartmentPersistenceInput,
  type HouseholdStorageAdministrationTransaction,
  type HouseholdStorageAdministrationTransactionManager,
} from './index.js';

const COMMAND = CommandId('8c6d0101-0b04-4d01-8b04-000000000001');
const ACTOR = PrincipalId('8c6d0202-0b04-4d02-8b04-000000000002');
const HOUSEHOLD = HouseholdId('8c6d0303-0b04-4d03-8b04-000000000003');
const MEMBERSHIP = HouseholdMembershipId('8c6d0404-0b04-4d04-8b04-000000000004');
const PARENT = StorageLocationId('8c6d0505-0b04-4d05-8b04-000000000005');
const CANDIDATE = CompartmentId('8c6d0606-0b04-4d06-8b04-000000000006');
const PERSISTED = CompartmentId('8c6d0707-0b04-4d07-8b04-000000000007');

function fakeTransaction(): HouseholdStorageAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'BE04_STORAGE_ADMIN',
    storageAdministrationCapability: 'HOUSEHOLD_STORAGE_ADMINISTER',
  } as unknown as HouseholdStorageAdministrationTransaction;
}

test('CreateCompartmentUseCase generates an internal candidate and binds immutable parent facts', async () => {
  let persisted: CreateCompartmentPersistenceInput | undefined;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction(_principal, _household, operation) {
      return operation(fakeTransaction());
    },
  };
  const compartments: CompartmentWriter = {
    async createCompartment(_transaction, input) {
      persisted = input;
      return PERSISTED;
    },
  };

  const output = await new CreateCompartmentUseCase(
    transactions,
    compartments,
    { generate: () => CANDIDATE },
  ).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    storageLocationId: PARENT,
    kindCode: null,
    displayName: 'Upper shelf',
    sortOrder: 3,
  });

  assert.deepEqual(persisted, {
    commandId: COMMAND,
    candidateCompartmentId: CANDIDATE,
    storageLocationId: PARENT,
    kindCode: null,
    displayName: 'Upper shelf',
    sortOrder: 3,
  });
  assert.deepEqual(output, { compartmentId: PERSISTED });
});

test('CreateCompartmentUseCase rejects non-exact optional kind before authority acquisition', async () => {
  let transactionRequested = false;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };
  const compartments: CompartmentWriter = {
    async createCompartment() {
      throw new Error('must not run');
    },
  };

  await assert.rejects(
    new CreateCompartmentUseCase(transactions, compartments, { generate: () => CANDIDATE }).execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      storageLocationId: PARENT,
      kindCode: ' SHELF ',
      displayName: 'Upper shelf',
      sortOrder: null,
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});

test('CreateCompartmentUseCase accepts null kind but rejects invalid display/sort metadata before authority', async () => {
  let transactionRequested = false;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };
  const compartments: CompartmentWriter = {
    async createCompartment() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreateCompartmentUseCase(transactions, compartments, { generate: () => CANDIDATE });

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      storageLocationId: PARENT,
      kindCode: null,
      displayName: ' ',
      sortOrder: null,
    }),
    InvalidInputError,
  );
  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      storageLocationId: PARENT,
      kindCode: null,
      displayName: 'Upper shelf',
      sortOrder: 2147483648,
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});
