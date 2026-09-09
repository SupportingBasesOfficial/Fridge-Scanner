import {
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  PurchaseItemMoneyFactId,
  type CommitPurchaseItemPricingBasisOutput,
  type CommitPurchaseItemPricingBasisPersistenceInput,
  type HouseholdProcurementAdministrationTransaction,
  type HouseholdPurchaseItemPricingBasisWriter,
} from '@fridge/application';
import { HouseholdAuthorizationError, requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

function normalizeDatabaseFailure(error: unknown): Error {
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

interface PricingBasisRow {
  readonly outcome_code: string;
  readonly result_purchase_item_money_fact_id: string | null;
}

export class PgHouseholdPurchaseItemPricingBasisWriter
  implements HouseholdPurchaseItemPricingBasisWriter
{
  async commitPricingBasis(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CommitPurchaseItemPricingBasisPersistenceInput,
  ): Promise<CommitPurchaseItemPricingBasisOutput> {
    const client = requirePgClient(transaction);
    let row: PricingBasisRow | undefined;
    try {
      const result = await client.query<PricingBasisRow>(
        `select outcome_code,
                result_purchase_item_money_fact_id::text
           from fridge_internal.commit_purchase_item_pricing_basis(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::uuid,
             $7::numeric,
             $8::numeric,
             $9::uuid,
             $10::uuid,
             $11::uuid,
             $12::text,
             $13::text
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.purchaseId,
          input.purchaseItemId,
          input.pricingBasisQuantityNumerator,
          input.pricingBasisQuantityDenominator,
          input.pricingBasisUnitId,
          input.pricingConversionEvidenceId ?? null,
          input.candidatePurchaseItemMoneyFactId,
          input.basisAmount,
          input.provenance,
        ],
      );
      row = result.rows[0];
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    switch (row?.outcome_code) {
      case 'COMMITTED':
        if (row.result_purchase_item_money_fact_id === null) {
          throw new InternalApplicationError(new Error('pricing basis boundary returned missing result identity'));
        }
        return { purchaseItemMoneyFactId: PurchaseItemMoneyFactId(row.result_purchase_item_money_fact_id) };
      case 'INVALID_INPUT':
        throw new InvalidInputError('purchase item pricing basis input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'CONFLICT':
        throw new ConflictError('pricing basis was already committed for this PurchaseItem');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected PurchaseItem pricing basis outcome'));
    }
  }
}
