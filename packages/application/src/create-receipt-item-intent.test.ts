import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  MeasurementUnitId,
  PrincipalId,
  ProductId,
  ReceiptId,
  ReceiptItemIntentId,
  exactRational,
  type HouseholdId as HouseholdIdType,
  type PrincipalId as PrincipalIdType,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import {
  CreateReceiptItemIntentUseCase,
  type CreateReceiptItemIntentPersistenceInput,
  type HouseholdReceiptItemIntentWriter,
} from './create-receipt-item-intent.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import type { IdentifierGenerator } from './index.js';

const COMMAND = CommandId('e1010101-0b06-4601-8606-000000000001');
const ACTOR = PrincipalId('e1020202-0b06-4602-8606-000000000002');
const HOUSEHOLD = HouseholdId('e1030303-0b06-4603-8606-000000000003');
const RECEIPT = ReceiptId('e1040404-0b06-4604-8606-000000000004');
const PRODUCT = ProductId('e1050505-0b06-4605-8606-000000000005');
const UNIT = MeasurementUnitId('e1060606-0b06-4606-8606-000000000006');
const INTENT = ReceiptItemIntentId('e1070707-0b06-4607-8606-000000000007');

function transactionManager(
  observer?: (transaction: HouseholdProcurementAdministrationTransaction) => void,
): HouseholdProcurementAdministrationTransactionManager {
  return {
    async withHouseholdProcurementAdministrationTransaction<T>(
      principalId: PrincipalIdType,
      householdId: HouseholdIdType,
      operation: (transaction: HouseholdProcurementAdministrationTransaction) => Promise<T>,
    ): Promise<T> {
      const transaction = {
        kind: 'fridge-transaction',
        principalId,
        householdId,
        membershipId: 'e1080808-0b06-4608-8606-000000000008',
        householdRoleCode: 'BE06_PROCUREMENT_ADMIN',
        procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
      } as unknown as HouseholdProcurementAdministrationTransaction;
      observer?.(transaction);
      return operation(transaction);
    },
  };
}

function fixedGenerator<T>(value: T): IdentifierGenerator<T> {
  return { generate: () => value };
}

test('CreateReceiptItemIntent preserves exact quantity and canonical provenance', async () => {
  let observed: CreateReceiptItemIntentPersistenceInput | undefined;
  const writer: HouseholdReceiptItemIntentWriter = {
    async createReceiptItemIntent(_transaction, input) {
      observed = input;
      return { receiptItemIntentId: INTENT };
    },
  };
  const useCase = new CreateReceiptItemIntentUseCase(
    transactionManager(),
    writer,
    fixedGenerator(INTENT),
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    receiptId: RECEIPT,
    productId: PRODUCT,
    quantity: exactRational(3n, 2n),
    measurementUnitId: UNIT,
    provenance: '  scanner intake  ',
  });

  assert.equal(output.receiptItemIntentId, INTENT);
  assert.deepEqual(observed, {
    commandId: COMMAND,
    candidateReceiptItemIntentId: INTENT,
    receiptId: RECEIPT,
    productId: PRODUCT,
    quantityNumerator: '3',
    quantityDenominator: '2',
    measurementUnitId: UNIT,
    provenance: 'scanner intake',
  });
});

test('CreateReceiptItemIntent rejects blank provenance before authority acquisition', async () => {
  let authorityCalled = false;
  const writer: HouseholdReceiptItemIntentWriter = {
    async createReceiptItemIntent() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreateReceiptItemIntentUseCase(
    transactionManager(() => { authorityCalled = true; }),
    writer,
    fixedGenerator(INTENT),
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      receiptId: RECEIPT,
      productId: PRODUCT,
      quantity: exactRational(1n, 1n),
      measurementUnitId: UNIT,
      provenance: '   ',
    }),
    InvalidInputError,
  );
  assert.equal(authorityCalled, false);
});

test('CreateReceiptItemIntent rejects forged noncanonical quantity before authority acquisition', async () => {
  let authorityCalled = false;
  const writer: HouseholdReceiptItemIntentWriter = {
    async createReceiptItemIntent() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreateReceiptItemIntentUseCase(
    transactionManager(() => { authorityCalled = true; }),
    writer,
    fixedGenerator(INTENT),
  );
  const forged = { numerator: 2n, denominator: 2n } as unknown as ReturnType<typeof exactRational>;

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      receiptId: RECEIPT,
      productId: PRODUCT,
      quantity: forged,
      measurementUnitId: UNIT,
      provenance: 'scanner intake',
    }),
    InvalidInputError,
  );
  assert.equal(authorityCalled, false);
});
