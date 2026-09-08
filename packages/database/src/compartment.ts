import {
  CompartmentId,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  type CompartmentWriter,
  type CreateCompartmentPersistenceInput,
  type HouseholdStorageAdministrationTransaction,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

function normalizeCompartmentDatabaseFailure(error: unknown): Error {
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

export class PgCompartmentWriter implements CompartmentWriter {
  async createCompartment(
    transaction: HouseholdStorageAdministrationTransaction,
    input: CreateCompartmentPersistenceInput,
  ): Promise<CompartmentId> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        readonly outcome_code: string;
        readonly result_compartment_id: string | null;
      }>;
    };

    try {
      result = await client.query(
        `select outcome_code,
                result_compartment_id::text
           from fridge_internal.create_compartment(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::uuid,
             $7::text,
             $8::text,
             $9::integer
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidateCompartmentId,
          input.storageLocationId,
          input.kindCode,
          input.displayName,
          input.sortOrder,
        ],
      );
    } catch (error) {
      throw normalizeCompartmentDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'CREATED':
        if (outcome.result_compartment_id === null) {
          throw new InternalApplicationError(new Error('CreateCompartment succeeded without identity'));
        }
        return CompartmentId(outcome.result_compartment_id);
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'INVALID_KIND':
        throw new InvalidInputError('compartment kind is not eligible');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected CreateCompartment outcome'));
    }
  }
}
