import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  NotFoundError,
  StagedIdentifierClaimId,
  type ObserveProductIdentifierPersistenceInput,
  type ProductIdentifierObservationWriter,
  type TransactionHandle,
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

export class PgProductIdentifierObservationWriter implements ProductIdentifierObservationWriter {
  async observeProductIdentifier(
    transaction: TransactionHandle,
    input: ObserveProductIdentifierPersistenceInput,
  ): Promise<StagedIdentifierClaimId> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        readonly outcome_code: string;
        readonly result_staged_identifier_claim_id: string | null;
      }>;
    };

    try {
      result = await client.query<{
        outcome_code: string;
        result_staged_identifier_claim_id: string | null;
      }>(
        `select outcome_code,
                result_staged_identifier_claim_id::text
           from fridge_internal.observe_product_identifier(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
             $6::uuid, $7::text, $8::text, $9::text, $10::timestamptz
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidateStagedIdentifierClaimId,
          input.candidateProductId,
          input.schemeCode,
          input.issuerNamespace,
          input.sourceValue,
          input.observedAt,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'OBSERVED':
        if (outcome.result_staged_identifier_claim_id === null) {
          throw new InternalApplicationError(
            new Error('ObserveProductIdentifier succeeded without staged claim identity'),
          );
        }
        return StagedIdentifierClaimId(outcome.result_staged_identifier_claim_id);
      case 'CANDIDATE_NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected ObserveProductIdentifier outcome'),
        );
    }
  }
}
