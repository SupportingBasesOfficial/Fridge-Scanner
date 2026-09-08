import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  ProductId,
} from '@fridge/domain';
import {
  CreateHouseholdProductUseCase,
  InvalidInputError,
  type CreateHouseholdProductPersistenceInput,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCatalogAdministrationTransactionManager,
  type HouseholdProductWriter,
} from './index.js';

const COMMAND = CommandId('c5b40101-0b05-4b01-8b05-000000000001');
const ACTOR = PrincipalId('c5b40202-0b05-4b02-8b05-000000000002');
const HOUSEHOLD = HouseholdId('c5b40303-0b05-4b03-8b05-000000000003');
const MEMBERSHIP = HouseholdMembershipId('c5b40404-0b05-4b04-8b05-000000000004');
const CANDIDATE = ProductId('c5b40505-0b05-4b05-8b05-000000000005');
const PERSISTED = ProductId('c5b40606-0b05-4b06-8b05-000000000006');

function fakeCatalogTransaction(): HouseholdCatalogAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'BE05_CATALOG_ADMIN',
    catalogAdministrationCapability: 'HOUSEHOLD_CATALOG_ADMINISTER',
  } as unknown as HouseholdCatalogAdministrationTransaction;
}

test('CreateHouseholdProductUseCase generates internal Product identity and binds semantic facts', async () => {
  let requestedActor: unknown;
  let requestedHousehold: unknown;
  let persisted: CreateHouseholdProductPersistenceInput | undefined;

  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction(principalId, householdId, operation) {
      requestedActor = principalId;
      requestedHousehold = householdId;
      return operation(fakeCatalogTransaction());
    },
  };

  const products: HouseholdProductWriter = {
    async createHouseholdProduct(_transaction, input) {
      persisted = input;
      return PERSISTED;
    },
  };

  const useCase = new CreateHouseholdProductUseCase(
    transactions,
    products,
    { generate: () => CANDIDATE },
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    canonicalName: 'Whole Milk',
  });

  assert.equal(requestedActor, ACTOR);
  assert.equal(requestedHousehold, HOUSEHOLD);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    candidateProductId: CANDIDATE,
    canonicalName: 'Whole Milk',
  });
  assert.deepEqual(output, { productId: PERSISTED });
});

test('CreateHouseholdProductUseCase rejects non-exact canonical name before authority acquisition', async () => {
  let transactionRequested = false;

  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };
  const products: HouseholdProductWriter = {
    async createHouseholdProduct() {
      throw new Error('must not run');
    },
  };

  const useCase = new CreateHouseholdProductUseCase(
    transactions,
    products,
    { generate: () => CANDIDATE },
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      canonicalName: ' Whole Milk ',
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});

test('CreateHouseholdProductUseCase rejects malformed non-string delivery value before authority acquisition', async () => {
  let transactionRequested = false;

  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };
  const products: HouseholdProductWriter = {
    async createHouseholdProduct() {
      throw new Error('must not run');
    },
  };

  const useCase = new CreateHouseholdProductUseCase(
    transactions,
    products,
    { generate: () => CANDIDATE },
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      canonicalName: 42 as unknown as string,
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});
