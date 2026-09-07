import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  EndHouseholdMembershipUseCase,
  HouseholdId,
  HouseholdMembershipId,
  LeaveHouseholdUseCase,
  PrincipalId,
  type EndHouseholdMembershipPersistenceInput,
  type HouseholdMembershipAdministrationTransaction,
  type HouseholdMembershipAdministrationTransactionManager,
  type HouseholdMembershipEnder,
  type HouseholdSelfLeaver,
  type LeaveHouseholdPersistenceInput,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';

const COMMAND = CommandId('dddddddd-1111-4111-8111-dddddddddddd');
const ACTOR = PrincipalId('11111111-1111-4111-8111-111111111111');
const TARGET = PrincipalId('22222222-2222-4222-8222-222222222222');
const HOUSEHOLD = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const ACTOR_MEMBERSHIP = HouseholdMembershipId('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
const ENDED_MEMBERSHIP = HouseholdMembershipId('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb');

function adminTransaction(): HouseholdMembershipAdministrationTransaction {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: ACTOR_MEMBERSHIP,
    householdRoleCode: 'TEST_ADMIN',
    membershipAdministrationCapability: 'HOUSEHOLD_MEMBERSHIP_ADMINISTER',
  } as unknown as HouseholdMembershipAdministrationTransaction;
}

function authorizedTransaction(): TransactionHandle {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: ACTOR_MEMBERSHIP,
    householdRoleCode: 'MEMBER',
  } as unknown as TransactionHandle;
}

test('EndHouseholdMembershipUseCase uses the stronger administration transaction and carries stable command identity', async () => {
  let persisted: EndHouseholdMembershipPersistenceInput | undefined;
  let actor: unknown;
  let household: unknown;

  const transactions: HouseholdMembershipAdministrationTransactionManager = {
    async withHouseholdMembershipAdministrationTransaction(principalId, householdId, operation) {
      actor = principalId;
      household = householdId;
      return operation(adminTransaction());
    },
  };
  const memberships: HouseholdMembershipEnder = {
    async endHouseholdMembership(_transaction, input) {
      persisted = input;
      return ENDED_MEMBERSHIP;
    },
  };

  const output = await new EndHouseholdMembershipUseCase(transactions, memberships).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    targetPrincipalId: TARGET,
  });

  assert.equal(actor, ACTOR);
  assert.equal(household, HOUSEHOLD);
  assert.deepEqual(persisted, { commandId: COMMAND, targetPrincipalId: TARGET });
  assert.deepEqual(output, { endedMembershipId: ENDED_MEMBERSHIP });
});

test('LeaveHouseholdUseCase requires only current Household authorization and never requests administration capability', async () => {
  let persisted: LeaveHouseholdPersistenceInput | undefined;
  let actor: unknown;
  let household: unknown;

  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction(principalId, householdId, operation) {
      actor = principalId;
      household = householdId;
      return operation(authorizedTransaction());
    },
  };
  const memberships: HouseholdSelfLeaver = {
    async leaveHousehold(_transaction, input) {
      persisted = input;
      return ACTOR_MEMBERSHIP;
    },
  };

  const output = await new LeaveHouseholdUseCase(transactions, memberships).execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
  });

  assert.equal(actor, ACTOR);
  assert.equal(household, HOUSEHOLD);
  assert.deepEqual(persisted, { commandId: COMMAND });
  assert.deepEqual(output, { endedMembershipId: ACTOR_MEMBERSHIP });
});
