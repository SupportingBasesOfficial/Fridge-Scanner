import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  MeasurementConversionEvidenceId,
  MeasurementUnitId,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  exactRational,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import {
  CommitPurchaseItemPricingBasisUseCase,
  type HouseholdPurchaseItemPricingBasisWriter,
} from './commit-purchase-item-pricing-basis.js';

const PRINCIPAL = PrincipalId('c7100001-0b06-4710-8710-000000000001');
const HOUSEHOLD = HouseholdId('c7100002-0b06-4710-8710-000000000002');
const PURCHASE = PurchaseId('c7100003-0b06-4710-8710-000000000003');
const ITEM = PurchaseItemId('c7100004-0b06-4710-8710-000000000004');
const UNIT = MeasurementUnitId('c7100005-0b06-4710-8710-000000000005');
const EVIDENCE = MeasurementConversionEvidenceId('c7100006-0b06-4710-8710-000000000006');
const FACT = PurchaseItemMoneyFactId('c7100007-0b06-4710-8710-000000000007');
const COMMAND = CommandId('c7100008-0b06-4710-8710-000000000008');
const MEMBERSHIP = HouseholdMembershipId('c7100009-0b06-4710-8710-000000000009');

function transactionManager(onOpen?: () => void): HouseholdProcurementAdministrationTransactionManager {
  return {
    async withHouseholdProcurementAdministrationTransaction<T>(
      principalId: PrincipalId,
      householdId: HouseholdId,
      operation: (transaction: HouseholdProcurementAdministrationTransaction) => Promise<T>,
    ): Promise<T> {
      onOpen?.();
      const transaction = {
        kind: 'fridge-household-procurement-administration-transaction',
        principalId,
        householdId,
        membershipId: MEMBERSHIP,
        householdRoleCode: 'TEST',
      } as unknown as HouseholdProcurementAdministrationTransaction;
      return operation(transaction);
    },
  };
}

test('canonicalizes pricing basis amount and delegates exact rational facts', async () => {
  let captured: Parameters<HouseholdPurchaseItemPricingBasisWriter['commitPricingBasis']>[1] | undefined;
  const writer: HouseholdPurchaseItemPricingBasisWriter = {
    async commitPricingBasis(_transaction, input) {
      captured = input;
      return { purchaseItemMoneyFactId: FACT };
    },
  };
  const useCase = new CommitPurchaseItemPricingBasisUseCase(
    transactionManager(),
    writer,
    { generate: () => FACT },
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: PRINCIPAL,
    householdId: HOUSEHOLD,
    purchaseId: PURCHASE,
    purchaseItemId: ITEM,
    pricingBasisQuantity: exactRational(1n, 2n),
    pricingBasisUnitId: UNIT,
    pricingConversionEvidenceId: EVIDENCE,
    basisAmount: '19.9900',
    provenance: '  invoice basis  ',
  });

  assert.deepEqual(output, { purchaseItemMoneyFactId: FACT });
  assert.equal(captured?.pricingBasisQuantityNumerator, '1');
  assert.equal(captured?.pricingBasisQuantityDenominator, '2');
  assert.equal(captured?.basisAmount, '19.99');
  assert.equal(captured?.provenance, 'invoice basis');
  assert.equal(captured?.pricingConversionEvidenceId, EVIDENCE);
});

test('rejects noncanonical rational before opening a transaction', async () => {
  let opened = false;
  const useCase = new CommitPurchaseItemPricingBasisUseCase(
    transactionManager(() => { opened = true; }),
    { async commitPricingBasis() { throw new Error('unexpected'); } },
    { generate: () => FACT },
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: PRINCIPAL,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      pricingBasisQuantity: { numerator: 2n, denominator: 4n } as never,
      pricingBasisUnitId: UNIT,
      basisAmount: '1.00',
      provenance: 'invoice',
    }),
    InvalidInputError,
  );
  assert.equal(opened, false);
});

test('rejects negative or malformed basis amount before opening a transaction', async () => {
  for (const basisAmount of ['-1', '01.00', '1e2', 'NaN']) {
    let opened = false;
    const useCase = new CommitPurchaseItemPricingBasisUseCase(
      transactionManager(() => { opened = true; }),
      { async commitPricingBasis() { throw new Error('unexpected'); } },
      { generate: () => FACT },
    );
    await assert.rejects(
      useCase.execute({
        commandId: COMMAND,
        actorPrincipalId: PRINCIPAL,
        householdId: HOUSEHOLD,
        purchaseId: PURCHASE,
        purchaseItemId: ITEM,
        pricingBasisQuantity: exactRational(1n, 1n),
        pricingBasisUnitId: UNIT,
        basisAmount,
        provenance: 'invoice',
      }),
      InvalidInputError,
    );
    assert.equal(opened, false);
  }
});

test('rejects blank provenance before opening a transaction', async () => {
  let opened = false;
  const useCase = new CommitPurchaseItemPricingBasisUseCase(
    transactionManager(() => { opened = true; }),
    { async commitPricingBasis() { throw new Error('unexpected'); } },
    { generate: () => FACT },
  );
  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: PRINCIPAL,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      pricingBasisQuantity: exactRational(1n, 1n),
      pricingBasisUnitId: UNIT,
      basisAmount: '0',
      provenance: '   ',
    }),
    InvalidInputError,
  );
  assert.equal(opened, false);
});
