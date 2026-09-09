import {
  CompatibilityMappingFamilyId,
  CompatibilityMappingId,
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  NotFoundError,
  type CreateHouseholdCompatibilityMappingOutput,
  type CreateHouseholdCompatibilityMappingPersistenceInput,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdCompatibilityMappingWriter,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set([
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

function normalizeCompatibilityMappingDatabaseFailure(error: unknown): Error {
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

export class PgHouseholdCompatibilityMappingWriter
  implements HouseholdCompatibilityMappingWriter
{
  async createHouseholdCompatibilityMapping(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: CreateHouseholdCompatibilityMappingPersistenceInput,
  ): Promise<CreateHouseholdCompatibilityMappingOutput> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        readonly outcome_code: string;
        readonly result_mapping_family_id: string | null;
        readonly result_compatibility_mapping_id: string | null;
      }>;
    };

    try {
      result = await client.query<{
        outcome_code: string;
        result_mapping_family_id: string | null;
        result_compatibility_mapping_id: string | null;
      }>(
        `select outcome_code,
                result_mapping_family_id::text,
                result_compatibility_mapping_id::text
           from fridge_internal.create_household_compatibility_mapping(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::uuid,
             $7::uuid,
             $8::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidateMappingFamilyId,
          input.candidateCompatibilityMappingId,
          input.productId,
          input.ingredientConceptId,
        ],
      );
    } catch (error) {
      throw normalizeCompatibilityMappingDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'CREATED':
        if (
          outcome.result_mapping_family_id === null ||
          outcome.result_compatibility_mapping_id === null
        ) {
          throw new InternalApplicationError(
            new Error('CreateHouseholdCompatibilityMapping succeeded without identities'),
          );
        }
        return {
          mappingFamilyId: CompatibilityMappingFamilyId(outcome.result_mapping_family_id),
          compatibilityMappingId: CompatibilityMappingId(
            outcome.result_compatibility_mapping_id,
          ),
        };
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'CONFLICT':
        throw new ConflictError('compatibility mapping conflicts with current state');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected CreateHouseholdCompatibilityMapping outcome'),
        );
    }
  }
}
