import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  StorageLocationId,
  type ChangeStorageLocationMetadataPersistenceInput,
  type HouseholdStorageAdministrationTransaction,
  type StorageLocationMetadataChanger,
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

export class PgStorageLocationMetadataChanger implements StorageLocationMetadataChanger {
  async changeStorageLocationMetadata(
    transaction: HouseholdStorageAdministrationTransaction,
    input: ChangeStorageLocationMetadataPersistenceInput,
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
           from fridge_internal.change_storage_location_metadata(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::text,
             $7::text,
             $8::integer
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.storageLocationId,
          input.kindCode,
          input.displayName,
          input.sortOrder,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'CHANGED':
        if (outcome.result_storage_location_id === null) {
          throw new InternalApplicationError(
            new Error('ChangeStorageLocationMetadata succeeded without resource identity'),
          );
        }
        return StorageLocationId(outcome.result_storage_location_id);
      case 'INVALID_KIND':
        throw new InvalidInputError('storage location kind is not eligible');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected ChangeStorageLocationMetadata outcome'),
        );
    }
  }
}
