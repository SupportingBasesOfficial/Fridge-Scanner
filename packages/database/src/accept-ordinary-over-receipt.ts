import {
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  InventoryMovementId,
  MeasurementUnitId,
  NotFoundError,
  PurchaseItemReceiptAllocationId,
  PurchaseReceivingExceptionResolutionId,
  ReceiptItemId,
  ReceiptItemInventoryEffectId,
  StockItemId,
  exactRational,
  type AcceptOrdinaryOverReceiptOutput,
  type AcceptOrdinaryOverReceiptPersistenceInput,
  type HouseholdOrdinaryOverReceiptAcceptor,
  type HouseholdProcurementAdministrationTransaction,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);
const INTEGRAL_NUMERIC_TEXT = /^([+-]?\d+)(?:\.0+)?$/;

function parseIntegralNumeric(value: string): bigint {
  const match = INTEGRAL_NUMERIC_TEXT.exec(value);
  if (match === null || match[1] === undefined) {
    throw new InternalApplicationError(new Error('database returned a non-integral rational component'));
  }
  return BigInt(match[1]);
}

function normalizeFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';

  if (code === 'P6I01') return new IdempotencyConflictError();
  if (code === 'P6R01' || code === 'P6R02') {
    return new ConflictError('ReceiptItemIntent cannot be physically materialized');
  }
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

interface AcceptanceRow {
  readonly outcome_code: string;
  readonly result_purchase_receiving_exception_resolution_id: string | null;
  readonly result_receipt_item_id: string | null;
  readonly result_purchase_item_receipt_allocation_id: string | null;
  readonly result_stock_item_id: string | null;
  readonly result_inventory_movement_id: string | null;
  readonly result_receipt_item_inventory_effect_id: string | null;
  readonly result_accepted_excess_quantity_num: string | null;
  readonly result_accepted_excess_quantity_den: string | null;
  readonly result_accepted_excess_unit_id: string | null;
}

export class PgHouseholdOrdinaryOverReceiptAcceptor implements HouseholdOrdinaryOverReceiptAcceptor {
  async acceptOrdinaryOverReceipt(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: AcceptOrdinaryOverReceiptPersistenceInput,
  ): Promise<AcceptOrdinaryOverReceiptOutput> {
    const client = requirePgClient(transaction);

    let rows: readonly AcceptanceRow[];
    try {
      const result = await client.query<AcceptanceRow>(
        `select outcome_code,
                result_purchase_receiving_exception_resolution_id::text,
                result_receipt_item_id::text,
                result_purchase_item_receipt_allocation_id::text,
                result_stock_item_id::text,
                result_inventory_movement_id::text,
                result_receipt_item_inventory_effect_id::text,
                result_accepted_excess_quantity_num::text,
                result_accepted_excess_quantity_den::text,
                result_accepted_excess_unit_id::text
           from fridge_internal.accept_ordinary_over_receipt(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
             $6::text, $7::uuid, $8::uuid, $9::text,
             $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.purchaseReceivingExceptionId,
          input.placementKind,
          input.storageLocationId ?? null,
          input.compartmentId ?? null,
          input.provenance,
          input.candidatePurchaseReceivingExceptionResolutionId,
          input.candidateReceiptItemId,
          input.candidatePurchaseItemReceiptAllocationId,
          input.candidateStockItemId,
          input.candidateInventoryMovementId,
          input.candidateReceiptItemInventoryEffectId,
        ],
      );
      rows = result.rows;
    } catch (error) {
      throw normalizeFailure(error);
    }

    const outcome = rows[0];
    switch (outcome?.outcome_code) {
      case 'ACCEPTED':
        if (
          outcome.result_purchase_receiving_exception_resolution_id === null ||
          outcome.result_receipt_item_id === null ||
          outcome.result_purchase_item_receipt_allocation_id === null ||
          outcome.result_stock_item_id === null ||
          outcome.result_inventory_movement_id === null ||
          outcome.result_receipt_item_inventory_effect_id === null ||
          outcome.result_accepted_excess_quantity_num === null ||
          outcome.result_accepted_excess_quantity_den === null ||
          outcome.result_accepted_excess_unit_id === null
        ) {
          throw new InternalApplicationError(
            new Error('ordinary over-receipt acceptance succeeded without complete result'),
          );
        }
        return {
          purchaseReceivingExceptionResolutionId: PurchaseReceivingExceptionResolutionId(
            outcome.result_purchase_receiving_exception_resolution_id,
          ),
          receiptItemId: ReceiptItemId(outcome.result_receipt_item_id),
          purchaseItemReceiptAllocationId: PurchaseItemReceiptAllocationId(
            outcome.result_purchase_item_receipt_allocation_id,
          ),
          stockItemId: StockItemId(outcome.result_stock_item_id),
          inventoryMovementId: InventoryMovementId(outcome.result_inventory_movement_id),
          receiptItemInventoryEffectId: ReceiptItemInventoryEffectId(
            outcome.result_receipt_item_inventory_effect_id,
          ),
          acceptedExcessQuantity: exactRational(
            parseIntegralNumeric(outcome.result_accepted_excess_quantity_num),
            parseIntegralNumeric(outcome.result_accepted_excess_quantity_den),
          ),
          acceptedExcessUnitId: MeasurementUnitId(outcome.result_accepted_excess_unit_id),
        };
      case 'INVALID_INPUT':
        throw new InvalidInputError('ordinary over-receipt acceptance input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'CONFLICT':
        throw new ConflictError('detected over-receipt cannot be accepted through the ordinary path');
      case 'NO_OVER_RECEIPT':
        throw new ConflictError('detected exception no longer requires ordinary excess acceptance');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected ordinary over-receipt acceptance outcome'));
    }
  }
}
