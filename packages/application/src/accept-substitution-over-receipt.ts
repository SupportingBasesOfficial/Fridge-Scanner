import type {
  CommandId,
  CompartmentId,
  ExactRational,
  HouseholdId,
  InventoryMovementId,
  MeasurementUnitId,
  PrincipalId,
  PurchaseItemSubstitutionAllocationId,
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

export type AcceptedSubstitutionOverReceiptPlacement =
  | { readonly kind: 'LOCATION'; readonly storageLocationId: StorageLocationId }
  | { readonly kind: 'COMPARTMENT'; readonly compartmentId: CompartmentId };

export interface AcceptSubstitutionOverReceiptInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly purchaseReceivingExceptionId: PurchaseReceivingExceptionId;
  readonly reason: string;
  readonly placement: AcceptedSubstitutionOverReceiptPlacement;
  readonly provenance: string;
}

export interface AcceptSubstitutionOverReceiptOutput {
  readonly purchaseReceivingExceptionResolutionId: PurchaseReceivingExceptionResolutionId;
  readonly receiptItemId: ReceiptItemId;
  readonly purchaseItemSubstitutionAllocationId: PurchaseItemSubstitutionAllocationId;
  readonly stockItemId: StockItemId;
  readonly inventoryMovementId: InventoryMovementId;
  readonly receiptItemInventoryEffectId: ReceiptItemInventoryEffectId;
  readonly acceptedExcessQuantity: ExactRational;
  readonly acceptedExcessUnitId: MeasurementUnitId;
}

export interface AcceptSubstitutionOverReceiptPersistenceInput {
  readonly commandId: CommandId;
  readonly purchaseReceivingExceptionId: PurchaseReceivingExceptionId;
  readonly reason: string;
  readonly placementKind: 'LOCATION' | 'COMPARTMENT';
  readonly storageLocationId: StorageLocationId | undefined;
  readonly compartmentId: CompartmentId | undefined;
  readonly provenance: string;
  readonly candidatePurchaseReceivingExceptionResolutionId: PurchaseReceivingExceptionResolutionId;
  readonly candidateReceiptItemId: ReceiptItemId;
  readonly candidatePurchaseItemSubstitutionAllocationId: PurchaseItemSubstitutionAllocationId;
  readonly candidateStockItemId: StockItemId;
  readonly candidateInventoryMovementId: InventoryMovementId;
  readonly candidateReceiptItemInventoryEffectId: ReceiptItemInventoryEffectId;
}

export interface HouseholdSubstitutionOverReceiptAcceptor {
  acceptSubstitutionOverReceipt(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: AcceptSubstitutionOverReceiptPersistenceInput,
  ): Promise<AcceptSubstitutionOverReceiptOutput>;
}

function canonicalText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError(`${label} is required`);
  }
  return value.trim();
}

function canonicalPlacement(value: AcceptedSubstitutionOverReceiptPlacement): {
  readonly placementKind: 'LOCATION' | 'COMPARTMENT';
  readonly storageLocationId: StorageLocationId | undefined;
  readonly compartmentId: CompartmentId | undefined;
} {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new InvalidInputError('substitution over-receipt acceptance placement is required');
  }
  if (value.kind === 'LOCATION') {
    if (!('storageLocationId' in value) || value.storageLocationId === undefined) {
      throw new InvalidInputError('storage location placement requires storageLocationId');
    }
    return { placementKind: 'LOCATION', storageLocationId: value.storageLocationId, compartmentId: undefined };
  }
  if (value.kind === 'COMPARTMENT') {
    if (!('compartmentId' in value) || value.compartmentId === undefined) {
      throw new InvalidInputError('compartment placement requires compartmentId');
    }
    return { placementKind: 'COMPARTMENT', storageLocationId: undefined, compartmentId: value.compartmentId };
  }
  throw new InvalidInputError('substitution over-receipt acceptance placement kind is invalid');
}

export class AcceptSubstitutionOverReceiptUseCase
  implements UseCase<AcceptSubstitutionOverReceiptInput, AcceptSubstitutionOverReceiptOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly acceptor: HouseholdSubstitutionOverReceiptAcceptor,
    private readonly resolutionIds: IdentifierGenerator<PurchaseReceivingExceptionResolutionId>,
    private readonly receiptItemIds: IdentifierGenerator<ReceiptItemId>,
    private readonly allocationIds: IdentifierGenerator<PurchaseItemSubstitutionAllocationId>,
    private readonly stockItemIds: IdentifierGenerator<StockItemId>,
    private readonly inventoryMovementIds: IdentifierGenerator<InventoryMovementId>,
    private readonly receiptInventoryEffectIds: IdentifierGenerator<ReceiptItemInventoryEffectId>,
  ) {}

  async execute(input: AcceptSubstitutionOverReceiptInput): Promise<AcceptSubstitutionOverReceiptOutput> {
    const reason = canonicalText(input.reason, 'substitution reason');
    const provenance = canonicalText(input.provenance, 'substitution over-receipt acceptance provenance');
    const placement = canonicalPlacement(input.placement);

    const candidatePurchaseReceivingExceptionResolutionId = this.resolutionIds.generate();
    const candidateReceiptItemId = this.receiptItemIds.generate();
    const candidatePurchaseItemSubstitutionAllocationId = this.allocationIds.generate();
    const candidateStockItemId = this.stockItemIds.generate();
    const candidateInventoryMovementId = this.inventoryMovementIds.generate();
    const candidateReceiptItemInventoryEffectId = this.receiptInventoryEffectIds.generate();

    let output: AcceptSubstitutionOverReceiptOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.acceptor.acceptSubstitutionOverReceipt(transaction, {
          commandId: input.commandId,
          purchaseReceivingExceptionId: input.purchaseReceivingExceptionId,
          reason,
          placementKind: placement.placementKind,
          storageLocationId: placement.storageLocationId,
          compartmentId: placement.compartmentId,
          provenance,
          candidatePurchaseReceivingExceptionResolutionId,
          candidateReceiptItemId,
          candidatePurchaseItemSubstitutionAllocationId,
          candidateStockItemId,
          candidateInventoryMovementId,
          candidateReceiptItemInventoryEffectId,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('substitution over-receipt acceptor did not return an outcome');
    }
    return output;
  }
}
