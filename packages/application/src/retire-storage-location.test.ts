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
  RetireStorageLocationUseCase,
  type HouseholdStorageAdministrationTransaction,
  type HouseholdStorageAdministrationTransactionManager,
  type RetireStorageLocationPersistenceInput,
  type StorageLocationRetirer,
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

test('RetireStorageLocationUseCase binds actor, Household, command and target to one governed transaction', async () => {
  let requestedActor: unknown;
  let requestedHousehold: unknown;
  let persisted: RetireStorageLocationPersistenceInput | undefined;

  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction(principalId, householdId, operation) {
      requestedActor = principalId;
      requestedHousehold = householdId;
      return operation(fakeTransaction());
    },
  };
  const retirer: StorageLocationRetirer = {
    async retireStorageLocation(_transaction, input) {
      persisted = input;
      return LOCATION;
    },
  };

  const output = await new RetireStorageLocationUseCase(transactions, retirer).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    storageLocationId: LOCATION,
  });

  assert.equal(requestedActor, ACTOR);
  assert.equal(requestedHousehold, HOUSEHOLD);
  assert.deepEqual(persisted, { commandId: COMMAND, storageLocationId: LOCATION });
  assert.deepEqual(output, { storageLocationId: LOCATION });
});
