import {
  CompatibilityMappingId,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  NotFoundError,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCompatibilityMappingRetirer,
  type RetireHouseholdCompatibilityMappingPersistenceInput,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

function normalizeDatabaseFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';
  if (code === 'P5I01') return new IdempotencyConflictError();
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

export class PgHouseholdCompatibilityMappingRetirer implements HouseholdCompatibilityMappingRetirer {
  async retireHouseholdCompatibilityMapping(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: RetireHouseholdCompatibilityMappingPersistenceInput,
  ): Promise<CompatibilityMappingId> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        readonly outcome_code: string;
        readonly result_compatibility_mapping_id: string | null;
      }>;
    };

    try {
      result = await client.query<{
        outcome_code: string;
        result_compatibility_mapping_id: string | null;
      }>(
        `select outcome_code,
                result_compatibility_mapping_id::text
           from fridge_internal.retire_household_compatibility_mapping(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.compatibilityMappingId,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'RETIRED':
        if (outcome.result_compatibility_mapping_id === null) {
          throw new InternalApplicationError(
            new Error('RetireHouseholdCompatibilityMapping succeeded without identity'),
          );
        }
        return CompatibilityMappingId(outcome.result_compatibility_mapping_id);
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected RetireHouseholdCompatibilityMapping outcome'),
        );
    }
  }
}
