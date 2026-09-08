import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BrandId,
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  ManufacturerId,
  PrincipalId,
  ProductCategoryId,
  ProductId,
} from '@fridge/domain';
import {
  ChangeHouseholdProductMetadataUseCase,
  InvalidInputError,
  type ChangeHouseholdProductMetadataPersistenceInput,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCatalogAdministrationTransactionManager,
  type HouseholdProductMetadataChanger,
} from './index.js';

const COMMAND = CommandId('d5d50101-0b05-4d01-8b05-000000000001');
const ACTOR = PrincipalId('d5d50202-0b05-4d02-8b05-000000000002');
const HOUSEHOLD = HouseholdId('d5d50303-0b05-4d03-8b05-000000000003');
const MEMBERSHIP = HouseholdMembershipId('d5d50404-0b05-4d04-8b05-000000000004');
const PRODUCT = ProductId('d5d50505-0b05-4d05-8b05-000000000005');
const BRAND = BrandId('d5d50606-0b05-4d06-8b05-000000000006');
const MANUFACTURER = ManufacturerId('d5d50707-0b05-4d07-8b05-000000000007');
const CATEGORY = ProductCategoryId('d5d50808-0b05-4d08-8b05-000000000008');

function fakeTransaction(): HouseholdCatalogAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'BE05_CATALOG_ADMIN',
    catalogAdministrationCapability: 'HOUSEHOLD_CATALOG_ADMINISTER',
  } as unknown as HouseholdCatalogAdministrationTransaction;
}

test('ChangeHouseholdProductMetadataUseCase binds target and exact metadata facts', async () => {
  let persisted: ChangeHouseholdProductMetadataPersistenceInput | undefined;
  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction(_actor, _household, operation) {
      return operation(fakeTransaction());
    },
  };
  const products: HouseholdProductMetadataChanger = {
    async changeHouseholdProductMetadata(_transaction, input) {
      persisted = input;
      return PRODUCT;
    },
  };
  const useCase = new ChangeHouseholdProductMetadataUseCase(transactions, products);

  const result = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    productId: PRODUCT,
    canonicalName: 'Whole Milk 1L',
    brandId: BRAND,
    manufacturerId: MANUFACTURER,
    productCategoryId: CATEGORY,
  });

  assert.equal(result.productId, PRODUCT);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    productId: PRODUCT,
    canonicalName: 'Whole Milk 1L',
    brandId: BRAND,
    manufacturerId: MANUFACTURER,
    productCategoryId: CATEGORY,
  });
});

test('ChangeHouseholdProductMetadataUseCase rejects non-exact name before authority acquisition', async () => {
  let requested = false;
  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction() {
      requested = true;
      throw new Error('must not run');
    },
  };
  const products: HouseholdProductMetadataChanger = {
    async changeHouseholdProductMetadata() {
      throw new Error('must not run');
    },
  };
  const useCase = new ChangeHouseholdProductMetadataUseCase(transactions, products);

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      productId: PRODUCT,
      canonicalName: ' Whole Milk ',
      brandId: null,
      manufacturerId: null,
      productCategoryId: null,
    }),
    InvalidInputError,
  );
  assert.equal(requested, false);
});
