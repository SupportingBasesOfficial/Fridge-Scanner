import {
  type CommandId,
  type HouseholdId,
  type PrincipalId,
  type PurchaseId,
  type ReceiptId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export interface CreateReceiptInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly purchaseId?: PurchaseId;
  readonly provenance: string;
}

export interface CreateReceiptOutput {
  readonly receiptId: ReceiptId;
}

export interface CreateReceiptPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateReceiptId: ReceiptId;
  readonly purchaseId: PurchaseId | undefined;
  readonly provenance: string;
}

export interface HouseholdReceiptWriter {
  createReceipt(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CreateReceiptPersistenceInput,
  ): Promise<CreateReceiptOutput>;
}

function requireProvenance(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError('receipt provenance is required');
  }
  return value.trim();
}

export class CreateReceiptUseCase
  implements UseCase<CreateReceiptInput, CreateReceiptOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly receipts: HouseholdReceiptWriter,
    private readonly receiptIds: IdentifierGenerator<ReceiptId>,
  ) {}

  async execute(input: CreateReceiptInput): Promise<CreateReceiptOutput> {
    const provenance = requireProvenance(input.provenance);
    const candidateReceiptId = this.receiptIds.generate();

    let output: CreateReceiptOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.receipts.createReceipt(transaction, {
          commandId: input.commandId,
          candidateReceiptId,
          purchaseId: input.purchaseId,
          provenance,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('Household Receipt writer did not return an outcome');
    }
    return output;
  }
}
