import {
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  InventoryMovementId,
  NotFoundError,
  PurchaseItemSubstitutionAllocationId,
  ReceiptItemId,
  ReceiptItemInventoryEffectId,
  StockItemId,
  type HouseholdProcurementAdministrationTransaction,
  type HouseholdSubstitutionReceiptItemMaterializer,
  type MaterializeSubstitutionReceiptItemOutput,
  type MaterializeSubstitutionReceiptItemPersistenceInput,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

function normalizeFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';

  if (code === 'P6I01') return new IdempotencyConflictError();
  if (code === 'P6R01') return new ConflictError('ReceiptItem intent is already physically materialized');
  if (code === 'P6R02') return new ConflictError('ReceiptItem intent has an unresolved over-receipt exception');
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

interface MaterializationRow {
  readonly outcome_code: string;
  readonly result_receipt_item_id: string | null;
  readonly result_purchase_item_substitution_allocation_id: string | null;
  readonly result_stock_item_id: string | null;
  readonly result_inventory_movement_id: string | null;
  readonly result_receipt_item_inventory_effect_id: string | null;
}

export class PgHouseholdSubstitutionReceiptItemMaterializer
  implements HouseholdSubstitutionReceiptItemMaterializer
{
  async materializeSubstitutionReceiptItem(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: MaterializeSubstitutionReceiptItemPersistenceInput,
  ): Promise<MaterializeSubstitutionReceiptItemOutput> {
    const client = requirePgClient(transaction);

    let rows: readonly MaterializationRow[];
    try {
      const result = await client.query<MaterializationRow>(
        `select outcome_code,
                result_receipt_item_id::text,
                result_purchase_item_substitution_allocation_id::text,
                result_stock_item_id::text,
                result_inventory_movement_id::text,
                result_receipt_item_inventory_effect_id::text
           from fridge_internal.materialize_substitution_receipt_item(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
             $7::uuid, $8::text, $9::text, $10::uuid, $11::uuid, $12::text,
             $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.receiptItemIntentId,
          input.purchaseItemId,
          input.allocationConversionEvidenceId ?? null,
          input.reason,
          input.placementKind,
          input.storageLocationId ?? null,
          input.compartmentId ?? null,
          input.provenance,
          input.candidateReceiptItemId,
          input.candidatePurchaseItemSubstitutionAllocationId,
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
      case 'MATERIALIZED':
        if (
          outcome.result_receipt_item_id === null ||
          outcome.result_purchase_item_substitution_allocation_id === null ||
          outcome.result_stock_item_id === null ||
          outcome.result_inventory_movement_id === null ||
          outcome.result_receipt_item_inventory_effect_id === null
        ) {
          throw new InternalApplicationError(
            new Error('substitution ReceiptItem materialization succeeded without complete result identities'),
          );
        }
        return {
          receiptItemId: ReceiptItemId(outcome.result_receipt_item_id),
          purchaseItemSubstitutionAllocationId: PurchaseItemSubstitutionAllocationId(
            outcome.result_purchase_item_substitution_allocation_id,
          ),
          stockItemId: StockItemId(outcome.result_stock_item_id),
          inventoryMovementId: InventoryMovementId(outcome.result_inventory_movement_id),
          receiptItemInventoryEffectId: ReceiptItemInventoryEffectId(
            outcome.result_receipt_item_inventory_effect_id,
          ),
        };
      case 'INVALID_INPUT':
        throw new InvalidInputError('substitution receipt materialization input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'CONFLICT':
        throw new ConflictError('ReceiptItem intent cannot be substitution-materialized');
      case 'RECEIVING_CONFLICT':
        throw new ConflictError('PurchaseItem receiving availability is insufficient');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected substitution ReceiptItem materialization outcome'),
        );
    }
  }
}
