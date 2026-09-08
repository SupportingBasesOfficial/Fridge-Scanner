import {
  BrandId,
  DependencyUnavailableError,
  HouseholdId,
  HouseholdUnauthorizedError,
  InternalApplicationError,
  ManufacturerId,
  NotFoundError,
  ProductCategoryId,
  ProductId,
  instant,
  type CatalogScope,
  type CurrentProduct,
  type CurrentProductReader,
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

interface ProductRow {
  readonly product_id: string;
  readonly catalog_scope: string;
  readonly owner_household_id: string | null;
  readonly canonical_name: string;
  readonly brand_id: string | null;
  readonly manufacturer_id: string | null;
  readonly product_category_id: string | null;
  readonly created_at: Date;
}

function catalogScope(value: string): CatalogScope {
  if (value === 'GLOBAL' || value === 'HOUSEHOLD') return value;
  throw new InternalApplicationError(new Error('unexpected Product catalog scope'));
}

function mapRow(row: ProductRow): CurrentProduct {
  try {
    const scope = catalogScope(row.catalog_scope);
    const ownerHouseholdId = row.owner_household_id === null ? null : HouseholdId(row.owner_household_id);
    if ((scope === 'GLOBAL') !== (ownerHouseholdId === null)) {
      throw new Error('inconsistent Product scope ownership');
    }
    return {
      productId: ProductId(row.product_id),
      catalogScope: scope,
      ownerHouseholdId,
      canonicalName: row.canonical_name,
      brandId: row.brand_id === null ? null : BrandId(row.brand_id),
      manufacturerId: row.manufacturer_id === null ? null : ManufacturerId(row.manufacturer_id),
      productCategoryId:
        row.product_category_id === null ? null : ProductCategoryId(row.product_category_id),
      createdAt: instant(row.created_at.toISOString()),
    };
  } catch (error) {
    if (error instanceof InternalApplicationError) throw error;
    throw new InternalApplicationError(error);
  }
}

export class PgCurrentProductReader implements CurrentProductReader {
  async listCurrentProducts(transaction: TransactionHandle): Promise<readonly CurrentProduct[]> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        authorized: boolean;
        product_id: string | null;
        catalog_scope: string | null;
        owner_household_id: string | null;
        canonical_name: string | null;
        brand_id: string | null;
        manufacturer_id: string | null;
        product_category_id: string | null;
        created_at: Date | null;
      }>;
    };

    try {
      result = await client.query(
        `select authorized,
                product_id::text,
                catalog_scope,
                owner_household_id::text,
                canonical_name,
                brand_id::text,
                manufacturer_id::text,
                product_category_id::text,
                created_at
           from fridge_internal.list_current_products(
             $1::uuid,
             $2::uuid,
             $3::uuid
           )`,
        [transaction.householdId, transaction.principalId, transaction.membershipId],
      );
    } catch (error) {
      throw normalizeDatabaseFailure(error);
    }

    if (result.rows[0]?.authorized !== true) {
      throw new HouseholdUnauthorizedError();
    }

    return result.rows
      .filter((row) => row.product_id !== null)
      .map((row) => {
        if (
          row.product_id === null ||
          row.catalog_scope === null ||
          row.canonical_name === null ||
          row.created_at === null
        ) {
          throw new InternalApplicationError(new Error('incomplete current Product row'));
        }
        return mapRow({
          product_id: row.product_id,
          catalog_scope: row.catalog_scope,
          owner_household_id: row.owner_household_id,
          canonical_name: row.canonical_name,
          brand_id: row.brand_id,
          manufacturer_id: row.manufacturer_id,
          product_category_id: row.product_category_id,
          created_at: row.created_at,
        });
      });
  }

  async getCurrentProduct(
    transaction: TransactionHandle,
    productId: ProductId,
  ): Promise<CurrentProduct> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: Array<{
        outcome_code: string;
        result_product_id: string | null;
        catalog_scope: string | null;
        owner_household_id: string | null;
        canonical_name: string | null;
        brand_id: string | null;
        manufacturer_id: string | null;
        product_category_id: string | null;
        created_at: Date | null;
      }>;
    };

    try {
      result = await client.query(
        `select outcome_code,
                result_product_id::text,
                catalog_scope,
                owner_household_id::text,
                canonical_name,
                brand_id::text,
                manufacturer_id::text,
                product_category_id::text,
                created_at
           from fridge_internal.get_current_product(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid
           )`,
        [transaction.householdId, transaction.principalId, transaction.membershipId, productId],
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
          row.result_product_id === null ||
          row.catalog_scope === null ||
          row.canonical_name === null ||
          row.created_at === null
        ) {
          throw new InternalApplicationError(new Error('incomplete current Product row'));
        }
        return mapRow({
          product_id: row.result_product_id,
          catalog_scope: row.catalog_scope,
          owner_household_id: row.owner_household_id,
          canonical_name: row.canonical_name,
          brand_id: row.brand_id,
          manufacturer_id: row.manufacturer_id,
          product_category_id: row.product_category_id,
          created_at: row.created_at,
        });
      default:
        throw new InternalApplicationError(new Error('unexpected current Product read outcome'));
    }
  }
}
