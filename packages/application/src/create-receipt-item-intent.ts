import {
  exactRational,
  type CommandId,
  type ExactRational,
  type HouseholdId,
  type MeasurementUnitId,
  type PrincipalId,
  type ProductId,
  type ReceiptId,
  type ReceiptItemIntentId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export interface CreateReceiptItemIntentInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly receiptId: ReceiptId;
  readonly productId: ProductId;
  readonly quantity: ExactRational;
  readonly measurementUnitId: MeasurementUnitId;
  readonly provenance: string;
}

export interface CreateReceiptItemIntentOutput {
  readonly receiptItemIntentId: ReceiptItemIntentId;
}

export interface CreateReceiptItemIntentPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateReceiptItemIntentId: ReceiptItemIntentId;
  readonly receiptId: ReceiptId;
  readonly productId: ProductId;
  readonly quantityNumerator: string;
  readonly quantityDenominator: string;
  readonly measurementUnitId: MeasurementUnitId;
  readonly provenance: string;
}

export interface HouseholdReceiptItemIntentWriter {
  createReceiptItemIntent(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CreateReceiptItemIntentPersistenceInput,
  ): Promise<CreateReceiptItemIntentOutput>;
}

function requirePositiveCanonicalQuantity(value: ExactRational): ExactRational {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.numerator !== 'bigint' ||
    typeof value.denominator !== 'bigint'
  ) {
    throw new InvalidInputError('receipt item intent quantity must be an ExactRational');
  }
  if (value.numerator <= 0n || value.denominator <= 0n) {
    throw new InvalidInputError('receipt item intent quantity must be positive');
  }

  const canonical = exactRational(value.numerator, value.denominator);
  if (canonical.numerator !== value.numerator || canonical.denominator !== value.denominator) {
    throw new InvalidInputError('receipt item intent quantity must already be canonical');
  }
  return value;
}

function requireProvenance(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError('receipt item intent provenance is required');
  }
  return value.trim();
}

export class CreateReceiptItemIntentUseCase
  implements UseCase<CreateReceiptItemIntentInput, CreateReceiptItemIntentOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly intents: HouseholdReceiptItemIntentWriter,
    private readonly intentIds: IdentifierGenerator<ReceiptItemIntentId>,
  ) {}

  async execute(input: CreateReceiptItemIntentInput): Promise<CreateReceiptItemIntentOutput> {
    const quantity = requirePositiveCanonicalQuantity(input.quantity);
    const provenance = requireProvenance(input.provenance);
    const candidateReceiptItemIntentId = this.intentIds.generate();

    let output: CreateReceiptItemIntentOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.intents.createReceiptItemIntent(transaction, {
          commandId: input.commandId,
          candidateReceiptItemIntentId,
          receiptId: input.receiptId,
          productId: input.productId,
          quantityNumerator: quantity.numerator.toString(),
          quantityDenominator: quantity.denominator.toString(),
          measurementUnitId: input.measurementUnitId,
          provenance,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('Household ReceiptItem intent writer did not return an outcome');
    }
    return output;
  }
}
