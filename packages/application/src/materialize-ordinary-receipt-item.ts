import type {
  CommandId,
  CompartmentId,
  HouseholdId,
  InventoryMovementId,
  MeasurementConversionEvidenceId,
  PrincipalId,
  PurchaseItemId,
  PurchaseItemReceiptAllocationId,
  ReceiptItemId,
  ReceiptItemIntentId,
  ReceiptItemInventoryEffectId,
  StockItemId,
  StorageLocationId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export type ReceiptPlacement =
  | {
      readonly kind: 'LOCATION';
      readonly storageLocationId: StorageLocationId;
    }
  | {
      readonly kind: 'COMPARTMENT';
      readonly compartmentId: CompartmentId;
    };

export interface MaterializeOrdinaryReceiptItemInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly receiptItemIntentId: ReceiptItemIntentId;
  readonly purchaseItemId: PurchaseItemId;
  readonly allocationConversionEvidenceId?: MeasurementConversionEvidenceId;
  readonly placement: ReceiptPlacement;
  readonly provenance: string;
}

export interface MaterializeOrdinaryReceiptItemOutput {
  readonly receiptItemId: ReceiptItemId;
  readonly purchaseItemReceiptAllocationId: PurchaseItemReceiptAllocationId;
  readonly stockItemId: StockItemId;
  readonly inventoryMovementId: InventoryMovementId;
  readonly receiptItemInventoryEffectId: ReceiptItemInventoryEffectId;
}

export interface MaterializeOrdinaryReceiptItemPersistenceInput {
  readonly commandId: CommandId;
  readonly receiptItemIntentId: ReceiptItemIntentId;
  readonly purchaseItemId: PurchaseItemId;
  readonly allocationConversionEvidenceId: MeasurementConversionEvidenceId | undefined;
  readonly placementKind: 'LOCATION' | 'COMPARTMENT';
  readonly storageLocationId: StorageLocationId | undefined;
  readonly compartmentId: CompartmentId | undefined;
  readonly provenance: string;
  readonly candidateReceiptItemId: ReceiptItemId;
  readonly candidatePurchaseItemReceiptAllocationId: PurchaseItemReceiptAllocationId;
  readonly candidateStockItemId: StockItemId;
  readonly candidateInventoryMovementId: InventoryMovementId;
  readonly candidateReceiptItemInventoryEffectId: ReceiptItemInventoryEffectId;
}

export interface HouseholdOrdinaryReceiptItemMaterializer {
  materializeOrdinaryReceiptItem(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: MaterializeOrdinaryReceiptItemPersistenceInput,
  ): Promise<MaterializeOrdinaryReceiptItemOutput>;
}

function canonicalProvenance(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError('receipt materialization provenance is required');
  }
  return value.trim();
}

function canonicalPlacement(value: ReceiptPlacement): {
  readonly placementKind: 'LOCATION' | 'COMPARTMENT';
  readonly storageLocationId: StorageLocationId | undefined;
  readonly compartmentId: CompartmentId | undefined;
} {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new InvalidInputError('receipt materialization placement is required');
  }

  if (value.kind === 'LOCATION') {
    if (!('storageLocationId' in value) || value.storageLocationId === undefined) {
      throw new InvalidInputError('storage location placement requires storageLocationId');
    }
    return {
      placementKind: 'LOCATION',
      storageLocationId: value.storageLocationId,
      compartmentId: undefined,
    };
  }

  if (value.kind === 'COMPARTMENT') {
    if (!('compartmentId' in value) || value.compartmentId === undefined) {
      throw new InvalidInputError('compartment placement requires compartmentId');
    }
    return {
      placementKind: 'COMPARTMENT',
      storageLocationId: undefined,
      compartmentId: value.compartmentId,
    };
  }

  throw new InvalidInputError('receipt materialization placement kind is invalid');
}

export class MaterializeOrdinaryReceiptItemUseCase
  implements UseCase<MaterializeOrdinaryReceiptItemInput, MaterializeOrdinaryReceiptItemOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly materializer: HouseholdOrdinaryReceiptItemMaterializer,
    private readonly receiptItemIds: IdentifierGenerator<ReceiptItemId>,
    private readonly allocationIds: IdentifierGenerator<PurchaseItemReceiptAllocationId>,
    private readonly stockItemIds: IdentifierGenerator<StockItemId>,
    private readonly inventoryMovementIds: IdentifierGenerator<InventoryMovementId>,
    private readonly receiptInventoryEffectIds: IdentifierGenerator<ReceiptItemInventoryEffectId>,
  ) {}

  async execute(input: MaterializeOrdinaryReceiptItemInput): Promise<MaterializeOrdinaryReceiptItemOutput> {
    const provenance = canonicalProvenance(input.provenance);
    const placement = canonicalPlacement(input.placement);

    const candidateReceiptItemId = this.receiptItemIds.generate();
    const candidatePurchaseItemReceiptAllocationId = this.allocationIds.generate();
    const candidateStockItemId = this.stockItemIds.generate();
    const candidateInventoryMovementId = this.inventoryMovementIds.generate();
    const candidateReceiptItemInventoryEffectId = this.receiptInventoryEffectIds.generate();

    let output: MaterializeOrdinaryReceiptItemOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.materializer.materializeOrdinaryReceiptItem(transaction, {
          commandId: input.commandId,
          receiptItemIntentId: input.receiptItemIntentId,
          purchaseItemId: input.purchaseItemId,
          allocationConversionEvidenceId: input.allocationConversionEvidenceId,
          placementKind: placement.placementKind,
          storageLocationId: placement.storageLocationId,
          compartmentId: placement.compartmentId,
          provenance,
          candidateReceiptItemId,
          candidatePurchaseItemReceiptAllocationId,
          candidateStockItemId,
          candidateInventoryMovementId,
          candidateReceiptItemInventoryEffectId,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('ordinary ReceiptItem materializer did not return an outcome');
    }
    return output;
  }
}
