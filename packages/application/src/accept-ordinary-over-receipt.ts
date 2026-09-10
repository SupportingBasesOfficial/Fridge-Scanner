import type {
  CommandId,
  CompartmentId,
  ExactRational,
  HouseholdId,
  InventoryMovementId,
  MeasurementUnitId,
  PrincipalId,
  PurchaseItemReceiptAllocationId,
  PurchaseReceivingExceptionId,
  PurchaseReceivingExceptionResolutionId,
  ReceiptItemId,
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

export type AcceptedOverReceiptPlacement =
  | {
      readonly kind: 'LOCATION';
      readonly storageLocationId: StorageLocationId;
    }
  | {
      readonly kind: 'COMPARTMENT';
      readonly compartmentId: CompartmentId;
    };

export interface AcceptOrdinaryOverReceiptInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly purchaseReceivingExceptionId: PurchaseReceivingExceptionId;
  readonly placement: AcceptedOverReceiptPlacement;
  readonly provenance: string;
}

export interface AcceptOrdinaryOverReceiptOutput {
  readonly purchaseReceivingExceptionResolutionId: PurchaseReceivingExceptionResolutionId;
  readonly receiptItemId: ReceiptItemId;
  readonly purchaseItemReceiptAllocationId: PurchaseItemReceiptAllocationId;
  readonly stockItemId: StockItemId;
  readonly inventoryMovementId: InventoryMovementId;
  readonly receiptItemInventoryEffectId: ReceiptItemInventoryEffectId;
  readonly acceptedExcessQuantity: ExactRational;
  readonly acceptedExcessUnitId: MeasurementUnitId;
}

export interface AcceptOrdinaryOverReceiptPersistenceInput {
  readonly commandId: CommandId;
  readonly purchaseReceivingExceptionId: PurchaseReceivingExceptionId;
  readonly placementKind: 'LOCATION' | 'COMPARTMENT';
  readonly storageLocationId: StorageLocationId | undefined;
  readonly compartmentId: CompartmentId | undefined;
  readonly provenance: string;
  readonly candidatePurchaseReceivingExceptionResolutionId: PurchaseReceivingExceptionResolutionId;
  readonly candidateReceiptItemId: ReceiptItemId;
  readonly candidatePurchaseItemReceiptAllocationId: PurchaseItemReceiptAllocationId;
  readonly candidateStockItemId: StockItemId;
  readonly candidateInventoryMovementId: InventoryMovementId;
  readonly candidateReceiptItemInventoryEffectId: ReceiptItemInventoryEffectId;
}

export interface HouseholdOrdinaryOverReceiptAcceptor {
  acceptOrdinaryOverReceipt(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: AcceptOrdinaryOverReceiptPersistenceInput,
  ): Promise<AcceptOrdinaryOverReceiptOutput>;
}

function canonicalProvenance(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError('over-receipt acceptance provenance is required');
  }
  return value.trim();
}

function canonicalPlacement(value: AcceptedOverReceiptPlacement): {
  readonly placementKind: 'LOCATION' | 'COMPARTMENT';
  readonly storageLocationId: StorageLocationId | undefined;
  readonly compartmentId: CompartmentId | undefined;
} {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new InvalidInputError('over-receipt acceptance placement is required');
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

  throw new InvalidInputError('over-receipt acceptance placement kind is invalid');
}

export class AcceptOrdinaryOverReceiptUseCase
  implements UseCase<AcceptOrdinaryOverReceiptInput, AcceptOrdinaryOverReceiptOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly acceptor: HouseholdOrdinaryOverReceiptAcceptor,
    private readonly resolutionIds: IdentifierGenerator<PurchaseReceivingExceptionResolutionId>,
    private readonly receiptItemIds: IdentifierGenerator<ReceiptItemId>,
    private readonly allocationIds: IdentifierGenerator<PurchaseItemReceiptAllocationId>,
    private readonly stockItemIds: IdentifierGenerator<StockItemId>,
    private readonly inventoryMovementIds: IdentifierGenerator<InventoryMovementId>,
    private readonly receiptInventoryEffectIds: IdentifierGenerator<ReceiptItemInventoryEffectId>,
  ) {}

  async execute(input: AcceptOrdinaryOverReceiptInput): Promise<AcceptOrdinaryOverReceiptOutput> {
    const provenance = canonicalProvenance(input.provenance);
    const placement = canonicalPlacement(input.placement);

    const candidatePurchaseReceivingExceptionResolutionId = this.resolutionIds.generate();
    const candidateReceiptItemId = this.receiptItemIds.generate();
    const candidatePurchaseItemReceiptAllocationId = this.allocationIds.generate();
    const candidateStockItemId = this.stockItemIds.generate();
    const candidateInventoryMovementId = this.inventoryMovementIds.generate();
    const candidateReceiptItemInventoryEffectId = this.receiptInventoryEffectIds.generate();

    let output: AcceptOrdinaryOverReceiptOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.acceptor.acceptOrdinaryOverReceipt(transaction, {
          commandId: input.commandId,
          purchaseReceivingExceptionId: input.purchaseReceivingExceptionId,
          placementKind: placement.placementKind,
          storageLocationId: placement.storageLocationId,
          compartmentId: placement.compartmentId,
          provenance,
          candidatePurchaseReceivingExceptionResolutionId,
          candidateReceiptItemId,
          candidatePurchaseItemReceiptAllocationId,
          candidateStockItemId,
          candidateInventoryMovementId,
          candidateReceiptItemInventoryEffectId,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('ordinary over-receipt acceptor did not return an outcome');
    }
    return output;
  }
}
