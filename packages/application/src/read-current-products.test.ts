import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GetCurrentProductUseCase,
  HouseholdId,
  HouseholdMembershipId,
  ListCurrentProductsUseCase,
  PrincipalId,
  ProductId,
  instant,
  type CurrentProductReader,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';

const ACTOR = PrincipalId('19191919-1919-4191-8191-191919191919');
const HOUSEHOLD = HouseholdId('29292929-2929-4292-8292-292929292929');
const MEMBERSHIP = HouseholdMembershipId('39393939-3939-4393-8393-393939393939');
const PRODUCT = ProductId('49494949-4949-4494-8494-494949494949');

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
  productId: PRODUCT,
  catalogScope: 'HOUSEHOLD' as const,
  ownerHouseholdId: HOUSEHOLD,
  canonicalName: 'Household yogurt',
  brandId: null,
  manufacturerId: null,
  productCategoryId: null,
  createdAt: instant('2026-09-08T00:00:00Z'),
};

test('ListCurrentProductsUseCase observes through authorized Household transaction', async () => {
  const reader: CurrentProductReader = {
    async listCurrentProducts(tx) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      return [observation];
    },
    async getCurrentProduct() {
      return observation;
    },
  };

  const result = await new ListCurrentProductsUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
  });

  assert.deepEqual(result.products, [observation]);
});

test('GetCurrentProductUseCase preserves intent-specific target identity', async () => {
  let observedTarget: ProductId | undefined;
  const reader: CurrentProductReader = {
    async listCurrentProducts() {
      return [];
    },
    async getCurrentProduct(tx, productId) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      observedTarget = productId;
      return observation;
    },
  };

  const result = await new GetCurrentProductUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    productId: PRODUCT,
  });

  assert.equal(observedTarget, PRODUCT);
  assert.deepEqual(result.product, observation);
});
