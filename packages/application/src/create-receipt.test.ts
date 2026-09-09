import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  PrincipalId,
  PurchaseId,
  ReceiptId,
  type HouseholdId as HouseholdIdType,
  type PrincipalId as PrincipalIdType,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import {
  CreateReceiptUseCase,
  type CreateReceiptPersistenceInput,
  type HouseholdReceiptWriter,
} from './create-receipt.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import type { IdentifierGenerator } from './index.js';

const COMMAND = CommandId('e7010101-0b06-4701-8706-000000000001');
const ACTOR = PrincipalId('e7020202-0b06-4702-8706-000000000002');
const HOUSEHOLD = HouseholdId('e7030303-0b06-4703-8706-000000000003');
const PURCHASE = PurchaseId('e7040404-0b06-4704-8706-000000000004');
const RECEIPT = ReceiptId('e7050505-0b06-4705-8706-000000000005');

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
        membershipId: 'e7060606-0b06-4706-8706-000000000006',
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

test('CreateReceipt preserves optional Purchase link and canonical provenance', async () => {
  let observed: CreateReceiptPersistenceInput | undefined;
  const writer: HouseholdReceiptWriter = {
    async createReceipt(_transaction, input) {
      observed = input;
      return { receiptId: RECEIPT };
    },
  };
  const useCase = new CreateReceiptUseCase(
    transactionManager(),
    writer,
    fixedGenerator(RECEIPT),
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    purchaseId: PURCHASE,
    provenance: '  MANUAL_RECEIVING  ',
  });

  assert.equal(output.receiptId, RECEIPT);
  assert.deepEqual(observed, {
    commandId: COMMAND,
    candidateReceiptId: RECEIPT,
    purchaseId: PURCHASE,
    provenance: 'MANUAL_RECEIVING',
  });
});

test('CreateReceipt permits a Receipt without Purchase when provenance is explicit', async () => {
  let observed: CreateReceiptPersistenceInput | undefined;
  const writer: HouseholdReceiptWriter = {
    async createReceipt(_transaction, input) {
      observed = input;
      return { receiptId: RECEIPT };
    },
  };
  const useCase = new CreateReceiptUseCase(
    transactionManager(),
    writer,
    fixedGenerator(RECEIPT),
  );

  await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    provenance: 'DIRECT_PHYSICAL_RECEIPT',
  });

  assert.equal(observed?.purchaseId, undefined);
  assert.equal(observed?.provenance, 'DIRECT_PHYSICAL_RECEIPT');
});

test('CreateReceipt rejects blank provenance before authority acquisition', async () => {
  let authorityCalled = false;
  const writer: HouseholdReceiptWriter = {
    async createReceipt() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreateReceiptUseCase(
    transactionManager(() => {
      authorityCalled = true;
    }),
    writer,
    fixedGenerator(RECEIPT),
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      provenance: '   ',
    }),
    InvalidInputError,
  );
  assert.equal(authorityCalled, false);
});
