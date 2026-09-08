import {
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  NotFoundError,
  StorageLocationId,
  type HouseholdStorageAdministrationTransaction,
  type RetireStorageLocationPersistenceInput,
  type StorageLocationRetirer,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set([
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

function normalizeDatabaseFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';

  if (code === 'P4I01') {
    return new IdempotencyConflictError();
  }

  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }

  return new InternalApplicationError(error);
}

export class PgStorageLocationRetirer implements StorageLocationRetirer {
  async retireStorageLocation(
    transaction: HouseholdStorageAdministrationTransaction,
    input: RetireStorageLocationPersistenceInput,
  ): Promise<StorageLocationId> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        readonly outcome_code: string;
        readonly result_storage_location_id: string | null;
      }>;
    };

    try {
      result = await client.query<{
        outcome_code: string;
        result_storage_location_id: string | null;
      }>(
        `select outcome_code,
                result_storage_location_id::text
           from fridge_internal.retire_storage_location(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.storageLocationId,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'RETIRED':
        if (outcome.result_storage_location_id === null) {
          throw new InternalApplicationError(
            new Error('RetireStorageLocation succeeded without resource identity'),
          );
        }
        return StorageLocationId(outcome.result_storage_location_id);
      case 'ACTIVE_CHILD_CONFLICT':
        throw new ConflictError('StorageLocation has active Compartments');
      case 'STOCK_DEPENDENCY_CONFLICT':
        throw new ConflictError('StorageLocation has current stock dependencies');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected RetireStorageLocation outcome'),
        );
    }
  }
}
