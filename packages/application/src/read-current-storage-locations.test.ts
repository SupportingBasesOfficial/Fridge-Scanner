import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GetCurrentStorageLocationUseCase,
  HouseholdId,
  HouseholdMembershipId,
  ListCurrentStorageLocationsUseCase,
  PrincipalId,
  StorageLocationId,
  instant,
  type CurrentStorageLocationReader,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';

const ACTOR = PrincipalId('18181818-1818-4181-8181-181818181818');
const HOUSEHOLD = HouseholdId('28282828-2828-4282-8282-282828282828');
const MEMBERSHIP = HouseholdMembershipId('38383838-3838-4383-8383-383838383838');
const LOCATION = StorageLocationId('48484848-4848-4484-8484-484848484848');

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

const observation = {
  storageLocationId: LOCATION,
  kindCode: 'FRIDGE',
  displayName: 'Kitchen fridge',
  sortOrder: 1,
  createdAt: instant('2026-09-08T00:00:00Z'),
};

test('ListCurrentStorageLocationsUseCase observes through authorized Household transaction', async () => {
  const reader: CurrentStorageLocationReader = {
    async listCurrentStorageLocations(tx) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      return [observation];
    },
    async getCurrentStorageLocation() {
      return observation;
    },
  };

  const result = await new ListCurrentStorageLocationsUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
  });

  assert.deepEqual(result.storageLocations, [observation]);
});

test('GetCurrentStorageLocationUseCase preserves intent-specific target identity', async () => {
  let observedTarget: StorageLocationId | undefined;
  const reader: CurrentStorageLocationReader = {
    async listCurrentStorageLocations() {
      return [];
    },
    async getCurrentStorageLocation(tx, storageLocationId) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      observedTarget = storageLocationId;
      return observation;
    },
  };

  const result = await new GetCurrentStorageLocationUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    storageLocationId: LOCATION,
  });

  assert.equal(observedTarget, LOCATION);
  assert.deepEqual(result.storageLocation, observation);
});
