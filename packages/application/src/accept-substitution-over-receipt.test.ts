import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
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
  exactRational,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import {
  AcceptSubstitutionOverReceiptUseCase,
  type AcceptSubstitutionOverReceiptPersistenceInput,
  type HouseholdSubstitutionOverReceiptAcceptor,
} from './accept-substitution-over-receipt.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import type { IdentifierGenerator } from './index.js';

const HOUSEHOLD = HouseholdId('aa800001-0b06-4800-8800-000000000001');
const ACTOR = PrincipalId('aa800002-0b06-4800-8800-000000000002');
const COMMAND = CommandId('aa800003-0b06-4800-8800-000000000003');
const EXCEPTION = PurchaseReceivingExceptionId('aa800004-0b06-4800-8800-000000000004');
const RESOLUTION = PurchaseReceivingExceptionResolutionId('aa800005-0b06-4800-8800-000000000005');
const RECEIPT_ITEM = ReceiptItemId('aa800006-0b06-4800-8800-000000000006');
const ALLOCATION = PurchaseItemSubstitutionAllocationId('aa800007-0b06-4800-8800-000000000007');
const STOCK = StockItemId('aa800008-0b06-4800-8800-000000000008');
const MOVEMENT = InventoryMovementId('aa800009-0b06-4800-8800-000000000009');
const EFFECT = ReceiptItemInventoryEffectId('aa800010-0b06-4800-8800-000000000010');
const UNIT = MeasurementUnitId('aa800011-0b06-4800-8800-000000000011');
const LOCATION = StorageLocationId('aa800012-0b06-4800-8800-000000000012');

class OneId<T> implements IdentifierGenerator<T> {
  constructor(private readonly value: T) {}
  generate(): T { return this.value; }
}

class Transactions implements HouseholdProcurementAdministrationTransactionManager {
  calls = 0;
  async withHouseholdProcurementAdministrationTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (transaction: HouseholdProcurementAdministrationTransaction) => Promise<T>,
  ): Promise<T> {
    this.calls += 1;
    assert.equal(principalId, ACTOR);
    assert.equal(householdId, HOUSEHOLD);
    return operation({
      kind: 'fridge-transaction',
      principalId,
      householdId,
      membershipId: 'aa800013-0b06-4800-8800-000000000013',
      householdRoleCode: 'ADMIN',
      procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
    } as unknown as HouseholdProcurementAdministrationTransaction);
  }
}

class Acceptor implements HouseholdSubstitutionOverReceiptAcceptor {
  seen: AcceptSubstitutionOverReceiptPersistenceInput | undefined;
  async acceptSubstitutionOverReceipt(
    _transaction: HouseholdProcurementAdministrationTransaction,
    input: AcceptSubstitutionOverReceiptPersistenceInput,
  ) {
    this.seen = input;
    return {
      purchaseReceivingExceptionResolutionId: RESOLUTION,
      receiptItemId: RECEIPT_ITEM,
      purchaseItemSubstitutionAllocationId: ALLOCATION,
      stockItemId: STOCK,
      inventoryMovementId: MOVEMENT,
      receiptItemInventoryEffectId: EFFECT,
      acceptedExcessQuantity: exactRational(1n, 2n),
      acceptedExcessUnitId: UNIT,
    };
  }
}

test('canonicalizes reason/provenance and delegates result-only identities', async () => {
  const transactions = new Transactions();
  const acceptor = new Acceptor();
  const useCase = new AcceptSubstitutionOverReceiptUseCase(
    transactions,
    acceptor,
    new OneId(RESOLUTION),
    new OneId(RECEIPT_ITEM),
    new OneId(ALLOCATION),
    new OneId(STOCK),
    new OneId(MOVEMENT),
    new OneId(EFFECT),
  );

  const result = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    purchaseReceivingExceptionId: EXCEPTION,
    reason: '  supplier substituted larger delivered quantity  ',
    placement: { kind: 'LOCATION', storageLocationId: LOCATION },
    provenance: '  receiving acceptance station  ',
  });

  assert.equal(result.purchaseReceivingExceptionResolutionId, RESOLUTION);
  assert.deepEqual(acceptor.seen, {
    commandId: COMMAND,
    purchaseReceivingExceptionId: EXCEPTION,
    reason: 'supplier substituted larger delivered quantity',
    placementKind: 'LOCATION',
    storageLocationId: LOCATION,
    compartmentId: undefined,
    provenance: 'receiving acceptance station',
    candidatePurchaseReceivingExceptionResolutionId: RESOLUTION,
    candidateReceiptItemId: RECEIPT_ITEM,
    candidatePurchaseItemSubstitutionAllocationId: ALLOCATION,
    candidateStockItemId: STOCK,
    candidateInventoryMovementId: MOVEMENT,
    candidateReceiptItemInventoryEffectId: EFFECT,
  });
});

test('blank substitution reason is rejected before authority acquisition', async () => {
  const transactions = new Transactions();
  const useCase = new AcceptSubstitutionOverReceiptUseCase(
    transactions,
    new Acceptor(),
    new OneId(RESOLUTION), new OneId(RECEIPT_ITEM), new OneId(ALLOCATION),
    new OneId(STOCK), new OneId(MOVEMENT), new OneId(EFFECT),
  );
  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: EXCEPTION,
      reason: '   ',
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'station',
    }),
    InvalidInputError,
  );
  assert.equal(transactions.calls, 0);
});

test('blank provenance is rejected before authority acquisition', async () => {
  const transactions = new Transactions();
  const useCase = new AcceptSubstitutionOverReceiptUseCase(
    transactions,
    new Acceptor(),
    new OneId(RESOLUTION), new OneId(RECEIPT_ITEM), new OneId(ALLOCATION),
    new OneId(STOCK), new OneId(MOVEMENT), new OneId(EFFECT),
  );
  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: EXCEPTION,
      reason: 'valid substitution',
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: ' ',
    }),
    InvalidInputError,
  );
  assert.equal(transactions.calls, 0);
});
