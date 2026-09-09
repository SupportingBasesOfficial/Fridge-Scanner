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
  RetireHouseholdIngredientConceptUseCase,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCatalogAdministrationTransactionManager,
  type HouseholdIngredientConceptRetirer,
  type RetireHouseholdIngredientConceptPersistenceInput,
} from './index.js';

const COMMAND = CommandId('d9d90101-0b09-4d01-8b09-000000000001');
const ACTOR = PrincipalId('d9d90202-0b09-4d02-8b09-000000000002');
const HOUSEHOLD = HouseholdId('d9d90303-0b09-4d03-8b09-000000000003');
const MEMBERSHIP = HouseholdMembershipId('d9d90404-0b09-4d04-8b09-000000000004');
const CONCEPT = IngredientConceptId('d9d90505-0b09-4d05-8b09-000000000005');

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

test('RetireHouseholdIngredientConceptUseCase binds exact target through catalog-admin authority', async () => {
  let persisted: RetireHouseholdIngredientConceptPersistenceInput | undefined;
  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction(actor, household, operation) {
      assert.equal(actor, ACTOR);
      assert.equal(household, HOUSEHOLD);
      return operation(fakeTransaction());
    },
  };
  const concepts: HouseholdIngredientConceptRetirer = {
    async retireHouseholdIngredientConcept(_transaction, input) {
      persisted = input;
      return CONCEPT;
    },
  };

  const result = await new RetireHouseholdIngredientConceptUseCase(
    transactions,
    concepts,
  ).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    ingredientConceptId: CONCEPT,
  });

  assert.equal(result.ingredientConceptId, CONCEPT);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    ingredientConceptId: CONCEPT,
  });
});
