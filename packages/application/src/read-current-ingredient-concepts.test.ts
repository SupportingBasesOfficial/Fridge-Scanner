import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GetCurrentIngredientConceptUseCase,
  HouseholdId,
  HouseholdMembershipId,
  IngredientConceptId,
  ListCurrentIngredientConceptsUseCase,
  PrincipalId,
  instant,
  type CurrentIngredientConceptReader,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';

const ACTOR = PrincipalId('51515151-5151-4515-8515-515151515151');
const HOUSEHOLD = HouseholdId('62626262-6262-4626-8626-626262626262');
const MEMBERSHIP = HouseholdMembershipId('73737373-7373-4737-8737-737373737373');
const INGREDIENT_CONCEPT = IngredientConceptId('84848484-8484-4848-8848-848484848484');

function transaction(): TransactionHandle {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'TEST_MEMBER',
  } as unknown as TransactionHandle;
}

function transactions(): TransactionManager {
  return {
    async withAuthorizedHouseholdTransaction(principalId, householdId, operation) {
      assert.equal(principalId, ACTOR);
      assert.equal(householdId, HOUSEHOLD);
      return operation(transaction());
    },
  };
}

const observation = {
  ingredientConceptId: INGREDIENT_CONCEPT,
  catalogScope: 'HOUSEHOLD' as const,
  ownerHouseholdId: HOUSEHOLD,
  canonicalName: 'Household tomato concept',
  createdAt: instant('2026-09-08T00:00:00Z'),
};

test('ListCurrentIngredientConceptsUseCase observes through authorized Household transaction', async () => {
  const reader: CurrentIngredientConceptReader = {
    async listCurrentIngredientConcepts(tx) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      return [observation];
    },
    async getCurrentIngredientConcept() {
      return observation;
    },
  };

  const result = await new ListCurrentIngredientConceptsUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
  });

  assert.deepEqual(result.ingredientConcepts, [observation]);
});

test('GetCurrentIngredientConceptUseCase preserves intent-specific target identity', async () => {
  let observedTarget: IngredientConceptId | undefined;
  const reader: CurrentIngredientConceptReader = {
    async listCurrentIngredientConcepts() {
      return [];
    },
    async getCurrentIngredientConcept(tx, ingredientConceptId) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      observedTarget = ingredientConceptId;
      return observation;
    },
  };

  const result = await new GetCurrentIngredientConceptUseCase(transactions(), reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    ingredientConceptId: INGREDIENT_CONCEPT,
  });

  assert.equal(observedTarget, INGREDIENT_CONCEPT);
  assert.deepEqual(result.ingredientConcept, observation);
});
