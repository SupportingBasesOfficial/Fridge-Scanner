import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CompartmentId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/domain';
import {
  ChangeCompartmentMetadataUseCase,
  InvalidInputError,
  type ChangeCompartmentMetadataPersistenceInput,
  type CompartmentMetadataChanger,
  type HouseholdStorageAdministrationTransaction,
  type HouseholdStorageAdministrationTransactionManager,
} from './index.js';

const COMMAND = CommandId('b8e10101-0b04-4e01-8b04-000000000001');
const ACTOR = PrincipalId('b8e10202-0b04-4e02-8b04-000000000002');
const HOUSEHOLD = HouseholdId('b8e10303-0b04-4e03-8b04-000000000003');
const MEMBERSHIP = HouseholdMembershipId('b8e10404-0b04-4e04-8b04-000000000004');
const COMPARTMENT = CompartmentId('b8e10505-0b04-4e05-8b04-000000000005');

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

test('ChangeCompartmentMetadataUseCase preserves target identity and nullable kind', async () => {
  let persisted: ChangeCompartmentMetadataPersistenceInput | undefined;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction(_principal, _household, operation) {
      return operation(fakeTransaction());
    },
  };
  const compartments: CompartmentMetadataChanger = {
    async changeCompartmentMetadata(_transaction, input) {
      persisted = input;
      return COMPARTMENT;
    },
  };
  const useCase = new ChangeCompartmentMetadataUseCase(transactions, compartments);

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    compartmentId: COMPARTMENT,
    kindCode: null,
    displayName: 'Upper shelf',
    sortOrder: 4,
  });

  assert.deepEqual(persisted, {
    commandId: COMMAND,
    compartmentId: COMPARTMENT,
    kindCode: null,
    displayName: 'Upper shelf',
    sortOrder: 4,
  });
  assert.deepEqual(output, { compartmentId: COMPARTMENT });
});

test('ChangeCompartmentMetadataUseCase rejects invalid metadata before authority acquisition', async () => {
  let transactionRequested = false;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };
  const compartments: CompartmentMetadataChanger = {
    async changeCompartmentMetadata() {
      throw new Error('must not run');
    },
  };
  const useCase = new ChangeCompartmentMetadataUseCase(transactions, compartments);

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      compartmentId: COMPARTMENT,
      kindCode: ' SHELF ',
      displayName: 'Upper shelf',
      sortOrder: null,
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});
