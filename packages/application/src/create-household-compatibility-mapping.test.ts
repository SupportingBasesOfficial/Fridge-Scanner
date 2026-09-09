import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CompatibilityMappingFamilyId,
  CompatibilityMappingId,
  HouseholdId,
  HouseholdMembershipId,
  IngredientConceptId,
  PrincipalId,
  ProductId,
} from '@fridge/domain';
import {
  CreateHouseholdCompatibilityMappingUseCase,
  type CreateHouseholdCompatibilityMappingPersistenceInput,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCatalogAdministrationTransactionManager,
  type HouseholdCompatibilityMappingWriter,
} from './index.js';

const COMMAND = CommandId('c6d40101-0b13-4d01-8b13-000000000001');
const ACTOR = PrincipalId('c6d40202-0b13-4d02-8b13-000000000002');
const HOUSEHOLD = HouseholdId('c6d40303-0b13-4d03-8b13-000000000003');
const MEMBERSHIP = HouseholdMembershipId('c6d40404-0b13-4d04-8b13-000000000004');
const PRODUCT = ProductId('c6d40505-0b13-4d05-8b13-000000000005');
const CONCEPT = IngredientConceptId('c6d40606-0b13-4d06-8b13-000000000006');
const FAMILY = CompatibilityMappingFamilyId('c6d40707-0b13-4d07-8b13-000000000007');
const MAPPING = CompatibilityMappingId('c6d40808-0b13-4d08-8b13-000000000008');
const PERSISTED_FAMILY = CompatibilityMappingFamilyId('c6d40909-0b13-4d09-8b13-000000000009');
const PERSISTED_MAPPING = CompatibilityMappingId('c6d41010-0b13-4d10-8b13-000000000010');

function fakeCatalogTransaction(): HouseholdCatalogAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'BE05_COMPATIBILITY_ADMIN',
    catalogAdministrationCapability: 'HOUSEHOLD_CATALOG_ADMINISTER',
  } as unknown as HouseholdCatalogAdministrationTransaction;
}

test('CreateHouseholdCompatibilityMappingUseCase binds actor, Household and exact endpoint identities', async () => {
  let requestedActor: unknown;
  let requestedHousehold: unknown;
  let persisted: CreateHouseholdCompatibilityMappingPersistenceInput | undefined;

  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction(principalId, householdId, operation) {
      requestedActor = principalId;
      requestedHousehold = householdId;
      return operation(fakeCatalogTransaction());
    },
  };
  const mappings: HouseholdCompatibilityMappingWriter = {
    async createHouseholdCompatibilityMapping(_transaction, input) {
      persisted = input;
      return {
        mappingFamilyId: PERSISTED_FAMILY,
        compatibilityMappingId: PERSISTED_MAPPING,
      };
    },
  };

  const useCase = new CreateHouseholdCompatibilityMappingUseCase(
    transactions,
    mappings,
    { generate: () => FAMILY },
    { generate: () => MAPPING },
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    productId: PRODUCT,
    ingredientConceptId: CONCEPT,
  });

  assert.equal(requestedActor, ACTOR);
  assert.equal(requestedHousehold, HOUSEHOLD);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    candidateMappingFamilyId: FAMILY,
    candidateCompatibilityMappingId: MAPPING,
    productId: PRODUCT,
    ingredientConceptId: CONCEPT,
  });
  assert.deepEqual(output, {
    mappingFamilyId: PERSISTED_FAMILY,
    compatibilityMappingId: PERSISTED_MAPPING,
  });
});
