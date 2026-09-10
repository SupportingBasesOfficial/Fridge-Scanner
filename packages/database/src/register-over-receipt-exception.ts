import {
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  MeasurementUnitId,
  NotFoundError,
  PurchaseReceivingExceptionId,
  exactRational,
  type HouseholdOverReceiptExceptionRegistrar,
  type HouseholdProcurementAdministrationTransaction,
  type RegisterOverReceiptExceptionOutput,
  type RegisterOverReceiptExceptionPersistenceInput,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);
const INTEGRAL_NUMERIC_TEXT = /^([+-]?\d+)(?:\.0+)?$/;

function parseIntegralNumeric(value: string): bigint {
  const match = INTEGRAL_NUMERIC_TEXT.exec(value);
  if (match === null || match[1] === undefined) {
    throw new InternalApplicationError(
      new Error('database returned a non-integral rational component'),
    );
  }
  return BigInt(match[1]);
}

function normalizeFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';

  if (code === 'P6I01') return new IdempotencyConflictError();
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

interface RegistrationRow {
  readonly outcome_code: string;
  readonly result_purchase_receiving_exception_id: string | null;
  readonly result_discrepant_quantity_num: string | null;
  readonly result_discrepant_quantity_den: string | null;
  readonly result_discrepant_unit_id: string | null;
}

export class PgHouseholdOverReceiptExceptionRegistrar
  implements HouseholdOverReceiptExceptionRegistrar
{
  async registerOverReceiptException(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: RegisterOverReceiptExceptionPersistenceInput,
  ): Promise<RegisterOverReceiptExceptionOutput> {
    const client = requirePgClient(transaction);

    let rows: readonly RegistrationRow[];
    try {
      const result = await client.query<RegistrationRow>(
        `select outcome_code,
                result_purchase_receiving_exception_id::text,
                result_discrepant_quantity_num::text,
                result_discrepant_quantity_den::text,
                result_discrepant_unit_id::text
           from fridge_internal.register_over_receipt_exception(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
             $6::uuid, $7::uuid, $8::text, $9::text, $10::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.receiptItemIntentId,
          input.purchaseItemId,
          input.allocationConversionEvidenceId ?? null,
          input.reason,
          input.provenance,
          input.candidatePurchaseReceivingExceptionId,
        ],
      );
      rows = result.rows;
    } catch (error) {
      throw normalizeFailure(error);
    }

    const outcome = rows[0];
    switch (outcome?.outcome_code) {
      case 'REGISTERED':
        if (
          outcome.result_purchase_receiving_exception_id === null ||
          outcome.result_discrepant_quantity_num === null ||
          outcome.result_discrepant_quantity_den === null ||
          outcome.result_discrepant_unit_id === null
        ) {
          throw new InternalApplicationError(
            new Error('over-receipt registration succeeded without complete discrepancy result'),
          );
        }
        return {
          purchaseReceivingExceptionId: PurchaseReceivingExceptionId(
            outcome.result_purchase_receiving_exception_id,
          ),
          discrepantQuantity: exactRational(
            parseIntegralNumeric(outcome.result_discrepant_quantity_num),
            parseIntegralNumeric(outcome.result_discrepant_quantity_den),
          ),
          discrepantUnitId: MeasurementUnitId(outcome.result_discrepant_unit_id),
        };
      case 'INVALID_INPUT':
        throw new InvalidInputError('over-receipt exception input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'CONFLICT':
        throw new ConflictError('ReceiptItem intent cannot register an over-receipt exception');
      case 'NO_OVER_RECEIPT':
        throw new ConflictError('ReceiptItem intent does not currently exceed PurchaseItem receiving availability');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected over-receipt registration outcome'));
    }
  }
}
