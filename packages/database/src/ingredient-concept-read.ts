import {
  DependencyUnavailableError,
  HouseholdId,
  HouseholdUnauthorizedError,
  IngredientConceptId,
  InternalApplicationError,
  NotFoundError,
  instant,
  type CurrentIngredientConcept,
  type CurrentIngredientConceptReader,
  type IngredientCatalogScope,
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

interface IngredientConceptRow {
  readonly ingredient_concept_id: string;
  readonly catalog_scope: string;
  readonly owner_household_id: string | null;
  readonly canonical_name: string;
  readonly created_at: Date;
}

function catalogScope(value: string): IngredientCatalogScope {
  if (value === 'GLOBAL' || value === 'HOUSEHOLD') return value;
  throw new InternalApplicationError(new Error('unexpected IngredientConcept catalog scope'));
}

function mapRow(row: IngredientConceptRow): CurrentIngredientConcept {
  try {
    const scope = catalogScope(row.catalog_scope);
    const ownerHouseholdId = row.owner_household_id === null ? null : HouseholdId(row.owner_household_id);
    if ((scope === 'GLOBAL') !== (ownerHouseholdId === null)) {
      throw new Error('inconsistent IngredientConcept scope ownership');
    }
    return {
      ingredientConceptId: IngredientConceptId(row.ingredient_concept_id),
      catalogScope: scope,
      ownerHouseholdId,
      canonicalName: row.canonical_name,
      createdAt: instant(row.created_at.toISOString()),
    };
  } catch (error) {
    if (error instanceof InternalApplicationError) throw error;
    throw new InternalApplicationError(error);
  }
}

export class PgCurrentIngredientConceptReader implements CurrentIngredientConceptReader {
  async listCurrentIngredientConcepts(
    transaction: TransactionHandle,
  ): Promise<readonly CurrentIngredientConcept[]> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        authorized: boolean;
        ingredient_concept_id: string | null;
        catalog_scope: string | null;
        owner_household_id: string | null;
        canonical_name: string | null;
        created_at: Date | null;
      }>;
    };

    try {
      result = await client.query(
        `select authorized,
                ingredient_concept_id::text,
                catalog_scope,
                owner_household_id::text,
                canonical_name,
                created_at
           from fridge_internal.list_current_ingredient_concepts(
             $1::uuid,
             $2::uuid,
             $3::uuid
           )
          order by ingredient_concept_id nulls last`,
        [transaction.householdId, transaction.principalId, transaction.membershipId],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    if (result.rows[0]?.authorized !== true) throw new HouseholdUnauthorizedError();

    return result.rows
      .filter((row) => row.ingredient_concept_id !== null)
      .map((row) => {
        if (
          row.ingredient_concept_id === null ||
          row.catalog_scope === null ||
          row.canonical_name === null ||
          row.created_at === null
        ) {
          throw new InternalApplicationError(new Error('incomplete current IngredientConcept row'));
        }
        return mapRow({
          ingredient_concept_id: row.ingredient_concept_id,
          catalog_scope: row.catalog_scope,
          owner_household_id: row.owner_household_id,
          canonical_name: row.canonical_name,
          created_at: row.created_at,
        });
      });
  }

  async getCurrentIngredientConcept(
    transaction: TransactionHandle,
    ingredientConceptId: IngredientConceptId,
  ): Promise<CurrentIngredientConcept> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        outcome_code: string;
        result_ingredient_concept_id: string | null;
        catalog_scope: string | null;
        owner_household_id: string | null;
        canonical_name: string | null;
        created_at: Date | null;
      }>;
    };

    try {
      result = await client.query(
        `select outcome_code,
                result_ingredient_concept_id::text,
                catalog_scope,
                owner_household_id::text,
                canonical_name,
                created_at
           from fridge_internal.get_current_ingredient_concept(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid
           )`,
        [
          transaction.householdId,
          transaction.principalId,
          transaction.membershipId,
          ingredientConceptId,
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
        throw new NotFoundError();
      case 'FOUND':
        if (
          row.result_ingredient_concept_id === null ||
          row.catalog_scope === null ||
          row.canonical_name === null ||
          row.created_at === null
        ) {
          throw new InternalApplicationError(new Error('incomplete current IngredientConcept row'));
        }
        return mapRow({
          ingredient_concept_id: row.result_ingredient_concept_id,
          catalog_scope: row.catalog_scope,
          owner_household_id: row.owner_household_id,
          canonical_name: row.canonical_name,
          created_at: row.created_at,
        });
      default:
        throw new InternalApplicationError(new Error('unexpected current IngredientConcept read outcome'));
    }
  }
}
