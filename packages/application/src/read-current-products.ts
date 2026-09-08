import type {
  BrandId,
  HouseholdId,
  Instant,
  ManufacturerId,
  PrincipalId,
  ProductCategoryId,
  ProductId,
} from '@fridge/domain';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';

export type CatalogScope = 'GLOBAL' | 'HOUSEHOLD';

export interface CurrentProduct {
  readonly productId: ProductId;
  readonly catalogScope: CatalogScope;
  readonly ownerHouseholdId: HouseholdId | null;
  readonly canonicalName: string;
  readonly brandId: BrandId | null;
  readonly manufacturerId: ManufacturerId | null;
  readonly productCategoryId: ProductCategoryId | null;
  readonly createdAt: Instant;
}

export interface ListCurrentProductsInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
}

export interface GetCurrentProductInput extends ListCurrentProductsInput {
  readonly productId: ProductId;
}

export interface CurrentProductReader {
  listCurrentProducts(transaction: TransactionHandle): Promise<readonly CurrentProduct[]>;

  getCurrentProduct(
    transaction: TransactionHandle,
    productId: ProductId,
  ): Promise<CurrentProduct>;
}

export class ListCurrentProductsUseCase
  implements UseCase<ListCurrentProductsInput, { readonly products: readonly CurrentProduct[] }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly products: CurrentProductReader,
  ) {}

  async execute(input: ListCurrentProductsInput): Promise<{ readonly products: readonly CurrentProduct[] }> {
    let products: readonly CurrentProduct[] | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        products = await this.products.listCurrentProducts(transaction);
      },
    );
    if (products === undefined) {
      throw new TypeError('current Product reader did not return a result');
    }
    return { products };
  }
}

export class GetCurrentProductUseCase
  implements UseCase<GetCurrentProductInput, { readonly product: CurrentProduct }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly products: CurrentProductReader,
  ) {}

  async execute(input: GetCurrentProductInput): Promise<{ readonly product: CurrentProduct }> {
    let product: CurrentProduct | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        product = await this.products.getCurrentProduct(transaction, input.productId);
      },
    );
    if (product === undefined) {
      throw new TypeError('current Product reader did not return a result');
    }
    return { product };
  }
}
