import {
  DependencyUnavailableError,
  HouseholdUnauthorizedError,
  InternalApplicationError,
  NotFoundError,
  StorageLocationId,
  instant,
  type CurrentStorageLocation,
  type CurrentStorageLocationReader,
  type TransactionHandle,
} from '@fridge/application';
import { requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

function normalizeDatabaseFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

function mapRow(row: {
  storage_location_id: string;
  kind_code: string;
  display_name: string;
  sort_order: number | null;
  created_at: Date;
}): CurrentStorageLocation {
  try {
    return {
      storageLocationId: StorageLocationId(row.storage_location_id),
      kindCode: row.kind_code,
      displayName: row.display_name,
      sortOrder: row.sort_order,
      createdAt: instant(row.created_at.toISOString()),
    };
  } catch (error) {
    throw new InternalApplicationError(error);
  }
}

export class PgCurrentStorageLocationReader implements CurrentStorageLocationReader {
  async listCurrentStorageLocations(
    transaction: TransactionHandle,
  ): Promise<readonly CurrentStorageLocation[]> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        authorized: boolean;
        storage_location_id: string | null;
        kind_code: string | null;
        display_name: string | null;
        sort_order: number | null;
        created_at: Date | null;
      }>;
    };

    try {
      result = await client.query(
        `select authorized,
                storage_location_id::text,
                kind_code,
                display_name,
                sort_order,
                created_at
           from fridge_internal.list_current_storage_locations(
             $1::uuid,
             $2::uuid,
             $3::uuid
           )`,
        [transaction.householdId, transaction.principalId, transaction.membershipId],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    if (result.rows[0]?.authorized !== true) {
      throw new HouseholdUnauthorizedError();
    }

    return result.rows
      .filter((row) => row.storage_location_id !== null)
      .map((row) => {
        if (
          row.storage_location_id === null ||
          row.kind_code === null ||
          row.display_name === null ||
          row.created_at === null
        ) {
          throw new InternalApplicationError(new Error('incomplete current StorageLocation row'));
        }
        return mapRow({
          storage_location_id: row.storage_location_id,
          kind_code: row.kind_code,
          display_name: row.display_name,
          sort_order: row.sort_order,
          created_at: row.created_at,
        });
      });
  }

  async getCurrentStorageLocation(
    transaction: TransactionHandle,
    storageLocationId: StorageLocationId,
  ): Promise<CurrentStorageLocation> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        outcome_code: string;
        result_storage_location_id: string | null;
        kind_code: string | null;
        display_name: string | null;
        sort_order: number | null;
        created_at: Date | null;
      }>;
    };

    try {
      result = await client.query(
        `select outcome_code,
                result_storage_location_id::text,
                kind_code,
                display_name,
                sort_order,
                created_at
           from fridge_internal.get_current_storage_location(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          storageLocationId,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const row = result.rows[0];
    switch (row?.outcome_code) {
      case 'UNAUTHORIZED':
        throw new HouseholdUnauthorizedError();
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'FOUND':
        if (
          row.result_storage_location_id === null ||
          row.kind_code === null ||
          row.display_name === null ||
          row.created_at === null
        ) {
          throw new InternalApplicationError(new Error('incomplete current StorageLocation row'));
        }
        return mapRow({
          storage_location_id: row.result_storage_location_id,
          kind_code: row.kind_code,
          display_name: row.display_name,
          sort_order: row.sort_order,
          created_at: row.created_at,
        });
      default:
        throw new InternalApplicationError(new Error('unexpected current StorageLocation read outcome'));
    }
  }
}
