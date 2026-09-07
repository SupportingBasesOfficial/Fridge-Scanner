import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  ReadCurrentHouseholdMembersUseCase,
  type CurrentHouseholdMembershipReader,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';
import { instant } from '@fridge/domain';

const ACTOR = PrincipalId('11111111-1111-4111-8111-111111111111');
const HOUSEHOLD = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const MEMBERSHIP = HouseholdMembershipId('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb');

function transaction(): TransactionHandle {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'TEST_MEMBER',
  } as unknown as TransactionHandle;
}

test('ReadCurrentHouseholdMembersUseCase reads only inside current Household authorization', async () => {
  let authorizedActor: unknown;
  let authorizedHousehold: unknown;
  let observedTransaction: TransactionHandle | undefined;

  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction(principalId, householdId, operation) {
      authorizedActor = principalId;
      authorizedHousehold = householdId;
      return operation(transaction());
    },
  };

  const reader: CurrentHouseholdMembershipReader = {
    async readCurrentHouseholdMembers(tx) {
      observedTransaction = tx;
      return [{
        membershipId: MEMBERSHIP,
        principalId: ACTOR,
        displayName: 'Current Member',
        roleCode: 'TEST_MEMBER',
        effectiveFrom: instant('2026-09-07T00:00:00Z'),
        effectiveTo: null,
      }];
    },
  };

  const result = await new ReadCurrentHouseholdMembersUseCase(transactions, reader).execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
  });

  assert.equal(authorizedActor, ACTOR);
  assert.equal(authorizedHousehold, HOUSEHOLD);
  assert.equal(observedTransaction?.membershipId, MEMBERSHIP);
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0]?.principalId, ACTOR);
});
