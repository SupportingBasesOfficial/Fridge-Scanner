import type { HouseholdId, PrincipalId } from '@fridge/domain';
import type { TransactionHandle } from './index.js';

export const HOUSEHOLD_CATALOG_ADMINISTRATION_CAPABILITY =
  'HOUSEHOLD_CATALOG_ADMINISTER' as const;

const householdCatalogAdministrationBrand: unique symbol = Symbol(
  'HouseholdCatalogAdministrationTransaction',
);

export interface HouseholdCatalogAdministrationTransaction
  extends TransactionHandle {
  readonly [householdCatalogAdministrationBrand]:
    'HouseholdCatalogAdministrationTransaction';
  readonly catalogAdministrationCapability:
    typeof HOUSEHOLD_CATALOG_ADMINISTRATION_CAPABILITY;
}

export interface HouseholdCatalogAdministrationTransactionManager {
  withHouseholdCatalogAdministrationTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (
      transaction: HouseholdCatalogAdministrationTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}
