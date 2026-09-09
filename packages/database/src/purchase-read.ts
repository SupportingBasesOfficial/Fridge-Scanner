import {
  DependencyUnavailableError,
  HouseholdUnauthorizedError,
  InternalApplicationError,
  MeasurementUnitId,
  NotFoundError,
  ProductId,
  PurchaseId,
  PurchaseItemId,
  exactRational,
  instant,
  type HouseholdPurchaseObservation,
  type HouseholdPurchasePageCursor,
  type HouseholdPurchaseReader,
  type HouseholdPurchaseSummary,
  type TransactionHandle,
} from '@fridge/application';
import { requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

function normalizeDatabaseFailure(error: unknown): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { readonly code?: unknown }).code ?? '')
    : '';
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

function safeItemCount(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InternalApplicationError(new Error('invalid Purchase item count'));
  }
  return parsed;
}

export class PgHouseholdPurchaseReader implements HouseholdPurchaseReader {
  async listHouseholdPurchases(
    transaction: TransactionHandle,
    input: { readonly limit: number; readonly cursor: HouseholdPurchasePageCursor | null },
  ): Promise<readonly HouseholdPurchaseSummary[]> {
    const client = requirePgClient(transaction);
    let result: { readonly rows: Array<{ authorized: boolean; purchase_id: string | null; transaction_currency_code: string | null; occurred_at: Date | null; recorded_at: Date | null; item_count: string | null }> };
    try {
      result = await client.query(
        `select authorized, purchase_id::text, transaction_currency_code, occurred_at, recorded_at, item_count::text
           from fridge_internal.list_household_purchases(
             $1::uuid, $2::uuid, $3::uuid, $4::integer, $5::timestamptz, $6::uuid
           )
          order by occurred_at desc nulls last, purchase_id desc nulls last`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.limit,
          input.cursor?.occurredAt ?? null,
          input.cursor?.purchaseId ?? null,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }
    if (result.rows[0]?.authorized !== true) throw new HouseholdUnauthorizedError();
    return result.rows
      .filter((row) => row.purchase_id !== null)
      .map((row) => {
        if (row.purchase_id === null || row.transaction_currency_code === null || row.occurred_at === null || row.recorded_at === null || row.item_count === null) {
          throw new InternalApplicationError(new Error('incomplete Purchase summary row'));
        }
        return {
          purchaseId: PurchaseId(row.purchase_id),
          transactionCurrencyCode: row.transaction_currency_code,
          occurredAt: instant(row.occurred_at.toISOString()),
          recordedAt: instant(row.recorded_at.toISOString()),
          itemCount: safeItemCount(row.item_count),
        };
      });
  }

  async getHouseholdPurchase(transaction: TransactionHandle, purchaseId: PurchaseId): Promise<HouseholdPurchaseObservation> {
    const client = requirePgClient(transaction);
    let result: { readonly rows: Array<{ outcome_code: string; result_purchase_id: string | null; transaction_currency_code: string | null; occurred_at: Date | null; purchase_recorded_at: Date | null; purchase_item_id: string | null; product_id: string | null; quantity_num: string | null; quantity_den: string | null; measurement_unit_id: string | null; item_recorded_at: Date | null }> };
    try {
      result = await client.query(
        `select outcome_code, result_purchase_id::text, transaction_currency_code, occurred_at,
                purchase_recorded_at, purchase_item_id::text, product_id::text,
                quantity_num::text, quantity_den::text, measurement_unit_id::text, item_recorded_at
           from fridge_internal.get_household_purchase($1::uuid, $2::uuid, $3::uuid, $4::uuid)
          order by purchase_item_id nulls last`,
        [transaction.householdId, transaction.principalId, transaction.membershipId, purchaseId],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }
    const first = result.rows[0];
    switch (first?.outcome_code) {
      case 'UNAUTHORIZED': throw new HouseholdUnauthorizedError();
      case 'NOT_FOUND': throw new NotFoundError();
      case 'FOUND': break;
      default: throw new InternalApplicationError(new Error('unexpected Purchase read outcome'));
    }
    if (first.result_purchase_id === null || first.transaction_currency_code === null || first.occurred_at === null || first.purchase_recorded_at === null) {
      throw new InternalApplicationError(new Error('incomplete Purchase observation row'));
    }
    const items = result.rows.filter((row) => row.purchase_item_id !== null).map((row) => {
      if (row.purchase_item_id === null || row.product_id === null || row.quantity_num === null || row.quantity_den === null || row.measurement_unit_id === null || row.item_recorded_at === null) {
        throw new InternalApplicationError(new Error('incomplete PurchaseItem observation row'));
      }
      try {
        return {
          purchaseItemId: PurchaseItemId(row.purchase_item_id),
          productId: ProductId(row.product_id),
          quantity: exactRational(BigInt(row.quantity_num), BigInt(row.quantity_den)),
          measurementUnitId: MeasurementUnitId(row.measurement_unit_id),
          recordedAt: instant(row.item_recorded_at.toISOString()),
        };
      } catch (error) {
        throw new InternalApplicationError(error);
      }
    });
    return {
      purchaseId: PurchaseId(first.result_purchase_id),
      transactionCurrencyCode: first.transaction_currency_code,
      occurredAt: instant(first.occurred_at.toISOString()),
      recordedAt: instant(first.purchase_recorded_at.toISOString()),
      itemCount: items.length,
      items,
    };
  }
}
