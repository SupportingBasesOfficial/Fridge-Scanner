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
  RetireHouseholdProductUseCase,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCatalogAdministrationTransactionManager,
  type HouseholdProductRetirer,
  type RetireHouseholdProductPersistenceInput,
} from './index.js';

const COMMAND = CommandId('f5b40101-0b05-4b01-8b05-000000000001');
const ACTOR = PrincipalId('f5b40202-0b05-4b02-8b05-000000000002');
const HOUSEHOLD = HouseholdId('f5b40303-0b05-4b03-8b05-000000000003');
const MEMBERSHIP = HouseholdMembershipId('f5b40404-0b05-4b04-8b05-000000000004');
const PRODUCT = ProductId('f5b40505-0b05-4b05-8b05-000000000005');

function fakeTransaction(): HouseholdCatalogAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'BE05_RETIRE_PRODUCT_ADMIN',
    catalogAdministrationCapability: 'HOUSEHOLD_CATALOG_ADMINISTER',
  } as unknown as HouseholdCatalogAdministrationTransaction;
}

test('RetireHouseholdProductUseCase binds target and stable CommandId inside catalog authority', async () => {
  let requestedActor: unknown;
  let requestedHousehold: unknown;
  let persisted: RetireHouseholdProductPersistenceInput | undefined;

  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction(principalId, householdId, operation) {
      requestedActor = principalId;
      requestedHousehold = householdId;
      return operation(fakeTransaction());
    },
  };
  const products: HouseholdProductRetirer = {
    async retireHouseholdProduct(_transaction, input) {
      persisted = input;
      return PRODUCT;
    },
  };

  const output = await new RetireHouseholdProductUseCase(transactions, products).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    productId: PRODUCT,
  });

  assert.equal(requestedActor, ACTOR);
  assert.equal(requestedHousehold, HOUSEHOLD);
  assert.deepEqual(persisted, { commandId: COMMAND, productId: PRODUCT });
  assert.deepEqual(output, { productId: PRODUCT });
});

test('RetireHouseholdProductUseCase rejects a persistence boundary that returns no identity', async () => {
  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction(_principalId, _householdId, operation) {
      return operation(fakeTransaction());
    },
  };
  const products: HouseholdProductRetirer = {
    async retireHouseholdProduct() {
      return undefined as unknown as ProductId;
    },
  };

  await assert.rejects(
    new RetireHouseholdProductUseCase(transactions, products).execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      productId: PRODUCT,
    }),
    TypeError,
  );
});
