import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  InventoryMovementId,
  PrincipalId,
  PurchaseItemId,
  PurchaseItemSubstitutionAllocationId,
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
  MaterializeSubstitutionReceiptItemUseCase,
  type HouseholdSubstitutionReceiptItemMaterializer,
  type MaterializeSubstitutionReceiptItemPersistenceInput,
} from './materialize-substitution-receipt-item.js';

const COMMAND = CommandId('b7400001-0b06-4740-8740-000000000001');
const ACTOR = PrincipalId('b7400002-0b06-4740-8740-000000000002');
const HOUSEHOLD = HouseholdId('b7400003-0b06-4740-8740-000000000003');
const INTENT = ReceiptItemIntentId('b7400004-0b06-4740-8740-000000000004');
const PURCHASE_ITEM = PurchaseItemId('b7400005-0b06-4740-8740-000000000005');
const LOCATION = StorageLocationId('b7400006-0b06-4740-8740-000000000006');
const RECEIPT_ITEM = ReceiptItemId('b7400007-0b06-4740-8740-000000000007');
const ALLOCATION = PurchaseItemSubstitutionAllocationId('b7400008-0b06-4740-8740-000000000008');
const STOCK = StockItemId('b7400009-0b06-4740-8740-000000000009');
const MOVEMENT = InventoryMovementId('b7400010-0b06-4740-8740-000000000010');
const EFFECT = ReceiptItemInventoryEffectId('b7400011-0b06-4740-8740-000000000011');

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
        membershipId: 'b7400012-0b06-4740-8740-000000000012',
        householdRoleCode: 'BE06_PROCUREMENT_ADMIN',
        procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
      } as unknown as HouseholdProcurementAdministrationTransaction);
    },
  };
}

function useCase(
  materializer: HouseholdSubstitutionReceiptItemMaterializer,
  onAcquire?: () => void,
): MaterializeSubstitutionReceiptItemUseCase {
  return new MaterializeSubstitutionReceiptItemUseCase(
    transactions(onAcquire),
    materializer,
    fixed(RECEIPT_ITEM),
    fixed(ALLOCATION),
    fixed(STOCK),
    fixed(MOVEMENT),
    fixed(EFFECT),
  );
}

test('substitution materialization canonicalizes reason/provenance and delegates generated physical identities', async () => {
  let observed: MaterializeSubstitutionReceiptItemPersistenceInput | undefined;
  const materializer: HouseholdSubstitutionReceiptItemMaterializer = {
    async materializeSubstitutionReceiptItem(_transaction, input) {
      observed = input;
      return {
        receiptItemId: RECEIPT_ITEM,
        purchaseItemSubstitutionAllocationId: ALLOCATION,
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
    reason: '  store substituted requested item  ',
    placement: { kind: 'LOCATION', storageLocationId: LOCATION },
    provenance: '  receiving station scan  ',
  });

  assert.deepEqual(output, {
    receiptItemId: RECEIPT_ITEM,
    purchaseItemSubstitutionAllocationId: ALLOCATION,
    stockItemId: STOCK,
    inventoryMovementId: MOVEMENT,
    receiptItemInventoryEffectId: EFFECT,
  });
  assert.equal(observed?.reason, 'store substituted requested item');
  assert.equal(observed?.provenance, 'receiving station scan');
  assert.equal(observed?.placementKind, 'LOCATION');
  assert.equal(observed?.storageLocationId, LOCATION);
  assert.equal(observed?.candidatePurchaseItemSubstitutionAllocationId, ALLOCATION);
});

test('blank substitution reason is rejected before authority acquisition', async () => {
  let acquired = false;
  const materializer: HouseholdSubstitutionReceiptItemMaterializer = {
    async materializeSubstitutionReceiptItem() {
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
      reason: '   ',
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'scan',
    }),
    InvalidInputError,
  );
  assert.equal(acquired, false);
});
