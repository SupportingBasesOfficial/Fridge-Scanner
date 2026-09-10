import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CompartmentId,
  HouseholdId,
  InventoryMovementId,
  PrincipalId,
  PurchaseItemId,
  PurchaseItemReceiptAllocationId,
  ReceiptItemId,
  ReceiptItemIntentId,
  ReceiptItemInventoryEffectId,
  StockItemId,
  StorageLocationId,
  type HouseholdId as HouseholdIdType,
  type PrincipalId as PrincipalIdType,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import type { IdentifierGenerator } from './index.js';
import {
  MaterializeOrdinaryReceiptItemUseCase,
  type HouseholdOrdinaryReceiptItemMaterializer,
  type MaterializeOrdinaryReceiptItemPersistenceInput,
} from './materialize-ordinary-receipt-item.js';

const COMMAND = CommandId('a7300001-0b06-4730-8730-000000000001');
const ACTOR = PrincipalId('a7300002-0b06-4730-8730-000000000002');
const HOUSEHOLD = HouseholdId('a7300003-0b06-4730-8730-000000000003');
const INTENT = ReceiptItemIntentId('a7300004-0b06-4730-8730-000000000004');
const PURCHASE_ITEM = PurchaseItemId('a7300005-0b06-4730-8730-000000000005');
const LOCATION = StorageLocationId('a7300006-0b06-4730-8730-000000000006');
const COMPARTMENT = CompartmentId('a7300007-0b06-4730-8730-000000000007');
const RECEIPT_ITEM = ReceiptItemId('a7300008-0b06-4730-8730-000000000008');
const ALLOCATION = PurchaseItemReceiptAllocationId('a7300009-0b06-4730-8730-000000000009');
const STOCK = StockItemId('a7300010-0b06-4730-8730-000000000010');
const MOVEMENT = InventoryMovementId('a7300011-0b06-4730-8730-000000000011');
const EFFECT = ReceiptItemInventoryEffectId('a7300012-0b06-4730-8730-000000000012');

function fixed<T>(value: T): IdentifierGenerator<T> {
  return { generate: () => value };
}

function transactions(onAcquire?: () => void): HouseholdProcurementAdministrationTransactionManager {
  return {
    async withHouseholdProcurementAdministrationTransaction<T>(
      principalId: PrincipalIdType,
      householdId: HouseholdIdType,
      operation: (transaction: HouseholdProcurementAdministrationTransaction) => Promise<T>,
    ): Promise<T> {
      onAcquire?.();
      return operation({
        kind: 'fridge-transaction',
        principalId,
        householdId,
        membershipId: 'a7300013-0b06-4730-8730-000000000013',
        householdRoleCode: 'BE06_PROCUREMENT_ADMIN',
        procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
      } as unknown as HouseholdProcurementAdministrationTransaction);
    },
  };
}

function useCase(
  materializer: HouseholdOrdinaryReceiptItemMaterializer,
  onAcquire?: () => void,
): MaterializeOrdinaryReceiptItemUseCase {
  return new MaterializeOrdinaryReceiptItemUseCase(
    transactions(onAcquire),
    materializer,
    fixed(RECEIPT_ITEM),
    fixed(ALLOCATION),
    fixed(STOCK),
    fixed(MOVEMENT),
    fixed(EFFECT),
  );
}

test('ordinary materialization delegates generated result identities and canonical location placement', async () => {
  let observed: MaterializeOrdinaryReceiptItemPersistenceInput | undefined;
  const materializer: HouseholdOrdinaryReceiptItemMaterializer = {
    async materializeOrdinaryReceiptItem(_transaction, input) {
      observed = input;
      return {
        receiptItemId: RECEIPT_ITEM,
        purchaseItemReceiptAllocationId: ALLOCATION,
        stockItemId: STOCK,
        inventoryMovementId: MOVEMENT,
        receiptItemInventoryEffectId: EFFECT,
      };
    },
  };

  const output = await useCase(materializer).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    receiptItemIntentId: INTENT,
    purchaseItemId: PURCHASE_ITEM,
    placement: { kind: 'LOCATION', storageLocationId: LOCATION },
    provenance: '  receiving station scan  ',
  });

  assert.deepEqual(output, {
    receiptItemId: RECEIPT_ITEM,
    purchaseItemReceiptAllocationId: ALLOCATION,
    stockItemId: STOCK,
    inventoryMovementId: MOVEMENT,
    receiptItemInventoryEffectId: EFFECT,
  });
  assert.equal(observed?.placementKind, 'LOCATION');
  assert.equal(observed?.storageLocationId, LOCATION);
  assert.equal(observed?.compartmentId, undefined);
  assert.equal(observed?.provenance, 'receiving station scan');
  assert.equal(observed?.candidateReceiptItemId, RECEIPT_ITEM);
  assert.equal(observed?.candidatePurchaseItemReceiptAllocationId, ALLOCATION);
  assert.equal(observed?.candidateStockItemId, STOCK);
  assert.equal(observed?.candidateInventoryMovementId, MOVEMENT);
  assert.equal(observed?.candidateReceiptItemInventoryEffectId, EFFECT);
});

test('ordinary materialization canonicalizes compartment placement without storage-location ambiguity', async () => {
  let observed: MaterializeOrdinaryReceiptItemPersistenceInput | undefined;
  const materializer: HouseholdOrdinaryReceiptItemMaterializer = {
    async materializeOrdinaryReceiptItem(_transaction, input) {
      observed = input;
      return {
        receiptItemId: RECEIPT_ITEM,
        purchaseItemReceiptAllocationId: ALLOCATION,
        stockItemId: STOCK,
        inventoryMovementId: MOVEMENT,
        receiptItemInventoryEffectId: EFFECT,
      };
    },
  };

  await useCase(materializer).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    receiptItemIntentId: INTENT,
    purchaseItemId: PURCHASE_ITEM,
    placement: { kind: 'COMPARTMENT', compartmentId: COMPARTMENT },
    provenance: 'manual receiving',
  });

  assert.equal(observed?.placementKind, 'COMPARTMENT');
  assert.equal(observed?.storageLocationId, undefined);
  assert.equal(observed?.compartmentId, COMPARTMENT);
});

test('blank provenance is rejected before procurement authority acquisition', async () => {
  let acquired = false;
  const materializer: HouseholdOrdinaryReceiptItemMaterializer = {
    async materializeOrdinaryReceiptItem() {
      throw new Error('must not run');
    },
  };

  await assert.rejects(
    useCase(materializer, () => {
      acquired = true;
    }).execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      receiptItemIntentId: INTENT,
      purchaseItemId: PURCHASE_ITEM,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: '   ',
    }),
    InvalidInputError,
  );
  assert.equal(acquired, false);
});
