import {
  CommandId,
  HouseholdId,
  MoneyRoundingPolicyId,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  PurchaseItemPricingDiscrepancyId,
  type CommandId as CommandIdValue,
  type HouseholdId as HouseholdIdValue,
  type MoneyRoundingPolicyId as MoneyRoundingPolicyIdValue,
  type PrincipalId as PrincipalIdValue,
  type PurchaseId as PurchaseIdValue,
  type PurchaseItemId as PurchaseItemIdValue,
  type PurchaseItemMoneyFactId as PurchaseItemMoneyFactIdValue,
  type PurchaseItemPricingDiscrepancyId as PurchaseItemPricingDiscrepancyIdValue,
} from '@fridge/domain';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import { InvalidInputError } from './errors.js';

export interface CommitPurchaseItemPricingExtensionInput {
  readonly commandId: string;
  readonly actorPrincipalId: string;
  readonly householdId: string;
  readonly purchaseId: string;
  readonly purchaseItemId: string;
  readonly moneyRoundingPolicyId: string;
  readonly provenance: string;
}

export interface CommitPurchaseItemPricingExtensionOutput {
  readonly purchaseItemMoneyFactId: PurchaseItemMoneyFactIdValue;
  readonly pricingDiscrepancyId: PurchaseItemPricingDiscrepancyIdValue | null;
}

export interface CommitPurchaseItemPricingExtensionPersistenceInput {
  readonly commandId: CommandIdValue;
  readonly purchaseId: PurchaseIdValue;
  readonly purchaseItemId: PurchaseItemIdValue;
  readonly moneyRoundingPolicyId: MoneyRoundingPolicyIdValue;
  readonly candidatePurchaseItemMoneyFactId: PurchaseItemMoneyFactIdValue;
  readonly candidatePricingDiscrepancyId: PurchaseItemPricingDiscrepancyIdValue;
  readonly provenance: string;
}

export interface HouseholdPurchaseItemPricingExtensionWriter {
  commitPricingExtension(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CommitPurchaseItemPricingExtensionPersistenceInput,
  ): Promise<CommitPurchaseItemPricingExtensionOutput>;
}

function requireProvenance(value: string): string {
  if (typeof value !== 'string') {
    throw new InvalidInputError('pricing extension provenance must be a string');
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new InvalidInputError('pricing extension provenance must not be blank');
  }
  return normalized;
}

export class CommitPurchaseItemPricingExtension
  implements UseCase<CommitPurchaseItemPricingExtensionInput, CommitPurchaseItemPricingExtensionOutput>
{
  constructor(
    private readonly transactionManager: HouseholdProcurementAdministrationTransactionManager,
    private readonly writer: HouseholdPurchaseItemPricingExtensionWriter,
    private readonly moneyFactIdGenerator: IdentifierGenerator<PurchaseItemMoneyFactIdValue>,
    private readonly discrepancyIdGenerator: IdentifierGenerator<PurchaseItemPricingDiscrepancyIdValue>,
  ) {}

  async execute(
    input: CommitPurchaseItemPricingExtensionInput,
  ): Promise<CommitPurchaseItemPricingExtensionOutput> {
    const actorPrincipalId: PrincipalIdValue = PrincipalId(input.actorPrincipalId);
    const householdId: HouseholdIdValue = HouseholdId(input.householdId);
    const commandId: CommandIdValue = CommandId(input.commandId);
    const purchaseId: PurchaseIdValue = PurchaseId(input.purchaseId);
    const purchaseItemId: PurchaseItemIdValue = PurchaseItemId(input.purchaseItemId);
    const moneyRoundingPolicyId: MoneyRoundingPolicyIdValue = MoneyRoundingPolicyId(
      input.moneyRoundingPolicyId,
    );
    const provenance = requireProvenance(input.provenance);
    const candidatePurchaseItemMoneyFactId = PurchaseItemMoneyFactId(
      this.moneyFactIdGenerator.generate(),
    );
    const candidatePricingDiscrepancyId = PurchaseItemPricingDiscrepancyId(
      this.discrepancyIdGenerator.generate(),
    );

    return this.transactionManager.withHouseholdProcurementAdministrationTransaction(
      actorPrincipalId,
      householdId,
      (transaction) =>
        this.writer.commitPricingExtension(transaction, {
          commandId,
          purchaseId,
          purchaseItemId,
          moneyRoundingPolicyId,
          candidatePurchaseItemMoneyFactId,
          candidatePricingDiscrepancyId,
          provenance,
        }),
    );
  }
}
