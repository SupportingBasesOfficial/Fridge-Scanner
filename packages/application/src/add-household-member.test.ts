import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/domain';
import {
  AddHouseholdMemberUseCase,
  InvalidInputError,
  type AddHouseholdMemberPersistenceInput,
  type HouseholdMembershipAdministrationTransaction,
  type HouseholdMembershipAdministrationTransactionManager,
  type HouseholdMembershipWriter,
} from './index.js';

const COMMAND = CommandId('cccccccc-1111-4111-8111-cccccccccccc');
const ACTOR = PrincipalId('11111111-1111-4111-8111-111111111111');
const TARGET = PrincipalId('22222222-2222-4222-8222-222222222222');
const HOUSEHOLD = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const ACTOR_MEMBERSHIP = HouseholdMembershipId('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
const CANDIDATE_MEMBERSHIP = HouseholdMembershipId('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb');
const PERSISTED_MEMBERSHIP = HouseholdMembershipId('dddddddd-1111-4111-8111-dddddddddddd');

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

test('AddHouseholdMemberUseCase carries stable command identity and returns persisted membership identity', async () => {
  let requestedActor: unknown;
  let requestedHousehold: unknown;
  let persisted: AddHouseholdMemberPersistenceInput | undefined;

  const transactions: HouseholdMembershipAdministrationTransactionManager = {
    async withHouseholdMembershipAdministrationTransaction(
      principalId,
      householdId,
      operation,
    ) {
      requestedActor = principalId;
      requestedHousehold = householdId;
      return operation(fakeAdministrationTransaction());
    },
  };

  const memberships: HouseholdMembershipWriter = {
    async addHouseholdMember(_transaction, input) {
      persisted = input;
      return PERSISTED_MEMBERSHIP;
    },
  };

  const useCase = new AddHouseholdMemberUseCase(
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

  assert.equal(requestedActor, ACTOR);
  assert.equal(requestedHousehold, HOUSEHOLD);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    candidateMembershipId: CANDIDATE_MEMBERSHIP,
    targetPrincipalId: TARGET,
    roleCode: 'MEMBER',
  });
  assert.deepEqual(output, { membershipId: PERSISTED_MEMBERSHIP });
});

test('AddHouseholdMemberUseCase rejects non-exact role input before authority acquisition', async () => {
  let transactionRequested = false;

  const transactions: HouseholdMembershipAdministrationTransactionManager = {
    async withHouseholdMembershipAdministrationTransaction() {
      transactionRequested = true;
      throw new Error('must not run');
    },
  };

  const memberships: HouseholdMembershipWriter = {
    async addHouseholdMember() {
      throw new Error('must not run');
    },
  };

  const useCase = new AddHouseholdMemberUseCase(
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
