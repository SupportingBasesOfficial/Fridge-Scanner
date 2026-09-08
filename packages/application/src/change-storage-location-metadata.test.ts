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
  ChangeStorageLocationMetadataUseCase,
  InvalidInputError,
  type ChangeStorageLocationMetadataPersistenceInput,
  type HouseholdStorageAdministrationTransaction,
  type HouseholdStorageAdministrationTransactionManager,
  type StorageLocationMetadataChanger,
} from './index.js';

const COMMAND = CommandId('f4d40101-0b04-4d01-8b04-000000000001');
const ACTOR = PrincipalId('f4d40202-0b04-4d02-8b04-000000000002');
const HOUSEHOLD = HouseholdId('f4d40303-0b04-4d03-8b04-000000000003');
const MEMBERSHIP = HouseholdMembershipId('f4d40404-0b04-4d04-8b04-000000000004');
const LOCATION = StorageLocationId('f4d40505-0b04-4d05-8b04-000000000005');

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

test('ChangeStorageLocationMetadataUseCase binds target and requested metadata', async () => {
  let persisted: ChangeStorageLocationMetadataPersistenceInput | undefined;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction(_principalId, _householdId, operation) {
      return operation(fakeTransaction());
    },
  };
  const changer: StorageLocationMetadataChanger = {
    async changeStorageLocationMetadata(_transaction, input) {
      persisted = input;
      return input.storageLocationId;
    },
  };
  const useCase = new ChangeStorageLocationMetadataUseCase(transactions, changer);

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    storageLocationId: LOCATION,
    kindCode: 'FREEZER',
    displayName: 'Garage freezer',
    sortOrder: 20,
  });

  assert.deepEqual(persisted, {
    commandId: COMMAND,
    storageLocationId: LOCATION,
    kindCode: 'FREEZER',
    displayName: 'Garage freezer',
    sortOrder: 20,
  });
  assert.deepEqual(output, { storageLocationId: LOCATION });
});

test('ChangeStorageLocationMetadataUseCase rejects invalid metadata before authority acquisition', async () => {
  let transactionRequested = false;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };
  const changer: StorageLocationMetadataChanger = {
    async changeStorageLocationMetadata() {
      throw new Error('must not run');
    },
  };
  const useCase = new ChangeStorageLocationMetadataUseCase(transactions, changer);

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      storageLocationId: LOCATION,
      kindCode: ' FREEZER ',
      displayName: 'Garage freezer',
      sortOrder: null,
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});
