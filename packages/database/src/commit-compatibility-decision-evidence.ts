import {
  CompatibilityEvidenceId,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  NotFoundError,
  instant,
  type CommitCompatibilityDecisionEvidenceOutput,
  type CommitCompatibilityDecisionEvidencePersistenceInput,
  type CompatibilityDecisionEvidenceWriter,
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

export class PgCompatibilityDecisionEvidenceWriter implements CompatibilityDecisionEvidenceWriter {
  async commitCompatibilityDecisionEvidence(
    transaction: TransactionHandle,
    input: CommitCompatibilityDecisionEvidencePersistenceInput,
  ): Promise<CommitCompatibilityDecisionEvidenceOutput> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        readonly outcome_code: string;
        readonly result_compatibility_evidence_id: string | null;
        readonly result_evaluation_anchor: Date | null;
      }>;
    };

    try {
      result = await client.query<{
        outcome_code: string;
        result_compatibility_evidence_id: string | null;
        result_evaluation_anchor: Date | null;
      }>(
        `select outcome_code,
                result_compatibility_evidence_id::text,
                result_evaluation_anchor
           from fridge_internal.commit_compatibility_decision_evidence(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::text
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.candidateCompatibilityEvidenceId,
          input.compatibilityMappingId,
          input.provenance,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const outcome = result.rows[0];
    switch (outcome?.outcome_code) {
      case 'COMMITTED':
        if (
          outcome.result_compatibility_evidence_id === null ||
          outcome.result_evaluation_anchor === null
        ) {
          throw new InternalApplicationError(
            new Error('CommitCompatibilityDecisionEvidence succeeded without evidence identity/anchor'),
          );
        }
        return {
          compatibilityEvidenceId: CompatibilityEvidenceId(
            outcome.result_compatibility_evidence_id,
          ),
          evaluationAnchor: instant(outcome.result_evaluation_anchor.toISOString()),
        };
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected CommitCompatibilityDecisionEvidence outcome'),
        );
    }
  }
}
