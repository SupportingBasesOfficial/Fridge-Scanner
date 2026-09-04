import {
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  type TransactionHandle,
} from './index.js';

const principalId = PrincipalId('11111111-1111-4111-8111-111111111111');
const householdId = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const membershipId = HouseholdMembershipId('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');

// This compile-time proof ensures ordinary application code cannot manufacture
// an authorized transaction capability from verified-looking public fields alone.
// @ts-expect-error TransactionHandle is opaque and may only be materialized by a trusted adapter boundary.
const forgedTransaction: TransactionHandle = {
  kind: 'fridge-transaction',
  principalId,
  householdId,
  membershipId,
  householdRoleCode: 'MEMBER',
};

void forgedTransaction;
