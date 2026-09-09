import {
  exactRational,
  type CommandId,
  type ExactRational,
  type HouseholdId,
  type MeasurementUnitId,
  type PrincipalId,
  type ProductId,
  type PurchaseId,
  type PurchaseItemId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export interface CreatePurchaseItemInput {
  readonly productId: ProductId;
  readonly quantity: ExactRational;
  readonly measurementUnitId: MeasurementUnitId;
}

export interface CreatePurchaseInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly transactionCurrencyCode: string;
  readonly items: readonly CreatePurchaseItemInput[];
}

export interface CreatePurchaseOutput {
  readonly purchaseId: PurchaseId;
  readonly purchaseItemIds: readonly PurchaseItemId[];
}

export interface CreatePurchasePersistenceItemInput {
  readonly candidatePurchaseItemId: PurchaseItemId;
  readonly productId: ProductId;
  readonly quantityNumerator: string;
  readonly quantityDenominator: string;
  readonly measurementUnitId: MeasurementUnitId;
}

export interface CreatePurchasePersistenceInput {
  readonly commandId: CommandId;
  readonly candidatePurchaseId: PurchaseId;
  readonly transactionCurrencyCode: string;
  readonly items: readonly CreatePurchasePersistenceItemInput[];
}

export interface HouseholdPurchaseWriter {
  createPurchase(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CreatePurchasePersistenceInput,
  ): Promise<CreatePurchaseOutput>;
}

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

function requireCurrencyCode(value: string): string {
  if (typeof value !== 'string' || !CURRENCY_CODE_PATTERN.test(value)) {
    throw new InvalidInputError('transaction currency code must be an uppercase three-letter code');
  }
  return value;
}

function requirePositiveCanonicalQuantity(value: ExactRational, index: number): ExactRational {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.numerator !== 'bigint' ||
    typeof value.denominator !== 'bigint'
  ) {
    throw new InvalidInputError(`purchase item ${index + 1} quantity must be an ExactRational`);
  }

  if (value.numerator <= 0n || value.denominator <= 0n) {
    throw new InvalidInputError(`purchase item ${index + 1} quantity must be positive`);
  }

  const canonical = exactRational(value.numerator, value.denominator);
  if (
    canonical.numerator !== value.numerator ||
    canonical.denominator !== value.denominator
  ) {
    throw new InvalidInputError(`purchase item ${index + 1} quantity must already be canonical`);
  }

  return value;
}

export class CreatePurchaseUseCase
  implements UseCase<CreatePurchaseInput, CreatePurchaseOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly purchases: HouseholdPurchaseWriter,
    private readonly purchaseIds: IdentifierGenerator<PurchaseId>,
    private readonly purchaseItemIds: IdentifierGenerator<PurchaseItemId>,
  ) {}

  async execute(input: CreatePurchaseInput): Promise<CreatePurchaseOutput> {
    const transactionCurrencyCode = requireCurrencyCode(input.transactionCurrencyCode);
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new InvalidInputError('purchase must contain at least one item');
    }

    const candidatePurchaseId = this.purchaseIds.generate();
    const items = input.items.map((item, index) => {
      const quantity = requirePositiveCanonicalQuantity(item.quantity, index);
      return {
        candidatePurchaseItemId: this.purchaseItemIds.generate(),
        productId: item.productId,
        quantityNumerator: quantity.numerator.toString(),
        quantityDenominator: quantity.denominator.toString(),
        measurementUnitId: item.measurementUnitId,
      } satisfies CreatePurchasePersistenceItemInput;
    });

    let output: CreatePurchaseOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.purchases.createPurchase(transaction, {
          commandId: input.commandId,
          candidatePurchaseId,
          transactionCurrencyCode,
          items,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('Household Purchase writer did not return an outcome');
    }
    if (output.purchaseItemIds.length !== items.length) {
      throw new TypeError('Household Purchase writer returned a different item cardinality');
    }

    return output;
  }
}
