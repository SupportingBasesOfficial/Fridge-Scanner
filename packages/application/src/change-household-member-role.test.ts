import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/domain';
import {
  ChangeHouseholdMemberRoleUseCase,
  InvalidInputError,
  type ChangeHouseholdMemberRolePersistenceInput,
  type HouseholdMembershipAdministrationTransaction,
  type HouseholdMembershipAdministrationTransactionManager,
  type HouseholdMembershipRoleChanger,
} from './index.js';

const COMMAND = CommandId('cccccccc-2222-4222-8222-cccccccccccc');
const ACTOR = PrincipalId('11111111-1111-4111-8111-111111111111');
const TARGET = PrincipalId('22222222-2222-4222-8222-222222222222');
const HOUSEHOLD = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const ACTOR_MEMBERSHIP = HouseholdMembershipId('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
const CANDIDATE_MEMBERSHIP = HouseholdMembershipId('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb');
const PERSISTED_MEMBERSHIP = HouseholdMembershipId('dddddddd-2222-4222-8222-dddddddddddd');

function fakeAdministrationTransaction(): HouseholdMembershipAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: ACTOR_MEMBERSHIP,
    householdRoleCode: 'TEST_ADMIN',
    membershipAdministrationCapability: 'HOUSEHOLD_MEMBERSHIP_ADMINISTER',
  } as unknown as HouseholdMembershipAdministrationTransaction;
}

test('ChangeHouseholdMemberRoleUseCase carries stable command identity and returns persisted replacement membership', async () => {
  let persisted: ChangeHouseholdMemberRolePersistenceInput | undefined;

  const transactions: HouseholdMembershipAdministrationTransactionManager = {
    async withHouseholdMembershipAdministrationTransaction(
      principalId,
      householdId,
      operation,
    ) {
      assert.equal(principalId, ACTOR);
      assert.equal(householdId, HOUSEHOLD);
      return operation(fakeAdministrationTransaction());
    },
  };

  const memberships: HouseholdMembershipRoleChanger = {
    async changeHouseholdMemberRole(_transaction, input) {
      persisted = input;
      return PERSISTED_MEMBERSHIP;
    },
  };

  const useCase = new ChangeHouseholdMemberRoleUseCase(
    transactions,
    memberships,
    { generate: () => CANDIDATE_MEMBERSHIP },
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    targetPrincipalId: TARGET,
    roleCode: 'MEMBER',
  });

  assert.deepEqual(persisted, {
    commandId: COMMAND,
    candidateMembershipId: CANDIDATE_MEMBERSHIP,
    targetPrincipalId: TARGET,
    roleCode: 'MEMBER',
  });
  assert.deepEqual(output, { membershipId: PERSISTED_MEMBERSHIP });
});

test('ChangeHouseholdMemberRoleUseCase rejects non-exact role input before authority acquisition', async () => {
  let transactionRequested = false;

  const transactions: HouseholdMembershipAdministrationTransactionManager = {
    async withHouseholdMembershipAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };

  const memberships: HouseholdMembershipRoleChanger = {
    async changeHouseholdMemberRole() {
      throw new Error('must not run');
    },
  };

  const useCase = new ChangeHouseholdMemberRoleUseCase(
    transactions,
    memberships,
    { generate: () => CANDIDATE_MEMBERSHIP },
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      targetPrincipalId: TARGET,
      roleCode: ' MEMBER ',
    }),
    InvalidInputError,
  );
  assert.equal(transactionRequested, false);
});
