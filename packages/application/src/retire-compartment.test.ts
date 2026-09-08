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
  RetireCompartmentUseCase,
  type CompartmentRetirer,
  type HouseholdStorageAdministrationTransaction,
  type HouseholdStorageAdministrationTransactionManager,
  type RetireCompartmentPersistenceInput,
} from './index.js';

const COMMAND = CommandId('d4f10101-0b04-4f01-8b04-000000000001');
const ACTOR = PrincipalId('d4f10202-0b04-4f02-8b04-000000000002');
const HOUSEHOLD = HouseholdId('d4f10303-0b04-4f03-8b04-000000000003');
const MEMBERSHIP = HouseholdMembershipId('d4f10404-0b04-4f04-8b04-000000000004');
const COMPARTMENT = CompartmentId('d4f10505-0b04-4f05-8b04-000000000005');

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

test('RetireCompartmentUseCase binds stable command and target identity', async () => {
  let persisted: RetireCompartmentPersistenceInput | undefined;
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction(principal, household, operation) {
      assert.equal(principal, ACTOR);
      assert.equal(household, HOUSEHOLD);
      return operation(fakeTransaction());
    },
  };
  const compartments: CompartmentRetirer = {
    async retireCompartment(_transaction, input) {
      persisted = input;
      return COMPARTMENT;
    },
  };

  const output = await new RetireCompartmentUseCase(transactions, compartments).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    compartmentId: COMPARTMENT,
  });

  assert.deepEqual(persisted, {
    commandId: COMMAND,
    compartmentId: COMPARTMENT,
  });
  assert.deepEqual(output, { compartmentId: COMPARTMENT });
});

test('RetireCompartmentUseCase rejects persistence that returns no identity', async () => {
  const transactions: HouseholdStorageAdministrationTransactionManager = {
    async withHouseholdStorageAdministrationTransaction(_principal, _household, operation) {
      return operation(fakeTransaction());
    },
  };
  const compartments: CompartmentRetirer = {
    async retireCompartment() {
      return undefined as unknown as CompartmentId;
    },
  };

  await assert.rejects(
    new RetireCompartmentUseCase(transactions, compartments).execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      compartmentId: COMPARTMENT,
    }),
    TypeError,
  );
});
