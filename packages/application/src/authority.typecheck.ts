import {
  HOUSEHOLD_MEMBERSHIP_ADMINISTRATION_CAPABILITY,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  type HouseholdMembershipAdministrationTransaction,
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

// BE-03 administration authority is a stronger opaque capability. Possessing the
// public capability code or a plausible role string is not enough to manufacture it.
// @ts-expect-error HouseholdMembershipAdministrationTransaction requires trusted adapter materialization.
const forgedAdministrationTransaction: HouseholdMembershipAdministrationTransaction = {
  kind: 'fridge-transaction',
  principalId,
  householdId,
  membershipId,
  householdRoleCode: 'BE03_ADMIN',
  membershipAdministrationCapability:
    HOUSEHOLD_MEMBERSHIP_ADMINISTRATION_CAPABILITY,
};

void forgedTransaction;
void forgedAdministrationTransaction;
