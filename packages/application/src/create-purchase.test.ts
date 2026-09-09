import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  MeasurementUnitId,
  PrincipalId,
  ProductId,
  PurchaseId,
  PurchaseItemId,
  exactRational,
  type HouseholdId as HouseholdIdType,
  type PrincipalId as PrincipalIdType,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import {
  CreatePurchaseUseCase,
  type CreatePurchasePersistenceInput,
  type HouseholdPurchaseWriter,
} from './create-purchase.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import type { IdentifierGenerator } from './index.js';

const COMMAND = CommandId('d6010101-0b06-4601-8606-000000000001');
const ACTOR = PrincipalId('d6020202-0b06-4602-8606-000000000002');
const HOUSEHOLD = HouseholdId('d6030303-0b06-4603-8606-000000000003');
const PRODUCT = ProductId('d6040404-0b06-4604-8606-000000000004');
const UNIT = MeasurementUnitId('d6050505-0b06-4605-8606-000000000005');
const PURCHASE = PurchaseId('d6060606-0b06-4606-8606-000000000006');
const ITEM = PurchaseItemId('d6070707-0b06-4607-8606-000000000007');

function transactionManager(
  operationObserver?: (transaction: HouseholdProcurementAdministrationTransaction) => void,
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
        membershipId: 'd6080808-0b06-4608-8606-000000000008',
        householdRoleCode: 'BE06_PROCUREMENT_ADMIN',
        procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
      } as unknown as HouseholdProcurementAdministrationTransaction;
      operationObserver?.(transaction);
      return operation(transaction);
    },
  };
}

function fixedGenerator<T>(value: T): IdentifierGenerator<T> {
  return { generate: () => value };
}

test('CreatePurchase preserves exact rational quantity and ordered generated identities', async () => {
  let observed: CreatePurchasePersistenceInput | undefined;
  const writer: HouseholdPurchaseWriter = {
    async createPurchase(_transaction, input) {
      observed = input;
      return { purchaseId: PURCHASE, purchaseItemIds: [ITEM] };
    },
  };
  const useCase = new CreatePurchaseUseCase(
    transactionManager(),
    writer,
    fixedGenerator(PURCHASE),
    fixedGenerator(ITEM),
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    transactionCurrencyCode: 'BRL',
    items: [
      {
        productId: PRODUCT,
        quantity: exactRational(3n, 2n),
        measurementUnitId: UNIT,
      },
    ],
  });

  assert.equal(output.purchaseId, PURCHASE);
  assert.deepEqual(output.purchaseItemIds, [ITEM]);
  assert.equal(observed?.transactionCurrencyCode, 'BRL');
  assert.deepEqual(observed?.items, [
    {
      candidatePurchaseItemId: ITEM,
      productId: PRODUCT,
      quantityNumerator: '3',
      quantityDenominator: '2',
      measurementUnitId: UNIT,
    },
  ]);
});

test('CreatePurchase rejects empty purchases before authority acquisition', async () => {
  let authorityCalled = false;
  const writer: HouseholdPurchaseWriter = {
    async createPurchase() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreatePurchaseUseCase(
    transactionManager(() => {
      authorityCalled = true;
    }),
    writer,
    fixedGenerator(PURCHASE),
    fixedGenerator(ITEM),
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      transactionCurrencyCode: 'BRL',
      items: [],
    }),
    InvalidInputError,
  );
  assert.equal(authorityCalled, false);
});

test('CreatePurchase rejects malformed currency before authority acquisition', async () => {
  let authorityCalled = false;
  const writer: HouseholdPurchaseWriter = {
    async createPurchase() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreatePurchaseUseCase(
    transactionManager(() => {
      authorityCalled = true;
    }),
    writer,
    fixedGenerator(PURCHASE),
    fixedGenerator(ITEM),
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      transactionCurrencyCode: 'brl',
      items: [{ productId: PRODUCT, quantity: exactRational(1n, 1n), measurementUnitId: UNIT }],
    }),
    InvalidInputError,
  );
  assert.equal(authorityCalled, false);
});

test('CreatePurchase rejects forged noncanonical quantity before authority acquisition', async () => {
  let authorityCalled = false;
  const writer: HouseholdPurchaseWriter = {
    async createPurchase() {
      throw new Error('must not run');
    },
  };
  const useCase = new CreatePurchaseUseCase(
    transactionManager(() => {
      authorityCalled = true;
    }),
    writer,
    fixedGenerator(PURCHASE),
    fixedGenerator(ITEM),
  );

  const forged = { numerator: 2n, denominator: 2n } as unknown as ReturnType<typeof exactRational>;
  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      transactionCurrencyCode: 'BRL',
      items: [{ productId: PRODUCT, quantity: forged, measurementUnitId: UNIT }],
    }),
    InvalidInputError,
  );
  assert.equal(authorityCalled, false);
});
