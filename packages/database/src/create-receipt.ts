import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  ReceiptId,
  type CreateReceiptOutput,
  type CreateReceiptPersistenceInput,
  type HouseholdProcurementAdministrationTransaction,
  type HouseholdReceiptWriter,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set([
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

function normalizeCreateReceiptDatabaseFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';

  if (code === 'P6I01') {
    return new IdempotencyConflictError();
  }
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

interface ReceiptRow {
  readonly outcome_code: string;
  readonly result_receipt_id: string | null;
}

export class PgHouseholdReceiptWriter implements HouseholdReceiptWriter {
  async createReceipt(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CreateReceiptPersistenceInput,
  ): Promise<CreateReceiptOutput> {
    const client = requirePgClient(transaction);

    let row: ReceiptRow | undefined;
    try {
      const result = await client.query<ReceiptRow>(
        `select outcome_code,
                result_receipt_id::text
           from fridge_internal.create_household_receipt(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::uuid,
             $7::text
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidateReceiptId,
          input.purchaseId ?? null,
          input.provenance,
        ],
      );
      row = result.rows[0];
    } catch (error) {
      throw normalizeCreateReceiptDatabaseFailure(error);
    }

    switch (row?.outcome_code) {
      case 'CREATED':
        if (row.result_receipt_id === null) {
          throw new InternalApplicationError(new Error('CreateReceipt succeeded without Receipt identity'));
        }
        return { receiptId: ReceiptId(row.result_receipt_id) };
      case 'INVALID_INPUT':
        throw new InvalidInputError('receipt input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected CreateReceipt outcome'));
    }
  }
}
