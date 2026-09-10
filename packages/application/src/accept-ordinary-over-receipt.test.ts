import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CompartmentId,
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
  exactRational,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import {
  AcceptOrdinaryOverReceiptUseCase,
  type AcceptOrdinaryOverReceiptPersistenceInput,
  type HouseholdOrdinaryOverReceiptAcceptor,
} from './accept-ordinary-over-receipt.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import type { IdentifierGenerator } from './index.js';

const householdId = HouseholdId('a7810001-0b06-4781-8781-000000000001');
const actorPrincipalId = PrincipalId('a7810002-0b06-4781-8781-000000000002');
const commandId = CommandId('a7810003-0b06-4781-8781-000000000003');
const exceptionId = PurchaseReceivingExceptionId('a7810004-0b06-4781-8781-000000000004');
const resolutionId = PurchaseReceivingExceptionResolutionId('a7810005-0b06-4781-8781-000000000005');
const receiptItemId = ReceiptItemId('a7810006-0b06-4781-8781-000000000006');
const allocationId = PurchaseItemReceiptAllocationId('a7810007-0b06-4781-8781-000000000007');
const stockItemId = StockItemId('a7810008-0b06-4781-8781-000000000008');
const movementId = InventoryMovementId('a7810009-0b06-4781-8781-000000000009');
const effectId = ReceiptItemInventoryEffectId('a7810010-0b06-4781-8781-000000000010');
const unitId = MeasurementUnitId('a7810011-0b06-4781-8781-000000000011');
const locationId = StorageLocationId('a7810012-0b06-4781-8781-000000000012');
const compartmentId = CompartmentId('a7810013-0b06-4781-8781-000000000013');

class OneId<T> implements IdentifierGenerator<T> {
  constructor(private readonly value: T) {}
  generate(): T { return this.value; }
}

class Transactions implements HouseholdProcurementAdministrationTransactionManager {
  calls = 0;
  async withHouseholdProcurementAdministrationTransaction<T>(
    principalId: PrincipalId,
    household: HouseholdId,
    operation: (transaction: HouseholdProcurementAdministrationTransaction) => Promise<T>,
  ): Promise<T> {
    this.calls += 1;
    assert.equal(principalId, actorPrincipalId);
    assert.equal(household, householdId);
    return operation({
      kind: 'fridge-transaction',
      principalId,
      householdId: household,
      membershipId: 'a7810014-0b06-4781-8781-000000000014',
      householdRoleCode: 'ADMIN',
      procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
    } as unknown as HouseholdProcurementAdministrationTransaction);
  }
}

class Acceptor implements HouseholdOrdinaryOverReceiptAcceptor {
  seen: AcceptOrdinaryOverReceiptPersistenceInput | undefined;
  async acceptOrdinaryOverReceipt(
    _transaction: HouseholdProcurementAdministrationTransaction,
    input: AcceptOrdinaryOverReceiptPersistenceInput,
  ) {
    this.seen = input;
    return {
      purchaseReceivingExceptionResolutionId: resolutionId,
      receiptItemId,
      purchaseItemReceiptAllocationId: allocationId,
      stockItemId,
      inventoryMovementId: movementId,
      receiptItemInventoryEffectId: effectId,
      acceptedExcessQuantity: exactRational(1n, 2n),
      acceptedExcessUnitId: unitId,
    };
  }
}

function useCase(transactions: Transactions, acceptor: Acceptor) {
  return new AcceptOrdinaryOverReceiptUseCase(
    transactions,
    acceptor,
    new OneId(resolutionId),
    new OneId(receiptItemId),
    new OneId(allocationId),
    new OneId(stockItemId),
    new OneId(movementId),
    new OneId(effectId),
  );
}

test('canonicalizes LOCATION acceptance and delegates generated result identities', async () => {
  const transactions = new Transactions();
  const acceptor = new Acceptor();

  const output = await useCase(transactions, acceptor).execute({
    commandId,
    actorPrincipalId,
    householdId,
    purchaseReceivingExceptionId: exceptionId,
    placement: { kind: 'LOCATION', storageLocationId: locationId },
    provenance: '  admin accepted supplier over-delivery  ',
  });

  assert.deepEqual(output, {
    purchaseReceivingExceptionResolutionId: resolutionId,
    receiptItemId,
    purchaseItemReceiptAllocationId: allocationId,
    stockItemId,
    inventoryMovementId: movementId,
    receiptItemInventoryEffectId: effectId,
    acceptedExcessQuantity: exactRational(1n, 2n),
    acceptedExcessUnitId: unitId,
  });
  assert.deepEqual(acceptor.seen, {
    commandId,
    purchaseReceivingExceptionId: exceptionId,
    placementKind: 'LOCATION',
    storageLocationId: locationId,
    compartmentId: undefined,
    provenance: 'admin accepted supplier over-delivery',
    candidatePurchaseReceivingExceptionResolutionId: resolutionId,
    candidateReceiptItemId: receiptItemId,
    candidatePurchaseItemReceiptAllocationId: allocationId,
    candidateStockItemId: stockItemId,
    candidateInventoryMovementId: movementId,
    candidateReceiptItemInventoryEffectId: effectId,
  });
});

test('canonicalizes COMPARTMENT acceptance without inventing a StorageLocation input', async () => {
  const transactions = new Transactions();
  const acceptor = new Acceptor();

  await useCase(transactions, acceptor).execute({
    commandId,
    actorPrincipalId,
    householdId,
    purchaseReceivingExceptionId: exceptionId,
    placement: { kind: 'COMPARTMENT', compartmentId },
    provenance: 'accepted at receiving station',
  });

  assert.equal(acceptor.seen?.placementKind, 'COMPARTMENT');
  assert.equal(acceptor.seen?.storageLocationId, undefined);
  assert.equal(acceptor.seen?.compartmentId, compartmentId);
});

test('blank provenance is rejected before authority acquisition and ID generation', async () => {
  const transactions = new Transactions();
  let generated = false;
  const acceptor = new Acceptor();
  const candidateGenerator: IdentifierGenerator<PurchaseReceivingExceptionResolutionId> = {
    generate() {
      generated = true;
      return resolutionId;
    },
  };
  const boundary = new AcceptOrdinaryOverReceiptUseCase(
    transactions,
    acceptor,
    candidateGenerator,
    new OneId(receiptItemId),
    new OneId(allocationId),
    new OneId(stockItemId),
    new OneId(movementId),
    new OneId(effectId),
  );

  await assert.rejects(
    boundary.execute({
      commandId,
      actorPrincipalId,
      householdId,
      purchaseReceivingExceptionId: exceptionId,
      placement: { kind: 'LOCATION', storageLocationId: locationId },
      provenance: '   ',
    }),
    InvalidInputError,
  );
  assert.equal(transactions.calls, 0);
  assert.equal(generated, false);
});
