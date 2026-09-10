import type {
  CommandId,
  CompartmentId,
  HouseholdId,
  InventoryMovementId,
  MeasurementConversionEvidenceId,
  PrincipalId,
  PurchaseItemId,
  PurchaseItemSubstitutionAllocationId,
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
import type { ReceiptPlacement } from './materialize-ordinary-receipt-item.js';

export interface MaterializeSubstitutionReceiptItemInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly receiptItemIntentId: ReceiptItemIntentId;
  readonly purchaseItemId: PurchaseItemId;
  readonly allocationConversionEvidenceId?: MeasurementConversionEvidenceId;
  readonly reason: string;
  readonly placement: ReceiptPlacement;
  readonly provenance: string;
}

export interface MaterializeSubstitutionReceiptItemOutput {
  readonly receiptItemId: ReceiptItemId;
  readonly purchaseItemSubstitutionAllocationId: PurchaseItemSubstitutionAllocationId;
  readonly stockItemId: StockItemId;
  readonly inventoryMovementId: InventoryMovementId;
  readonly receiptItemInventoryEffectId: ReceiptItemInventoryEffectId;
}

export interface MaterializeSubstitutionReceiptItemPersistenceInput {
  readonly commandId: CommandId;
  readonly receiptItemIntentId: ReceiptItemIntentId;
  readonly purchaseItemId: PurchaseItemId;
  readonly allocationConversionEvidenceId: MeasurementConversionEvidenceId | undefined;
  readonly reason: string;
  readonly placementKind: 'LOCATION' | 'COMPARTMENT';
  readonly storageLocationId: StorageLocationId | undefined;
  readonly compartmentId: CompartmentId | undefined;
  readonly provenance: string;
  readonly candidateReceiptItemId: ReceiptItemId;
  readonly candidatePurchaseItemSubstitutionAllocationId: PurchaseItemSubstitutionAllocationId;
  readonly candidateStockItemId: StockItemId;
  readonly candidateInventoryMovementId: InventoryMovementId;
  readonly candidateReceiptItemInventoryEffectId: ReceiptItemInventoryEffectId;
}

export interface HouseholdSubstitutionReceiptItemMaterializer {
  materializeSubstitutionReceiptItem(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: MaterializeSubstitutionReceiptItemPersistenceInput,
  ): Promise<MaterializeSubstitutionReceiptItemOutput>;
}

function canonicalText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError(`${label} is required`);
  }
  return value.trim();
}

function canonicalPlacement(value: ReceiptPlacement): {
  readonly placementKind: 'LOCATION' | 'COMPARTMENT';
  readonly storageLocationId: StorageLocationId | undefined;
  readonly compartmentId: CompartmentId | undefined;
} {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new InvalidInputError('receipt substitution placement is required');
  }

  if (value.kind === 'LOCATION') {
    return {
      placementKind: 'LOCATION',
      storageLocationId: value.storageLocationId,
      compartmentId: undefined,
    };
  }

  if (value.kind === 'COMPARTMENT') {
    return {
      placementKind: 'COMPARTMENT',
      storageLocationId: undefined,
      compartmentId: value.compartmentId,
    };
  }

  throw new InvalidInputError('receipt substitution placement kind is invalid');
}

export class MaterializeSubstitutionReceiptItemUseCase
  implements UseCase<MaterializeSubstitutionReceiptItemInput, MaterializeSubstitutionReceiptItemOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly materializer: HouseholdSubstitutionReceiptItemMaterializer,
    private readonly receiptItemIds: IdentifierGenerator<ReceiptItemId>,
    private readonly substitutionAllocationIds: IdentifierGenerator<PurchaseItemSubstitutionAllocationId>,
    private readonly stockItemIds: IdentifierGenerator<StockItemId>,
    private readonly inventoryMovementIds: IdentifierGenerator<InventoryMovementId>,
    private readonly receiptInventoryEffectIds: IdentifierGenerator<ReceiptItemInventoryEffectId>,
  ) {}

  async execute(input: MaterializeSubstitutionReceiptItemInput): Promise<MaterializeSubstitutionReceiptItemOutput> {
    const reason = canonicalText(input.reason, 'substitution reason');
    const provenance = canonicalText(input.provenance, 'receipt substitution provenance');
    const placement = canonicalPlacement(input.placement);

    const candidateReceiptItemId = this.receiptItemIds.generate();
    const candidatePurchaseItemSubstitutionAllocationId = this.substitutionAllocationIds.generate();
    const candidateStockItemId = this.stockItemIds.generate();
    const candidateInventoryMovementId = this.inventoryMovementIds.generate();
    const candidateReceiptItemInventoryEffectId = this.receiptInventoryEffectIds.generate();

    let output: MaterializeSubstitutionReceiptItemOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.materializer.materializeSubstitutionReceiptItem(transaction, {
          commandId: input.commandId,
          receiptItemIntentId: input.receiptItemIntentId,
          purchaseItemId: input.purchaseItemId,
          allocationConversionEvidenceId: input.allocationConversionEvidenceId,
          reason,
          placementKind: placement.placementKind,
          storageLocationId: placement.storageLocationId,
          compartmentId: placement.compartmentId,
          provenance,
          candidateReceiptItemId,
          candidatePurchaseItemSubstitutionAllocationId,
          candidateStockItemId,
          candidateInventoryMovementId,
          candidateReceiptItemInventoryEffectId,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('substitution ReceiptItem materializer did not return an outcome');
    }
    return output;
  }
}
