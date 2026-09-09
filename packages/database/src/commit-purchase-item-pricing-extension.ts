import {
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  PurchaseItemMoneyFactId,
  PurchaseItemPricingDiscrepancyId,
  type CommitPurchaseItemPricingExtensionOutput,
  type CommitPurchaseItemPricingExtensionPersistenceInput,
  type HouseholdProcurementAdministrationTransaction,
  type HouseholdPurchaseItemPricingExtensionWriter,
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

interface PricingExtensionRow {
  readonly outcome_code: string;
  readonly result_purchase_item_money_fact_id: string | null;
  readonly result_purchase_item_pricing_discrepancy_id: string | null;
}

export class PgHouseholdPurchaseItemPricingExtensionWriter
  implements HouseholdPurchaseItemPricingExtensionWriter
{
  async commitPricingExtension(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CommitPurchaseItemPricingExtensionPersistenceInput,
  ): Promise<CommitPurchaseItemPricingExtensionOutput> {
    const client = requirePgClient(transaction);
    let row: PricingExtensionRow | undefined;
    try {
      const result = await client.query<PricingExtensionRow>(
        `select outcome_code,
                result_purchase_item_money_fact_id::text,
                result_purchase_item_pricing_discrepancy_id::text
           from fridge_internal.commit_purchase_item_pricing_extension(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::uuid,
             $7::uuid,
             $8::uuid,
             $9::uuid,
             $10::text
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.purchaseId,
          input.purchaseItemId,
          input.moneyRoundingPolicyId,
          input.candidatePurchaseItemMoneyFactId,
          input.candidatePricingDiscrepancyId,
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
          throw new InternalApplicationError(
            new Error('pricing extension boundary returned missing result identity'),
          );
        }
        return {
          purchaseItemMoneyFactId: PurchaseItemMoneyFactId(row.result_purchase_item_money_fact_id),
          pricingDiscrepancyId:
            row.result_purchase_item_pricing_discrepancy_id === null
              ? null
              : PurchaseItemPricingDiscrepancyId(
                  row.result_purchase_item_pricing_discrepancy_id,
                ),
        };
      case 'INVALID_INPUT':
        throw new InvalidInputError('purchase item pricing extension input is invalid');
      case 'UNSUPPORTED_POLICY':
        throw new InvalidInputError('money rounding policy algorithm/version is unsupported');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'CONFLICT':
        throw new ConflictError('pricing extension cannot be committed for this PurchaseItem');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(
          new Error('unexpected PurchaseItem pricing extension outcome'),
        );
    }
  }
}
