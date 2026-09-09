import { describe, expect, it, vi } from 'vitest';
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
  UserId,
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

const actor = PrincipalId('10000000-0000-0000-0000-000000000001');
const household = HouseholdId('10000000-0000-0000-0000-000000000002');
const command = CommandId('10000000-0000-0000-0000-000000000003');
const purchase = PurchaseId('10000000-0000-0000-0000-000000000004');
const item = PurchaseItemId('10000000-0000-0000-0000-000000000005');
const policy = MoneyRoundingPolicyId('10000000-0000-0000-0000-000000000006');
const fact = PurchaseItemMoneyFactId('10000000-0000-0000-0000-000000000007');
const discrepancy = PurchaseItemPricingDiscrepancyId('10000000-0000-0000-0000-000000000008');

const transaction: HouseholdProcurementAdministrationTransaction = {
  kind: 'household-procurement-administration-transaction',
  principalId: actor,
  userId: UserId('10000000-0000-0000-0000-000000000009'),
  householdId: household,
  membershipId: HouseholdMembershipId('10000000-0000-0000-0000-000000000010'),
  householdRoleCode: 'OWNER',
};

function transactionManager(): HouseholdProcurementAdministrationTransactionManager {
  return {
    async withHouseholdProcurementAdministrationTransaction(_principal, _household, operation) {
      return operation(transaction);
    },
  };
}

describe('CommitPurchaseItemPricingExtensionUseCase', () => {
  it('trims provenance, passes semantic identity and keeps generated result identities out of input equality', async () => {
    const writer: HouseholdPurchaseItemPricingExtensionWriter = {
      commitPricingExtension: vi.fn(async (_tx, input) => ({
        purchaseItemMoneyFactId: input.candidatePurchaseItemMoneyFactId,
        pricingDiscrepancyId: input.candidatePricingDiscrepancyId,
      })),
    };
    const useCase = new CommitPurchaseItemPricingExtensionUseCase(
      transactionManager(),
      writer,
      { generate: () => fact },
      { generate: () => discrepancy },
    );

    const output = await useCase.execute({
      commandId: command,
      actorPrincipalId: actor,
      householdId: household,
      purchaseId: purchase,
      purchaseItemId: item,
      moneyRoundingPolicyId: policy,
      provenance: '  platform pricing extension  ',
    });

    expect(writer.commitPricingExtension).toHaveBeenCalledWith(transaction, {
      commandId: command,
      purchaseId: purchase,
      purchaseItemId: item,
      moneyRoundingPolicyId: policy,
      candidatePurchaseItemMoneyFactId: fact,
      candidatePricingDiscrepancyId: discrepancy,
      provenance: 'platform pricing extension',
    });
    expect(output).toEqual({ purchaseItemMoneyFactId: fact, pricingDiscrepancyId: discrepancy });
  });

  it('rejects blank provenance before opening a governed transaction', async () => {
    const transactions = transactionManager();
    const spy = vi.spyOn(transactions, 'withHouseholdProcurementAdministrationTransaction');
    const useCase = new CommitPurchaseItemPricingExtensionUseCase(
      transactions,
      { commitPricingExtension: vi.fn() },
      { generate: () => fact },
      { generate: () => discrepancy },
    );

    await expect(
      useCase.execute({
        commandId: command,
        actorPrincipalId: actor,
        householdId: household,
        purchaseId: purchase,
        purchaseItemId: item,
        moneyRoundingPolicyId: policy,
        provenance: '   ',
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(spy).not.toHaveBeenCalled();
  });
});
