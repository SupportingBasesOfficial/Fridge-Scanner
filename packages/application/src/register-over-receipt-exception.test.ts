import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  MeasurementConversionEvidenceId,
  MeasurementUnitId,
  PrincipalId,
  PurchaseItemId,
  PurchaseReceivingExceptionId,
  ReceiptItemIntentId,
  exactRational,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import {
  RegisterOverReceiptExceptionUseCase,
  type HouseholdOverReceiptExceptionRegistrar,
  type RegisterOverReceiptExceptionPersistenceInput,
} from './register-over-receipt-exception.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import type { IdentifierGenerator } from './index.js';

const householdId = HouseholdId('a7510001-0b06-4751-8751-000000000001');
const actorPrincipalId = PrincipalId('a7510002-0b06-4751-8751-000000000002');
const commandId = CommandId('a7510003-0b06-4751-8751-000000000003');
const intentId = ReceiptItemIntentId('a7510004-0b06-4751-8751-000000000004');
const purchaseItemId = PurchaseItemId('a7510005-0b06-4751-8751-000000000005');
const evidenceId = MeasurementConversionEvidenceId('a7510006-0b06-4751-8751-000000000006');
const exceptionId = PurchaseReceivingExceptionId('a7510007-0b06-4751-8751-000000000007');
const unitId = MeasurementUnitId('a7510008-0b06-4751-8751-000000000008');

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
      membershipId: 'a7510009-0b06-4751-8751-000000000009',
      householdRoleCode: 'ADMIN',
      procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
    } as unknown as HouseholdProcurementAdministrationTransaction);
  }
}

class Registrar implements HouseholdOverReceiptExceptionRegistrar {
  seen: RegisterOverReceiptExceptionPersistenceInput | undefined;
  async registerOverReceiptException(
    _transaction: HouseholdProcurementAdministrationTransaction,
    input: RegisterOverReceiptExceptionPersistenceInput,
  ) {
    this.seen = input;
    return {
      purchaseReceivingExceptionId: exceptionId,
      discrepantQuantity: exactRational(1n, 2n),
      discrepantUnitId: unitId,
    };
  }
}

test('canonicalizes reason/provenance and preserves exact command semantics', async () => {
  const transactions = new Transactions();
  const registrar = new Registrar();
  const useCase = new RegisterOverReceiptExceptionUseCase(
    transactions,
    registrar,
    new OneId(exceptionId),
  );

  const output = await useCase.execute({
    commandId,
    actorPrincipalId,
    householdId,
    receiptItemIntentId: intentId,
    purchaseItemId,
    allocationConversionEvidenceId: evidenceId,
    reason: '  delivered above ordered quantity  ',
    provenance: '  receiving station observation  ',
  });

  assert.deepEqual(output, {
    purchaseReceivingExceptionId: exceptionId,
    discrepantQuantity: exactRational(1n, 2n),
    discrepantUnitId: unitId,
  });
  assert.deepEqual(registrar.seen, {
    commandId,
    receiptItemIntentId: intentId,
    purchaseItemId,
    allocationConversionEvidenceId: evidenceId,
    reason: 'delivered above ordered quantity',
    provenance: 'receiving station observation',
    candidatePurchaseReceivingExceptionId: exceptionId,
  });
});

test('blank reason is rejected before authority acquisition and id generation', async () => {
  const transactions = new Transactions();
  let generated = false;
  const useCase = new RegisterOverReceiptExceptionUseCase(
    transactions,
    new Registrar(),
    { generate() { generated = true; return exceptionId; } },
  );

  await assert.rejects(
    useCase.execute({
      commandId,
      actorPrincipalId,
      householdId,
      receiptItemIntentId: intentId,
      purchaseItemId,
      reason: '   ',
      provenance: 'scanner observation',
    }),
    InvalidInputError,
  );
  assert.equal(transactions.calls, 0);
  assert.equal(generated, false);
});

test('blank provenance is rejected before authority acquisition', async () => {
  const transactions = new Transactions();
  const useCase = new RegisterOverReceiptExceptionUseCase(
    transactions,
    new Registrar(),
    new OneId(exceptionId),
  );

  await assert.rejects(
    useCase.execute({
      commandId,
      actorPrincipalId,
      householdId,
      receiptItemIntentId: intentId,
      purchaseItemId,
      reason: 'over delivery',
      provenance: '',
    }),
    InvalidInputError,
  );
  assert.equal(transactions.calls, 0);
});
