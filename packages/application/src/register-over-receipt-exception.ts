import type {
  CommandId,
  ExactRational,
  HouseholdId,
  MeasurementConversionEvidenceId,
  MeasurementUnitId,
  PrincipalId,
  PurchaseItemId,
  PurchaseReceivingExceptionId,
  ReceiptItemIntentId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export interface RegisterOverReceiptExceptionInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly receiptItemIntentId: ReceiptItemIntentId;
  readonly purchaseItemId: PurchaseItemId;
  readonly allocationConversionEvidenceId?: MeasurementConversionEvidenceId;
  readonly reason: string;
  readonly provenance: string;
}

export interface RegisterOverReceiptExceptionOutput {
  readonly purchaseReceivingExceptionId: PurchaseReceivingExceptionId;
  readonly discrepantQuantity: ExactRational;
  readonly discrepantUnitId: MeasurementUnitId;
}

export interface RegisterOverReceiptExceptionPersistenceInput {
  readonly commandId: CommandId;
  readonly receiptItemIntentId: ReceiptItemIntentId;
  readonly purchaseItemId: PurchaseItemId;
  readonly allocationConversionEvidenceId: MeasurementConversionEvidenceId | undefined;
  readonly reason: string;
  readonly provenance: string;
  readonly candidatePurchaseReceivingExceptionId: PurchaseReceivingExceptionId;
}

export interface HouseholdOverReceiptExceptionRegistrar {
  registerOverReceiptException(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: RegisterOverReceiptExceptionPersistenceInput,
  ): Promise<RegisterOverReceiptExceptionOutput>;
}

function canonicalText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError(`${label} is required`);
  }
  return value.trim();
}

export class RegisterOverReceiptExceptionUseCase
  implements UseCase<RegisterOverReceiptExceptionInput, RegisterOverReceiptExceptionOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly registrar: HouseholdOverReceiptExceptionRegistrar,
    private readonly exceptionIds: IdentifierGenerator<PurchaseReceivingExceptionId>,
  ) {}

  async execute(input: RegisterOverReceiptExceptionInput): Promise<RegisterOverReceiptExceptionOutput> {
    const reason = canonicalText(input.reason, 'over-receipt reason');
    const provenance = canonicalText(input.provenance, 'over-receipt provenance');
    const candidatePurchaseReceivingExceptionId = this.exceptionIds.generate();

    let output: RegisterOverReceiptExceptionOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.registrar.registerOverReceiptException(transaction, {
          commandId: input.commandId,
          receiptItemIntentId: input.receiptItemIntentId,
          purchaseItemId: input.purchaseItemId,
          allocationConversionEvidenceId: input.allocationConversionEvidenceId,
          reason,
          provenance,
          candidatePurchaseReceivingExceptionId,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('over-receipt exception registrar did not return an outcome');
    }
    return output;
  }
}
