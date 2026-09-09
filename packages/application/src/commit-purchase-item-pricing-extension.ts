import type {
  CommandId,
  HouseholdId,
  MoneyRoundingPolicyId,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  PurchaseItemPricingDiscrepancyId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export interface CommitPurchaseItemPricingExtensionInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly purchaseId: PurchaseId;
  readonly purchaseItemId: PurchaseItemId;
  readonly moneyRoundingPolicyId: MoneyRoundingPolicyId;
  readonly provenance: string;
}

export interface CommitPurchaseItemPricingExtensionOutput {
  readonly purchaseItemMoneyFactId: PurchaseItemMoneyFactId;
  readonly pricingDiscrepancyId: PurchaseItemPricingDiscrepancyId | null;
}

export interface CommitPurchaseItemPricingExtensionPersistenceInput {
  readonly commandId: CommandId;
  readonly purchaseId: PurchaseId;
  readonly purchaseItemId: PurchaseItemId;
  readonly moneyRoundingPolicyId: MoneyRoundingPolicyId;
  readonly candidatePurchaseItemMoneyFactId: PurchaseItemMoneyFactId;
  readonly candidatePricingDiscrepancyId: PurchaseItemPricingDiscrepancyId;
  readonly provenance: string;
}

export interface HouseholdPurchaseItemPricingExtensionWriter {
  commitPricingExtension(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CommitPurchaseItemPricingExtensionPersistenceInput,
  ): Promise<CommitPurchaseItemPricingExtensionOutput>;
}

function requireProvenance(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError('pricing extension provenance is required');
  }
  return value.trim();
}

export class CommitPurchaseItemPricingExtensionUseCase
  implements UseCase<CommitPurchaseItemPricingExtensionInput, CommitPurchaseItemPricingExtensionOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly writer: HouseholdPurchaseItemPricingExtensionWriter,
    private readonly moneyFactIds: IdentifierGenerator<PurchaseItemMoneyFactId>,
    private readonly discrepancyIds: IdentifierGenerator<PurchaseItemPricingDiscrepancyId>,
  ) {}

  async execute(
    input: CommitPurchaseItemPricingExtensionInput,
  ): Promise<CommitPurchaseItemPricingExtensionOutput> {
    const provenance = requireProvenance(input.provenance);
    const candidatePurchaseItemMoneyFactId = this.moneyFactIds.generate();
    const candidatePricingDiscrepancyId = this.discrepancyIds.generate();

    let output: CommitPurchaseItemPricingExtensionOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.writer.commitPricingExtension(transaction, {
          commandId: input.commandId,
          purchaseId: input.purchaseId,
          purchaseItemId: input.purchaseItemId,
          moneyRoundingPolicyId: input.moneyRoundingPolicyId,
          candidatePurchaseItemMoneyFactId,
          candidatePricingDiscrepancyId,
          provenance,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('Household PurchaseItem pricing extension writer did not return an outcome');
    }
    return output;
  }
}
