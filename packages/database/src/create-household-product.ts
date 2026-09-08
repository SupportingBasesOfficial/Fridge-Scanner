import {
  DependencyUnavailableError,
  HouseholdAuthorizationError as ApplicationHouseholdAuthorizationError,
  IdempotencyConflictError,
  InternalApplicationError,
  ProductId,
  type CreateHouseholdProductPersistenceInput,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdProductWriter,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set([
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

function normalizeHouseholdProductDatabaseFailure(error: unknown): Error {
  if (
    error instanceof ApplicationHouseholdAuthorizationError ||
    error instanceof IdempotencyConflictError ||
    error instanceof DependencyUnavailableError ||
    error instanceof InternalApplicationError
  ) {
    return error;
  }

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';

  if (code === 'P5I01') {
    return new IdempotencyConflictError();
  }

  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }

  return new InternalApplicationError(error);
}

export class PgHouseholdProductWriter implements HouseholdProductWriter {
  async createHouseholdProduct(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: CreateHouseholdProductPersistenceInput,
  ): Promise<ProductId> {
    const client = requirePgClient(transaction);

    let result: {
      readonly rows: Array<{
        readonly outcome_code: string;
        readonly result_product_id: string | null;
      }>;
    };

    try {
      result = await client.query<{
        outcome_code: string;
        result_product_id: string | null;
      }>(
        `select outcome_code,
                result_product_id::text
           from fridge_internal.create_household_product(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::text
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidateProductId,
          input.canonicalName,
        ],
      );
    } catch (error) {
      throw normalizeHouseholdProductDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'CREATED':
        if (outcome.result_product_id === null) {
          throw new InternalApplicationError(
            new Error('CreateHouseholdProduct succeeded without Product identity'),
          );
        }
        return ProductId(outcome.result_product_id);
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected CreateHouseholdProduct outcome'),
        );
    }
  }
}
