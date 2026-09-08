import type {
  HouseholdId,
  PrincipalId,
} from '@fridge/domain';
import type { TransactionHandle } from './index.js';

export const HOUSEHOLD_STORAGE_ADMINISTRATION_CAPABILITY =
  'HOUSEHOLD_STORAGE_ADMINISTER' as const;

const householdStorageAdministrationBrand: unique symbol = Symbol(
  'HouseholdStorageAdministrationTransaction',
);

export interface HouseholdStorageAdministrationTransaction
  extends TransactionHandle {
  readonly [householdStorageAdministrationBrand]:
    'HouseholdStorageAdministrationTransaction';
  readonly storageAdministrationCapability:
    typeof HOUSEHOLD_STORAGE_ADMINISTRATION_CAPABILITY;
}

export interface HouseholdStorageAdministrationTransactionManager {
  withHouseholdStorageAdministrationTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (
      transaction: HouseholdStorageAdministrationTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}
