import {
  DependencyUnavailableError,
  HouseholdUnauthorizedError,
  InternalApplicationError,
  ProductId,
  ProductIdentifierId,
  type ProductIdentifierResolutionKey,
  type ProductIdentifierResolver,
  type ResolvedProductIdentifier,
  type TransactionHandle,
} from '@fridge/application';
import { requirePgClient } from './index.js';

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

function normalizeDatabaseFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';
  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }
  return new InternalApplicationError(error);
}

export class PgProductIdentifierResolver implements ProductIdentifierResolver {
  async resolveProductIdentifier(
    transaction: TransactionHandle,
    key: ProductIdentifierResolutionKey,
  ): Promise<ResolvedProductIdentifier | null> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        outcome_code: string;
        result_product_identifier_id: string | null;
        result_product_id: string | null;
      }>;
    };

    try {
      result = await client.query(
        `select outcome_code,
                result_product_identifier_id::text,
                result_product_id::text
           from fridge_internal.resolve_current_product_identifier(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::text,
             $5::text,
             $6::uuid,
             $7::text
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          key.schemeCode,
          key.issuerNamespace,
          key.normalizationRuleId,
          key.normalizedValue,
        ],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    const row = result.rows[0];
    switch (row?.outcome_code) {
      case 'UNAUTHORIZED':
        throw new HouseholdUnauthorizedError();
      case 'NOT_FOUND':
        return null;
      case 'FOUND':
        if (row.result_product_identifier_id === null || row.result_product_id === null) {
          throw new InternalApplicationError(new Error('incomplete ProductIdentifier resolution row'));
        }
        try {
          return {
            productIdentifierId: ProductIdentifierId(row.result_product_identifier_id),
            productId: ProductId(row.result_product_id),
          };
        } catch (error) {
          throw new InternalApplicationError(error);
        }
      default:
        throw new InternalApplicationError(new Error('unexpected ProductIdentifier resolution outcome'));
    }
  }
}
