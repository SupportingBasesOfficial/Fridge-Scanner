import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CreateHouseholdIngredientConceptUseCase,
  HouseholdId,
  HouseholdMembershipId,
  IngredientConceptId,
  InvalidInputError,
  PrincipalId,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCatalogAdministrationTransactionManager,
  type HouseholdIngredientConceptWriter,
  type IdentifierGenerator,
} from './index.js';

const ACTOR = PrincipalId('16161616-1616-4616-8616-161616161616');
const HOUSEHOLD = HouseholdId('27272727-2727-4727-8727-272727272727');
const MEMBERSHIP = HouseholdMembershipId('38383838-3838-4838-8838-383838383838');
const COMMAND = CommandId('49494949-4949-4949-8949-494949494949');
const CONCEPT = IngredientConceptId('5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a');

const transaction = {
  kind: 'fridge-transaction',
  principalId: ACTOR,
  householdId: HOUSEHOLD,
  membershipId: MEMBERSHIP,
  householdRoleCode: 'CATALOG_ADMIN',
} as unknown as HouseholdCatalogAdministrationTransaction;

const transactions: HouseholdCatalogAdministrationTransactionManager = {
  async withHouseholdCatalogAdministrationTransaction(principalId, householdId, operation) {
    assert.equal(principalId, ACTOR);
    assert.equal(householdId, HOUSEHOLD);
    return operation(transaction);
  },
};

const ids: IdentifierGenerator<IngredientConceptId> = {
  generate() {
    return CONCEPT;
  },
};

test('CreateHouseholdIngredientConcept delegates exact normalized intent through catalog-admin transaction', async () => {
  let observedName: string | undefined;
  const writer: HouseholdIngredientConceptWriter = {
    async createHouseholdIngredientConcept(tx, input) {
      assert.equal(tx.membershipId, MEMBERSHIP);
      assert.equal(input.commandId, COMMAND);
      assert.equal(input.candidateIngredientConceptId, CONCEPT);
      observedName = input.canonicalName;
      return CONCEPT;
    },
  };

  const result = await new CreateHouseholdIngredientConceptUseCase(
    transactions,
    writer,
    ids,
  ).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    canonicalName: 'Tomato',
  });

  assert.equal(observedName, 'Tomato');
  assert.equal(result.ingredientConceptId, CONCEPT);
});

test('CreateHouseholdIngredientConcept rejects padded or blank canonical names before persistence', async () => {
  const writer: HouseholdIngredientConceptWriter = {
    async createHouseholdIngredientConcept() {
      throw new Error('must not execute');
    },
  };
  const useCase = new CreateHouseholdIngredientConceptUseCase(transactions, writer, ids);

  for (const canonicalName of ['', ' ', ' Tomato', 'Tomato ']) {
    await assert.rejects(
      useCase.execute({
        commandId: COMMAND,
        actorPrincipalId: ACTOR,
        householdId: HOUSEHOLD,
        canonicalName,
      }),
      InvalidInputError,
    );
  }
});
