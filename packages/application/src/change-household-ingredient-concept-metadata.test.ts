import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  IngredientConceptId,
  PrincipalId,
} from '@fridge/domain';
import {
  ChangeHouseholdIngredientConceptMetadataUseCase,
  InvalidInputError,
  type ChangeHouseholdIngredientConceptMetadataPersistenceInput,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCatalogAdministrationTransactionManager,
  type HouseholdIngredientConceptMetadataChanger,
} from './index.js';

const COMMAND = CommandId('c8c80101-0b08-4c01-8b08-000000000001');
const ACTOR = PrincipalId('c8c80202-0b08-4c02-8b08-000000000002');
const HOUSEHOLD = HouseholdId('c8c80303-0b08-4c03-8b08-000000000003');
const MEMBERSHIP = HouseholdMembershipId('c8c80404-0b08-4c04-8b08-000000000004');
const CONCEPT = IngredientConceptId('c8c80505-0b08-4c05-8b08-000000000005');

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

test('ChangeHouseholdIngredientConceptMetadataUseCase binds target and exact name', async () => {
  let persisted: ChangeHouseholdIngredientConceptMetadataPersistenceInput | undefined;
  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction(actor, household, operation) {
      assert.equal(actor, ACTOR);
      assert.equal(household, HOUSEHOLD);
      return operation(fakeTransaction());
    },
  };
  const concepts: HouseholdIngredientConceptMetadataChanger = {
    async changeHouseholdIngredientConceptMetadata(_transaction, input) {
      persisted = input;
      return CONCEPT;
    },
  };

  const result = await new ChangeHouseholdIngredientConceptMetadataUseCase(
    transactions,
    concepts,
  ).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    ingredientConceptId: CONCEPT,
    canonicalName: 'Whole Milk',
  });

  assert.equal(result.ingredientConceptId, CONCEPT);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    ingredientConceptId: CONCEPT,
    canonicalName: 'Whole Milk',
  });
});

test('ChangeHouseholdIngredientConceptMetadataUseCase rejects non-exact name before authority acquisition', async () => {
  let requested = false;
  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction() {
      requested = true;
      throw new Error('must not run');
    },
  };
  const concepts: HouseholdIngredientConceptMetadataChanger = {
    async changeHouseholdIngredientConceptMetadata() {
      throw new Error('must not run');
    },
  };
  const useCase = new ChangeHouseholdIngredientConceptMetadataUseCase(transactions, concepts);

  for (const canonicalName of ['', ' ', ' Milk', 'Milk ']) {
    await assert.rejects(
      useCase.execute({
        commandId: COMMAND,
        actorPrincipalId: ACTOR,
        householdId: HOUSEHOLD,
        ingredientConceptId: CONCEPT,
        canonicalName,
      }),
      InvalidInputError,
    );
  }
  assert.equal(requested, false);
});
