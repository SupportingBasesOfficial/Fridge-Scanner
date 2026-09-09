import {
  ConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  PurchaseItemMoneyFactId,
  type CommitPurchaseItemSourceMoneyFactsOutput,
  type CommitPurchaseItemSourceMoneyFactsPersistenceInput,
  type HouseholdProcurementAdministrationTransaction,
  type HouseholdPurchaseItemSourceMoneyWriter,
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

interface SourceMoneyRow {
  readonly outcome_code: string;
  readonly line_no: number | null;
  readonly result_purchase_item_money_fact_id: string | null;
}

export class PgHouseholdPurchaseItemSourceMoneyWriter
  implements HouseholdPurchaseItemSourceMoneyWriter
{
  async commitSourceMoneyFacts(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CommitPurchaseItemSourceMoneyFactsPersistenceInput,
  ): Promise<CommitPurchaseItemSourceMoneyFactsOutput> {
    const client = requirePgClient(transaction);
    const factsJson = JSON.stringify(
      input.facts.map((fact) => ({
        candidatePurchaseItemMoneyFactId: fact.candidatePurchaseItemMoneyFactId,
        semanticRole: fact.semanticRole,
        amount: fact.amount,
        provenance: fact.provenance,
      })),
    );

    let rows: readonly SourceMoneyRow[];
    try {
      const result = await client.query<SourceMoneyRow>(
        `select outcome_code,
                line_no,
                result_purchase_item_money_fact_id::text
           from fridge_internal.commit_purchase_item_source_money_facts(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             $6::uuid,
             $7::jsonb
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          input.commandId,
          input.purchaseId,
          input.purchaseItemId,
          factsJson,
        ],
      );
      rows = result.rows;
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const first = rows[0];
    switch (first?.outcome_code) {
      case 'COMMITTED': {
        const ordered = [...rows].sort((left, right) => (left.line_no ?? 0) - (right.line_no ?? 0));
        if (ordered.length !== input.facts.length) {
          throw new InternalApplicationError(new Error('source money boundary returned unexpected fact cardinality'));
        }
        return {
          purchaseItemMoneyFactIds: ordered.map((row, index) => {
            if (
              row.outcome_code !== 'COMMITTED' ||
              row.line_no !== index + 1 ||
              row.result_purchase_item_money_fact_id === null
            ) {
              throw new InternalApplicationError(new Error('source money boundary returned malformed ordered result'));
            }
            return PurchaseItemMoneyFactId(row.result_purchase_item_money_fact_id);
          }),
        };
      }
      case 'INVALID_INPUT':
        throw new InvalidInputError('purchase item source money input is invalid');
      case 'NOT_FOUND':
        throw new NotFoundError();
      case 'CONFLICT':
        throw new ConflictError('source money role was already committed for this PurchaseItem');
      case 'IDEMPOTENCY_CONFLICT':
        throw new IdempotencyConflictError();
      case 'UNAUTHORIZED':
        throw new HouseholdAuthorizationError();
      default:
        throw new InternalApplicationError(new Error('unexpected PurchaseItem source money outcome'));
    }
  }
}
