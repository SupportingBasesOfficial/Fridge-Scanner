import type {
  HouseholdId,
  PrincipalId,
} from '@fridge/domain';
import type { TransactionHandle } from './index.js';

export const HOUSEHOLD_MEMBERSHIP_ADMINISTRATION_CAPABILITY =
  'HOUSEHOLD_MEMBERSHIP_ADMINISTER' as const;

const householdMembershipAdministrationBrand: unique symbol = Symbol(
  'HouseholdMembershipAdministrationTransaction',
);

export interface HouseholdMembershipAdministrationTransaction
  extends TransactionHandle {
  readonly [householdMembershipAdministrationBrand]:
    'HouseholdMembershipAdministrationTransaction';
  readonly membershipAdministrationCapability:
    typeof HOUSEHOLD_MEMBERSHIP_ADMINISTRATION_CAPABILITY;
}

export interface HouseholdMembershipAdministrationTransactionManager {
  withHouseholdMembershipAdministrationTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (
      transaction: HouseholdMembershipAdministrationTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}
