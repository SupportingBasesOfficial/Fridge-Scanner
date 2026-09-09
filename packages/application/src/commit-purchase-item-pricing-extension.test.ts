import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  MoneyRoundingPolicyId,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  PurchaseItemPricingDiscrepancyId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import {
  CommitPurchaseItemPricingExtensionUseCase,
  type HouseholdPurchaseItemPricingExtensionWriter,
} from './commit-purchase-item-pricing-extension.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

const PRINCIPAL = PrincipalId('10000000-0000-0000-0000-000000000001');
const HOUSEHOLD = HouseholdId('10000000-0000-0000-0000-000000000002');
const COMMAND = CommandId('10000000-0000-0000-0000-000000000003');
const PURCHASE = PurchaseId('10000000-0000-0000-0000-000000000004');
const ITEM = PurchaseItemId('10000000-0000-0000-0000-000000000005');
const POLICY = MoneyRoundingPolicyId('10000000-0000-0000-0000-000000000006');
const FACT = PurchaseItemMoneyFactId('10000000-0000-0000-0000-000000000007');
const DISCREPANCY = PurchaseItemPricingDiscrepancyId('10000000-0000-0000-0000-000000000008');
const MEMBERSHIP = HouseholdMembershipId('10000000-0000-0000-0000-000000000010');

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

test('trims provenance and delegates semantic identity with result-only candidate ids', async () => {
  let captured: Parameters<HouseholdPurchaseItemPricingExtensionWriter['commitPricingExtension']>[1] | undefined;
  const writer: HouseholdPurchaseItemPricingExtensionWriter = {
    async commitPricingExtension(_transaction, input) {
      captured = input;
      return {
        purchaseItemMoneyFactId: input.candidatePurchaseItemMoneyFactId,
        pricingDiscrepancyId: input.candidatePricingDiscrepancyId,
      };
    },
  };
  const useCase = new CommitPurchaseItemPricingExtensionUseCase(
    transactionManager(),
    writer,
    { generate: () => FACT },
    { generate: () => DISCREPANCY },
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: PRINCIPAL,
    householdId: HOUSEHOLD,
    purchaseId: PURCHASE,
    purchaseItemId: ITEM,
    moneyRoundingPolicyId: POLICY,
    provenance: '  platform pricing extension  ',
  });

  assert.deepEqual(output, {
    purchaseItemMoneyFactId: FACT,
    pricingDiscrepancyId: DISCREPANCY,
  });
  assert.deepEqual(captured, {
    commandId: COMMAND,
    purchaseId: PURCHASE,
    purchaseItemId: ITEM,
    moneyRoundingPolicyId: POLICY,
    candidatePurchaseItemMoneyFactId: FACT,
    candidatePricingDiscrepancyId: DISCREPANCY,
    provenance: 'platform pricing extension',
  });
});

test('rejects blank provenance before opening a governed transaction', async () => {
  let opened = false;
  const useCase = new CommitPurchaseItemPricingExtensionUseCase(
    transactionManager(() => { opened = true; }),
    { async commitPricingExtension() { throw new Error('unexpected'); } },
    { generate: () => FACT },
    { generate: () => DISCREPANCY },
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: PRINCIPAL,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      moneyRoundingPolicyId: POLICY,
      provenance: '   ',
    }),
    InvalidInputError,
  );
  assert.equal(opened, false);
});
