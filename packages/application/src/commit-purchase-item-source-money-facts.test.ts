import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CommitPurchaseItemSourceMoneyFactsUseCase,
  HouseholdId,
  HouseholdMembershipId,
  InvalidInputError,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  type HouseholdProcurementAdministrationTransaction,
  type HouseholdProcurementAdministrationTransactionManager,
  type HouseholdPurchaseItemSourceMoneyWriter,
  type IdentifierGenerator,
} from './index.js';

const ACTOR = PrincipalId('a1000001-0b06-4100-8100-000000000001');
const HOUSEHOLD = HouseholdId('a1000002-0b06-4100-8100-000000000002');
const MEMBERSHIP = HouseholdMembershipId('a1000003-0b06-4100-8100-000000000003');
const PURCHASE = PurchaseId('a1000004-0b06-4100-8100-000000000004');
const ITEM = PurchaseItemId('a1000005-0b06-4100-8100-000000000005');
const FACT_1 = PurchaseItemMoneyFactId('a1000006-0b06-4100-8100-000000000006');
const FACT_2 = PurchaseItemMoneyFactId('a1000007-0b06-4100-8100-000000000007');
const COMMAND = CommandId('a1000008-0b06-4100-8100-000000000008');

function transaction(): HouseholdProcurementAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'TEST_PROCUREMENT_ADMIN',
    procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
  } as unknown as HouseholdProcurementAdministrationTransaction;
}

function transactions(): HouseholdProcurementAdministrationTransactionManager {
  return {
    async withHouseholdProcurementAdministrationTransaction(principalId, householdId, operation) {
      assert.equal(principalId, ACTOR);
      assert.equal(householdId, HOUSEHOLD);
      return operation(transaction());
    },
  };
}

class QueueGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly values: T[]) {}
  generate(): T {
    const value = this.values.shift();
    if (value === undefined) throw new Error('identifier fixture exhausted');
    return value;
  }
}

test('CommitPurchaseItemSourceMoneyFacts canonicalizes exact decimals and delegates through procurement authority', async () => {
  let observed: Parameters<HouseholdPurchaseItemSourceMoneyWriter['commitSourceMoneyFacts']>[1] | undefined;
  const writer: HouseholdPurchaseItemSourceMoneyWriter = {
    async commitSourceMoneyFacts(tx, input) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      observed = input;
      return { purchaseItemMoneyFactIds: [FACT_1, FACT_2] };
    },
  };

  const result = await new CommitPurchaseItemSourceMoneyFactsUseCase(
    transactions(),
    writer,
    new QueueGenerator([FACT_1, FACT_2]),
  ).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    purchaseId: PURCHASE,
    purchaseItemId: ITEM,
    facts: [
      { semanticRole: 'LINE_GROSS', amount: '12.3400', provenance: ' invoice line gross ' },
      { semanticRole: 'LINE_DISCOUNT', amount: '0.500', provenance: 'invoice discount' },
    ],
  });

  assert.deepEqual(result.purchaseItemMoneyFactIds, [FACT_1, FACT_2]);
  assert.deepEqual(observed, {
    commandId: COMMAND,
    purchaseId: PURCHASE,
    purchaseItemId: ITEM,
    facts: [
      {
        candidatePurchaseItemMoneyFactId: FACT_1,
        semanticRole: 'LINE_GROSS',
        amount: '12.34',
        provenance: 'invoice line gross',
      },
      {
        candidatePurchaseItemMoneyFactId: FACT_2,
        semanticRole: 'LINE_DISCOUNT',
        amount: '0.5',
        provenance: 'invoice discount',
      },
    ],
  });
});

test('CommitPurchaseItemSourceMoneyFacts rejects duplicate roles before opening authority transaction', async () => {
  let opened = false;
  const manager: HouseholdProcurementAdministrationTransactionManager = {
    async withHouseholdProcurementAdministrationTransaction() {
      opened = true;
      throw new Error('must not execute');
    },
  };
  const writer = {} as HouseholdPurchaseItemSourceMoneyWriter;

  await assert.rejects(
    new CommitPurchaseItemSourceMoneyFactsUseCase(
      manager,
      writer,
      new QueueGenerator([FACT_1, FACT_2]),
    ).execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      facts: [
        { semanticRole: 'LINE_NET', amount: '10', provenance: 'source A' },
        { semanticRole: 'LINE_NET', amount: '10', provenance: 'source B' },
      ],
    }),
    InvalidInputError,
  );
  assert.equal(opened, false);
});

test('CommitPurchaseItemSourceMoneyFacts rejects invalid decimal grammar, negative amounts and blank provenance before opening authority transaction', async () => {
  let opened = false;
  const manager: HouseholdProcurementAdministrationTransactionManager = {
    async withHouseholdProcurementAdministrationTransaction() {
      opened = true;
      throw new Error('must not execute');
    },
  };
  const writer = {} as HouseholdPurchaseItemSourceMoneyWriter;
  const invalidFacts = [
    [{ semanticRole: 'LINE_GROSS' as const, amount: '1e2', provenance: 'source' }],
    [{ semanticRole: 'LINE_GROSS' as const, amount: '01.00', provenance: 'source' }],
    [{ semanticRole: 'LINE_DISCOUNT' as const, amount: '-0.01', provenance: 'source' }],
    [{ semanticRole: 'LINE_GROSS' as const, amount: '1.00', provenance: '   ' }],
  ];

  for (const facts of invalidFacts) {
    await assert.rejects(
      new CommitPurchaseItemSourceMoneyFactsUseCase(
        manager,
        writer,
        new QueueGenerator([FACT_1]),
      ).execute({
        commandId: COMMAND,
        actorPrincipalId: ACTOR,
        householdId: HOUSEHOLD,
        purchaseId: PURCHASE,
        purchaseItemId: ITEM,
        facts,
      }),
      InvalidInputError,
    );
  }
  assert.equal(opened, false);
});
