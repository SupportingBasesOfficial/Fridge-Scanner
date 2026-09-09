import {
  exactRational,
  type CommandId,
  type ExactRational,
  type HouseholdId,
  type MeasurementConversionEvidenceId,
  type MeasurementUnitId,
  type PrincipalId,
  type PurchaseId,
  type PurchaseItemId,
  type PurchaseItemMoneyFactId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export interface CommitPurchaseItemPricingBasisInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly purchaseId: PurchaseId;
  readonly purchaseItemId: PurchaseItemId;
  readonly pricingBasisQuantity: ExactRational;
  readonly pricingBasisUnitId: MeasurementUnitId;
  readonly pricingConversionEvidenceId?: MeasurementConversionEvidenceId;
  readonly basisAmount: string;
  readonly provenance: string;
}

export interface CommitPurchaseItemPricingBasisOutput {
  readonly purchaseItemMoneyFactId: PurchaseItemMoneyFactId;
}

export interface CommitPurchaseItemPricingBasisPersistenceInput {
  readonly commandId: CommandId;
  readonly purchaseId: PurchaseId;
  readonly purchaseItemId: PurchaseItemId;
  readonly pricingBasisQuantityNumerator: string;
  readonly pricingBasisQuantityDenominator: string;
  readonly pricingBasisUnitId: MeasurementUnitId;
  readonly pricingConversionEvidenceId: MeasurementConversionEvidenceId | undefined;
  readonly candidatePurchaseItemMoneyFactId: PurchaseItemMoneyFactId;
  readonly basisAmount: string;
  readonly provenance: string;
}

export interface HouseholdPurchaseItemPricingBasisWriter {
  commitPricingBasis(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CommitPurchaseItemPricingBasisPersistenceInput,
  ): Promise<CommitPurchaseItemPricingBasisOutput>;
}

const MONEY_AMOUNT_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function requirePositiveCanonicalQuantity(value: ExactRational): ExactRational {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.numerator !== 'bigint' ||
    typeof value.denominator !== 'bigint'
  ) {
    throw new InvalidInputError('pricing basis quantity must be an ExactRational');
  }
  if (value.numerator <= 0n || value.denominator <= 0n) {
    throw new InvalidInputError('pricing basis quantity must be positive');
  }
  const canonical = exactRational(value.numerator, value.denominator);
  if (canonical.numerator !== value.numerator || canonical.denominator !== value.denominator) {
    throw new InvalidInputError('pricing basis quantity must already be canonical');
  }
  return value;
}

function canonicalMoneyAmount(value: string): string {
  if (typeof value !== 'string' || !MONEY_AMOUNT_PATTERN.test(value)) {
    throw new InvalidInputError('pricing basis amount must be a nonnegative exact decimal string');
  }
  const dotIndex = value.indexOf('.');
  const integerPart = dotIndex === -1 ? value : value.slice(0, dotIndex);
  const fractionalPart = dotIndex === -1 ? '' : value.slice(dotIndex + 1);
  const trimmedFraction = fractionalPart.replace(/0+$/, '');
  return trimmedFraction.length === 0 ? integerPart : `${integerPart}.${trimmedFraction}`;
}

function requireProvenance(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError('pricing basis provenance is required');
  }
  return value.trim();
}

export class CommitPurchaseItemPricingBasisUseCase
  implements UseCase<CommitPurchaseItemPricingBasisInput, CommitPurchaseItemPricingBasisOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly writer: HouseholdPurchaseItemPricingBasisWriter,
    private readonly moneyFactIds: IdentifierGenerator<PurchaseItemMoneyFactId>,
  ) {}

  async execute(input: CommitPurchaseItemPricingBasisInput): Promise<CommitPurchaseItemPricingBasisOutput> {
    const quantity = requirePositiveCanonicalQuantity(input.pricingBasisQuantity);
    const basisAmount = canonicalMoneyAmount(input.basisAmount);
    const provenance = requireProvenance(input.provenance);
    const candidatePurchaseItemMoneyFactId = this.moneyFactIds.generate();

    let output: CommitPurchaseItemPricingBasisOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.writer.commitPricingBasis(transaction, {
          commandId: input.commandId,
          purchaseId: input.purchaseId,
          purchaseItemId: input.purchaseItemId,
          pricingBasisQuantityNumerator: quantity.numerator.toString(),
          pricingBasisQuantityDenominator: quantity.denominator.toString(),
          pricingBasisUnitId: input.pricingBasisUnitId,
          pricingConversionEvidenceId: input.pricingConversionEvidenceId,
          candidatePurchaseItemMoneyFactId,
          basisAmount,
          provenance,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('Household PurchaseItem pricing basis writer did not return an outcome');
    }
    return output;
  }
}
