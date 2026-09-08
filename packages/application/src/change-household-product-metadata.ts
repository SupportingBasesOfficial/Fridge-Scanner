import type {
  BrandId,
  CommandId,
  HouseholdId,
  ManufacturerId,
  PrincipalId,
  ProductCategoryId,
  ProductId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { UseCase } from './index.js';
import type {
  HouseholdCatalogAdministrationTransaction,
  HouseholdCatalogAdministrationTransactionManager,
} from './household-catalog-administration.js';

export interface ChangeHouseholdProductMetadataInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly productId: ProductId;
  readonly canonicalName: string;
  readonly brandId: BrandId | null;
  readonly manufacturerId: ManufacturerId | null;
  readonly productCategoryId: ProductCategoryId | null;
}

export interface ChangeHouseholdProductMetadataOutput {
  readonly productId: ProductId;
}

export interface ChangeHouseholdProductMetadataPersistenceInput {
  readonly commandId: CommandId;
  readonly productId: ProductId;
  readonly canonicalName: string;
  readonly brandId: BrandId | null;
  readonly manufacturerId: ManufacturerId | null;
  readonly productCategoryId: ProductCategoryId | null;
}

export interface HouseholdProductMetadataChanger {
  changeHouseholdProductMetadata(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: ChangeHouseholdProductMetadataPersistenceInput,
  ): Promise<ProductId>;
}

function requireExactNonblank(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new InvalidInputError(`${label} must be a nonblank exact value`);
  }
  return value;
}

export class ChangeHouseholdProductMetadataUseCase
  implements UseCase<ChangeHouseholdProductMetadataInput, ChangeHouseholdProductMetadataOutput>
{
  constructor(
    private readonly transactions: HouseholdCatalogAdministrationTransactionManager,
    private readonly products: HouseholdProductMetadataChanger,
  ) {}

  async execute(input: ChangeHouseholdProductMetadataInput): Promise<ChangeHouseholdProductMetadataOutput> {
    const canonicalName = requireExactNonblank(input.canonicalName, 'product canonical name');
    let productId: ProductId | undefined;

    await this.transactions.withHouseholdCatalogAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        productId = await this.products.changeHouseholdProductMetadata(transaction, {
          commandId: input.commandId,
          productId: input.productId,
          canonicalName,
          brandId: input.brandId,
          manufacturerId: input.manufacturerId,
          productCategoryId: input.productCategoryId,
        });
      },
    );

    if (productId === undefined) {
      throw new TypeError('Household Product metadata changer did not return an identity');
    }

    return { productId };
  }
}
