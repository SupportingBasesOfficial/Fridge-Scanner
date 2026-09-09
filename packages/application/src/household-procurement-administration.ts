import type { HouseholdId, PrincipalId } from '@fridge/domain';
import type { TransactionHandle } from './index.js';

export const HOUSEHOLD_PROCUREMENT_ADMINISTRATION_CAPABILITY =
  'HOUSEHOLD_PROCUREMENT_ADMINISTER' as const;

const householdProcurementAdministrationBrand: unique symbol = Symbol(
  'HouseholdProcurementAdministrationTransaction',
);

export interface HouseholdProcurementAdministrationTransaction
  extends TransactionHandle {
  readonly [householdProcurementAdministrationBrand]:
    'HouseholdProcurementAdministrationTransaction';
  readonly procurementAdministrationCapability:
    typeof HOUSEHOLD_PROCUREMENT_ADMINISTRATION_CAPABILITY;
}

export interface HouseholdProcurementAdministrationTransactionManager {
  withHouseholdProcurementAdministrationTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (
      transaction: HouseholdProcurementAdministrationTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}
