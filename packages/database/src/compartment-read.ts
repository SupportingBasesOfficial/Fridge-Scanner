import {
  CompartmentId,
  DependencyUnavailableError,
  HouseholdUnauthorizedError,
  InternalApplicationError,
  NotFoundError,
  StorageLocationId,
  instant,
  type CurrentCompartment,
  type CurrentCompartmentReader,
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
  compartment_id: string;
  storage_location_id: string;
  kind_code: string | null;
  display_name: string;
  sort_order: number | null;
  created_at: Date;
}): CurrentCompartment {
  try {
    return {
      compartmentId: CompartmentId(row.compartment_id),
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

export class PgCurrentCompartmentReader implements CurrentCompartmentReader {
  async listCurrentCompartments(
    transaction: TransactionHandle,
    storageLocationId: StorageLocationId,
  ): Promise<readonly CurrentCompartment[]> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        authorized: boolean;
        parent_found: boolean;
        compartment_id: string | null;
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
                parent_found,
                compartment_id::text,
                storage_location_id::text,
                kind_code,
                display_name,
                sort_order,
                created_at
           from fridge_internal.list_current_compartments(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid
           )`,
        [transaction.householdId, transaction.principalId, transaction.membershipId, storageLocationId],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const first = result.rows[0];
    if (first?.authorized !== true) {
      throw new HouseholdUnauthorizedError();
    }
    if (first.parent_found !== true) {
      throw new NotFoundError();
    }

    return result.rows
      .filter((row) => row.compartment_id !== null)
      .map((row) => {
        if (
          row.compartment_id === null ||
          row.storage_location_id === null ||
          row.display_name === null ||
          row.created_at === null
        ) {
          throw new InternalApplicationError(new Error('incomplete current Compartment row'));
        }
        return mapRow({
          compartment_id: row.compartment_id,
          storage_location_id: row.storage_location_id,
          kind_code: row.kind_code,
          display_name: row.display_name,
          sort_order: row.sort_order,
          created_at: row.created_at,
        });
      });
  }

  async getCurrentCompartment(
    transaction: TransactionHandle,
    compartmentId: CompartmentId,
  ): Promise<CurrentCompartment> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        outcome_code: string;
        result_compartment_id: string | null;
        storage_location_id: string | null;
        kind_code: string | null;
        display_name: string | null;
        sort_order: number | null;
        created_at: Date | null;
      }>;
    };

    try {
      result = await client.query(
        `select outcome_code,
                result_compartment_id::text,
                storage_location_id::text,
                kind_code,
                display_name,
                sort_order,
                created_at
           from fridge_internal.get_current_compartment(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid
           )`,
        [transaction.householdId, transaction.principalId, transaction.membershipId, compartmentId],
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
          row.result_compartment_id === null ||
          row.storage_location_id === null ||
          row.display_name === null ||
          row.created_at === null
        ) {
          throw new InternalApplicationError(new Error('incomplete current Compartment row'));
        }
        return mapRow({
          compartment_id: row.result_compartment_id,
          storage_location_id: row.storage_location_id,
          kind_code: row.kind_code,
          display_name: row.display_name,
          sort_order: row.sort_order,
          created_at: row.created_at,
        });
      default:
        throw new InternalApplicationError(new Error('unexpected current Compartment read outcome'));
    }
  }
}
