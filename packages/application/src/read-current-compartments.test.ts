import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompartmentId,
  GetCurrentCompartmentUseCase,
  HouseholdId,
  HouseholdMembershipId,
  ListCurrentCompartmentsUseCase,
  PrincipalId,
  StorageLocationId,
  type CurrentCompartmentReader,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';
import { instant } from '@fridge/domain';

const ACTOR = PrincipalId('11111111-1111-4111-8111-111111111111');
const HOUSEHOLD = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const MEMBERSHIP = HouseholdMembershipId('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb');
const LOCATION = StorageLocationId('cccccccc-1111-4111-8111-cccccccccccc');
const COMPARTMENT = CompartmentId('dddddddd-1111-4111-8111-dddddddddddd');

function transaction(): TransactionHandle {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'TEST_MEMBER',
  } as unknown as TransactionHandle;
}

function transactions(): TransactionManager {
  return {
    async withAuthorizedHouseholdTransaction(principalId, householdId, operation) {
      assert.equal(principalId, ACTOR);
      assert.equal(householdId, HOUSEHOLD);
      return operation(transaction());
    },
  };
}

test('ListCurrentCompartmentsUseCase keeps parent identity inside current Household authorization', async () => {
  let observedParent: unknown;
  const reader: CurrentCompartmentReader = {
    async listCurrentCompartments(_transaction, storageLocationId) {
      observedParent = storageLocationId;
      return [{
        compartmentId: COMPARTMENT,
        storageLocationId: LOCATION,
        kindCode: null,
        displayName: 'Shelf',
        sortOrder: null,
        createdAt: instant('2026-09-08T00:00:00Z'),
      }];
    },
    async getCurrentCompartment() {
      throw new Error('not used');
    },
  };

  const result = await new ListCurrentCompartmentsUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    storageLocationId: LOCATION,
  });

  assert.equal(observedParent, LOCATION);
  assert.equal(result.compartments[0]?.compartmentId, COMPARTMENT);
});

test('GetCurrentCompartmentUseCase observes one Compartment only through current Household authorization', async () => {
  let observedCompartment: unknown;
  const reader: CurrentCompartmentReader = {
    async listCurrentCompartments() {
      throw new Error('not used');
    },
    async getCurrentCompartment(_transaction, compartmentId) {
      observedCompartment = compartmentId;
      return {
        compartmentId: COMPARTMENT,
        storageLocationId: LOCATION,
        kindCode: null,
        displayName: 'Shelf',
        sortOrder: 1,
        createdAt: instant('2026-09-08T00:00:00Z'),
      };
    },
  };

  const result = await new GetCurrentCompartmentUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    compartmentId: COMPARTMENT,
  });

  assert.equal(observedCompartment, COMPARTMENT);
  assert.equal(result.compartment.storageLocationId, LOCATION);
});
