import {
  HOUSEHOLD_STORAGE_ADMINISTRATION_CAPABILITY,
  type HouseholdId,
  type HouseholdStorageAdministrationTransaction,
  type HouseholdStorageAdministrationTransactionManager,
  type PrincipalId,
  type TransactionManager,
} from '@fridge/application';
import {
  HouseholdAuthorizationError,
  requirePgClient,
} from './index.js';

export class PgHouseholdStorageAdministrationTransactionManager
  implements HouseholdStorageAdministrationTransactionManager
{
  constructor(private readonly transactions: TransactionManager) {}

  async withHouseholdStorageAdministrationTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (
      transaction: HouseholdStorageAdministrationTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return this.transactions.withAuthorizedHouseholdTransaction(
      principalId,
      householdId,
      async (transaction) => {
        const client = requirePgClient(transaction);
        const authority = await client.query<{ role_code: string | null }>(
          `select fridge_internal.acquire_household_storage_admin_authority(
             $1::uuid,
             $2::uuid,
             $3::uuid
           ) as role_code`,
          [transaction.householdId, transaction.principalId, transaction.membershipId],
        );
        const authorityRoleCode = authority.rows[0]?.role_code;

        if (
          authorityRoleCode === null ||
          authorityRoleCode === undefined ||
          authorityRoleCode !== transaction.householdRoleCode
        ) {
          throw new HouseholdAuthorizationError();
        }

        Object.defineProperty(transaction, 'storageAdministrationCapability', {
          value: HOUSEHOLD_STORAGE_ADMINISTRATION_CAPABILITY,
          enumerable: false,
          configurable: false,
          writable: false,
        });

        return operation(
          transaction as unknown as HouseholdStorageAdministrationTransaction,
        );
      },
    );
  }
}
