import {
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  PurchaseReceivingExceptionResolutionId,
  type HouseholdOverReceiptNonphysicalResolver,
  type HouseholdProcurementAdministrationTransaction,
  type NonphysicalOverReceiptResolutionKind,
  type ResolveOverReceiptWithoutIngressOutput,
  type ResolveOverReceiptWithoutIngressPersistenceInput,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

function normalizeFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';
  if (code === 'P6I01') return new IdempotencyConflictError();
  if (code === 'P6R01' || code === 'P6R02') {
    return new ConflictError('ReceiptItemIntent cannot be physically materialized');
  }
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

interface ResolutionRow {
  readonly outcome_code: string;
  readonly result_purchase_receiving_exception_resolution_id: string | null;
  readonly result_resolution_kind: string | null;
}

function isResolutionKind(value: string): value is NonphysicalOverReceiptResolutionKind {
  return value === 'REJECTED_NO_INGRESS' || value === 'SUPERSEDED_DETECTION';
}

export class PgHouseholdOverReceiptNonphysicalResolver implements HouseholdOverReceiptNonphysicalResolver {
  async resolveOverReceiptWithoutIngress(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: ResolveOverReceiptWithoutIngressPersistenceInput,
  ): Promise<ResolveOverReceiptWithoutIngressOutput> {
    const client = requirePgClient(transaction);
    let rows: readonly ResolutionRow[];
    try {
      const result = await client.query<ResolutionRow>(
        `select outcome_code,
                result_purchase_receiving_exception_resolution_id::text,
                result_resolution_kind
           from fridge_internal.resolve_over_receipt_without_ingress(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
             $6::text, $7::text, $8::text, $9::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.purchaseReceivingExceptionId,
          input.resolutionKind,
          input.reason,
          input.provenance,
          input.candidatePurchaseReceivingExceptionResolutionId,
        ],
      );
      rows = result.rows;
    } catch (error) {
      throw normalizeFailure(error);
    }

    const outcome = rows[0];
    switch (outcome?.outcome_code) {
      case 'RESOLVED':
        if (
          outcome.result_purchase_receiving_exception_resolution_id === null ||
          outcome.result_resolution_kind === null ||
          !isResolutionKind(outcome.result_resolution_kind)
        ) {
          throw new InternalApplicationError(new Error('nonphysical over-receipt resolution succeeded without complete result'));
        }
        return {
          purchaseReceivingExceptionResolutionId: PurchaseReceivingExceptionResolutionId(
            outcome.result_purchase_receiving_exception_resolution_id,
          ),
          resolutionKind: outcome.result_resolution_kind,
        };
      case 'INVALID_INPUT':
        throw new InvalidInputError('nonphysical over-receipt resolution input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'CONFLICT':
        throw new ConflictError('detected over-receipt cannot be resolved without ingress');
      case 'STILL_OVER_RECEIPT':
        throw new ConflictError('detected over-receipt is still required by current receiving truth');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected nonphysical over-receipt resolution outcome'));
    }
  }
}
