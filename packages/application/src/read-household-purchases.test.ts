import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GetHouseholdPurchaseUseCase,
  HouseholdId,
  HouseholdMembershipId,
  InvalidInputError,
  ListHouseholdPurchasesUseCase,
  MeasurementUnitId,
  PrincipalId,
  ProductId,
  PurchaseId,
  PurchaseItemId,
  exactRational,
  instant,
  type HouseholdPurchasePageCursor,
  type HouseholdPurchaseReader,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';

const ACTOR = PrincipalId('71111111-1111-4111-8111-111111111111');
const HOUSEHOLD = HouseholdId('72222222-2222-4222-8222-222222222222');
const MEMBERSHIP = HouseholdMembershipId('73333333-3333-4333-8333-333333333333');
const PURCHASE = PurchaseId('74444444-4444-4444-8444-444444444444');
const SECOND_PURCHASE = PurchaseId('74444444-4444-4444-8444-444444444443');
const ITEM = PurchaseItemId('75555555-5555-4555-8555-555555555555');
const PRODUCT = ProductId('76666666-6666-4666-8666-666666666666');
const UNIT = MeasurementUnitId('77777777-7777-4777-8777-777777777777');

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

const summary = {
  purchaseId: PURCHASE,
  transactionCurrencyCode: 'BRL',
  occurredAt: instant('2026-09-09T12:00:00Z'),
  recordedAt: instant('2026-09-09T12:00:01Z'),
  itemCount: 1,
};
const secondSummary = {
  ...summary,
  purchaseId: SECOND_PURCHASE,
  occurredAt: instant('2026-09-08T12:00:00Z'),
};

const observation = {
  ...summary,
  items: [
    {
      purchaseItemId: ITEM,
      productId: PRODUCT,
      quantity: exactRational(3n, 2n),
      measurementUnitId: UNIT,
      recordedAt: instant('2026-09-09T12:00:01Z'),
    },
  ],
};

test('ListHouseholdPurchasesUseCase requests one lookahead row and returns stable keyset cursor', async () => {
  const reader: HouseholdPurchaseReader = {
    async listHouseholdPurchases(tx, input) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      assert.equal(input.limit, 2);
      assert.equal(input.cursor, null);
      return [summary, secondSummary];
    },
    async getHouseholdPurchase() {
      return observation;
    },
  };

  const result = await new ListHouseholdPurchasesUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    pageSize: 1,
  });

  assert.deepEqual(result.purchases, [summary]);
  assert.deepEqual(result.nextCursor, {
    occurredAt: summary.occurredAt,
    purchaseId: summary.purchaseId,
  });
});

test('ListHouseholdPurchasesUseCase forwards validated keyset cursor and omits next cursor on final page', async () => {
  const cursor = { occurredAt: summary.occurredAt, purchaseId: summary.purchaseId };
  const reader: HouseholdPurchaseReader = {
    async listHouseholdPurchases(_tx, input) {
      assert.deepEqual(input.cursor, cursor);
      return [secondSummary];
    },
    async getHouseholdPurchase() {
      return observation;
    },
  };
  const result = await new ListHouseholdPurchasesUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    pageSize: 1,
    cursor,
  });
  assert.deepEqual(result.purchases, [secondSummary]);
  assert.equal(result.nextCursor, null);
});

test('ListHouseholdPurchasesUseCase rejects unbounded page sizes and malformed cursors before transaction execution', async () => {
  let transactionCalls = 0;
  const guardedTransactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction(_principalId, _householdId, operation) {
      transactionCalls += 1;
      return operation(transaction());
    },
  };
  const reader = { async listHouseholdPurchases() { return []; }, async getHouseholdPurchase() { return observation; } } satisfies HouseholdPurchaseReader;
  const useCase = new ListHouseholdPurchasesUseCase(guardedTransactions, reader);
  for (const pageSize of [0, 101, 1.5]) {
    await assert.rejects(useCase.execute({ actorPrincipalId: ACTOR, householdId: HOUSEHOLD, pageSize }), InvalidInputError);
  }
  const malformed = [
    {} as HouseholdPurchasePageCursor,
    { occurredAt: 'not-a-time', purchaseId: PURCHASE } as HouseholdPurchasePageCursor,
    { occurredAt: summary.occurredAt, purchaseId: 'not-a-uuid' } as HouseholdPurchasePageCursor,
  ];
  for (const cursor of malformed) {
    await assert.rejects(useCase.execute({ actorPrincipalId: ACTOR, householdId: HOUSEHOLD, cursor }), InvalidInputError);
  }
  assert.equal(transactionCalls, 0);
});

test('GetHouseholdPurchaseUseCase preserves historical Purchase target identity', async () => {
  let observedTarget: PurchaseId | undefined;
  const reader: HouseholdPurchaseReader = {
    async listHouseholdPurchases() {
      return [];
    },
    async getHouseholdPurchase(tx, purchaseId) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      observedTarget = purchaseId;
      return observation;
    },
  };

  const result = await new GetHouseholdPurchaseUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    purchaseId: PURCHASE,
  });

  assert.equal(observedTarget, PURCHASE);
  assert.deepEqual(result.purchase, observation);
});
