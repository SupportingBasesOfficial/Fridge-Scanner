import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  ReadAuthorizedHouseholdContext,
  type HouseholdProfileReader,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';

const principalId = PrincipalId('11111111-1111-4111-8111-111111111111');
const householdId = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const membershipId = HouseholdMembershipId('33333333-3333-4333-8333-333333333333');

function verifiedTransaction(): TransactionHandle {
  return {
    kind: 'fridge-transaction',
    principalId,
    householdId,
    membershipId,
    householdRoleCode: 'OWNER',
  } as unknown as TransactionHandle;
}

test('use case obtains persistence only inside authorized transaction capability', async () => {
  const events: string[] = [];
  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction(requestedPrincipalId, requestedHouseholdId, operation) {
      assert.equal(requestedPrincipalId, principalId);
      assert.equal(requestedHouseholdId, householdId);
      events.push('authorized');
      return operation(verifiedTransaction());
    },
  };
  const households: HouseholdProfileReader = {
    async readDisplayName(transaction) {
      assert.equal(transaction.membershipId, membershipId);
      events.push('read');
      return 'Casa Principal';
    },
  };

  const useCase = new ReadAuthorizedHouseholdContext(transactions, households);
  const result = await useCase.execute({ principalId, householdId });

  assert.deepEqual(events, ['authorized', 'read']);
  assert.deepEqual(result, {
    principalId,
    householdId,
    householdDisplayName: 'Casa Principal',
    membershipId,
    householdRoleCode: 'OWNER',
  });
});
