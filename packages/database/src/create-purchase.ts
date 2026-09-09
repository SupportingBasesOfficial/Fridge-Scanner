import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  PurchaseId,
  PurchaseItemId,
  type CreatePurchaseOutput,
  type CreatePurchasePersistenceInput,
  type HouseholdProcurementAdministrationTransaction,
  type HouseholdPurchaseWriter,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set([
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

function normalizeCreatePurchaseDatabaseFailure(error: unknown): Error {
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

interface PurchaseRow {
  readonly outcome_code: string;
  readonly result_purchase_id: string | null;
  readonly line_no: number | null;
  readonly result_purchase_item_id: string | null;
}

export class PgHouseholdPurchaseWriter implements HouseholdPurchaseWriter {
  async createPurchase(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CreatePurchasePersistenceInput,
  ): Promise<CreatePurchaseOutput> {
    const client = requirePgClient(transaction);
    const itemsJson = JSON.stringify(
      input.items.map((item) => ({
        candidatePurchaseItemId: item.candidatePurchaseItemId,
        productId: item.productId,
        quantityNumerator: item.quantityNumerator,
        quantityDenominator: item.quantityDenominator,
        measurementUnitId: item.measurementUnitId,
      })),
    );

    let rows: readonly PurchaseRow[];
    try {
      const result = await client.query<PurchaseRow>(
        `select outcome_code,
                result_purchase_id::text,
                line_no,
                result_purchase_item_id::text
           from fridge_internal.create_household_purchase(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::text,
             $7::jsonb
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidatePurchaseId,
          input.transactionCurrencyCode,
          itemsJson,
        ],
      );
      rows = result.rows;
    } catch (error) {
      throw normalizeCreatePurchaseDatabaseFailure(error);
    }

    const first = rows[0];
    switch (first?.outcome_code) {
      case 'CREATED': {
        if (first.result_purchase_id === null) {
          throw new InternalApplicationError(new Error('CreatePurchase succeeded without Purchase identity'));
        }
        const purchaseId = PurchaseId(first.result_purchase_id);
        const ordered = [...rows].sort((left, right) => (left.line_no ?? 0) - (right.line_no ?? 0));
        if (ordered.length !== input.items.length) {
          throw new InternalApplicationError(new Error('CreatePurchase returned unexpected item cardinality'));
        }
        const purchaseItemIds = ordered.map((row, index) => {
          if (
            row.outcome_code !== 'CREATED' ||
            row.result_purchase_id !== first.result_purchase_id ||
            row.line_no !== index + 1 ||
            row.result_purchase_item_id === null
          ) {
            throw new InternalApplicationError(new Error('CreatePurchase returned malformed ordered item result'));
          }
          return PurchaseItemId(row.result_purchase_item_id);
        });
        return { purchaseId, purchaseItemIds };
      }
      case 'INVALID_INPUT':
        throw new InvalidInputError('purchase input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected CreatePurchase outcome'));
    }
  }
}
