import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  IngredientConceptId,
  InternalApplicationError,
  type CreateHouseholdIngredientConceptPersistenceInput,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdIngredientConceptWriter,
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

export class PgHouseholdIngredientConceptWriter implements HouseholdIngredientConceptWriter {
  async createHouseholdIngredientConcept(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: CreateHouseholdIngredientConceptPersistenceInput,
  ): Promise<IngredientConceptId> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        readonly outcome_code: string;
        readonly result_ingredient_concept_id: string | null;
      }>;
    };

    try {
      result = await client.query(
        `select outcome_code,
                result_ingredient_concept_id::text
           from fridge_internal.create_household_ingredient_concept(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidateIngredientConceptId,
          input.canonicalName,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'CREATED':
        if (outcome.result_ingredient_concept_id === null) {
          throw new InternalApplicationError(
            new Error('CreateHouseholdIngredientConcept succeeded without identity'),
          );
        }
        return IngredientConceptId(outcome.result_ingredient_concept_id);
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected CreateHouseholdIngredientConcept outcome'),
        );
    }
  }
}
