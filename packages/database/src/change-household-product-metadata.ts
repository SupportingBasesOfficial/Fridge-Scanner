import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  ProductId,
  type ChangeHouseholdProductMetadataPersistenceInput,
  type HouseholdCatalogAdministrationTransaction,
  type HouseholdProductMetadataChanger,
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

  if (code === 'P5I01') {
    return new IdempotencyConflictError();
  }

  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }

  return new InternalApplicationError(error);
}

export class PgHouseholdProductMetadataChanger implements HouseholdProductMetadataChanger {
  async changeHouseholdProductMetadata(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: ChangeHouseholdProductMetadataPersistenceInput,
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
           from fridge_internal.change_household_product_metadata(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::text,
             $7::uuid,
             $8::uuid,
             $9::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.productId,
          input.canonicalName,
          input.brandId,
          input.manufacturerId,
          input.productCategoryId,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'CHANGED':
        if (outcome.result_product_id === null) {
          throw new InternalApplicationError(
            new Error('ChangeHouseholdProductMetadata succeeded without Product identity'),
          );
        }
        return ProductId(outcome.result_product_id);
      case 'INVALID_REFERENCE':
        throw new InvalidInputError('catalog reference is not eligible');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected ChangeHouseholdProductMetadata outcome'),
        );
    }
  }
}
