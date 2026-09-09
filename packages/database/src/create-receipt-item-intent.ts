import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  ReceiptItemIntentId,
  type CreateReceiptItemIntentOutput,
  type CreateReceiptItemIntentPersistenceInput,
  type HouseholdProcurementAdministrationTransaction,
  type HouseholdReceiptItemIntentWriter,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set([
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

function normalizeFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';

  if (code === 'P6I01') return new IdempotencyConflictError();
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

interface IntentRow {
  readonly outcome_code: string;
  readonly result_receipt_item_intent_id: string | null;
}

export class PgHouseholdReceiptItemIntentWriter implements HouseholdReceiptItemIntentWriter {
  async createReceiptItemIntent(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CreateReceiptItemIntentPersistenceInput,
  ): Promise<CreateReceiptItemIntentOutput> {
    const client = requirePgClient(transaction);

    let rows: readonly IntentRow[];
    try {
      const result = await client.query<IntentRow>(
        `select outcome_code,
                result_receipt_item_intent_id::text
           from fridge_internal.create_household_receipt_item_intent(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::uuid,
             $7::uuid,
             $8::numeric,
             $9::numeric,
             $10::uuid,
             $11::text
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidateReceiptItemIntentId,
          input.receiptId,
          input.productId,
          input.quantityNumerator,
          input.quantityDenominator,
          input.measurementUnitId,
          input.provenance,
        ],
      );
      rows = result.rows;
    } catch (error) {
      throw normalizeFailure(error);
    }

    const outcome = rows[0];
    switch (outcome?.outcome_code) {
      case 'CREATED':
        if (outcome.result_receipt_item_intent_id === null) {
          throw new InternalApplicationError(
            new Error('CreateReceiptItemIntent succeeded without intent identity'),
          );
        }
        return { receiptItemIntentId: ReceiptItemIntentId(outcome.result_receipt_item_intent_id) };
      case 'INVALID_INPUT':
        throw new InvalidInputError('receipt item intent input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected CreateReceiptItemIntent outcome'));
    }
  }
}
