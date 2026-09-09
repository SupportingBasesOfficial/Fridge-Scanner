import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CompatibilityMappingId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/domain';
import {
  RetireHouseholdCompatibilityMappingUseCase,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCatalogAdministrationTransactionManager,
  type HouseholdCompatibilityMappingRetirer,
  type RetireHouseholdCompatibilityMappingPersistenceInput,
} from './index.js';

const COMMAND = CommandId('d8e10101-0b14-4d01-8b14-000000000001');
const ACTOR = PrincipalId('d8e10202-0b14-4d02-8b14-000000000002');
const HOUSEHOLD = HouseholdId('d8e10303-0b14-4d03-8b14-000000000003');
const MEMBERSHIP = HouseholdMembershipId('d8e10404-0b14-4d04-8b14-000000000004');
const MAPPING = CompatibilityMappingId('d8e10505-0b14-4d05-8b14-000000000005');

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

test('RetireHouseholdCompatibilityMappingUseCase delegates exact governed identity', async () => {
  let requestedActor: unknown;
  let requestedHousehold: unknown;
  let persisted: RetireHouseholdCompatibilityMappingPersistenceInput | undefined;

  const transactions: HouseholdCatalogAdministrationTransactionManager = {
    async withHouseholdCatalogAdministrationTransaction(principalId, householdId, operation) {
      requestedActor = principalId;
      requestedHousehold = householdId;
      return operation(fakeCatalogTransaction());
    },
  };
  const mappings: HouseholdCompatibilityMappingRetirer = {
    async retireHouseholdCompatibilityMapping(_transaction, input) {
      persisted = input;
      return MAPPING;
    },
  };

  const output = await new RetireHouseholdCompatibilityMappingUseCase(
    transactions,
    mappings,
  ).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    compatibilityMappingId: MAPPING,
  });

  assert.equal(requestedActor, ACTOR);
  assert.equal(requestedHousehold, HOUSEHOLD);
  assert.deepEqual(persisted, { commandId: COMMAND, compatibilityMappingId: MAPPING });
  assert.deepEqual(output, { compatibilityMappingId: MAPPING });
});
