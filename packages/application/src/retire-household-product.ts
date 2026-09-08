import type {
  CommandId,
  HouseholdId,
  PrincipalId,
  ProductId,
} from '@fridge/domain';
import type { UseCase } from './index.js';
import type {
  HouseholdCatalogAdministrationTransaction,
  HouseholdCatalogAdministrationTransactionManager,
} from './household-catalog-administration.js';

export interface RetireHouseholdProductInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly productId: ProductId;
}

export interface RetireHouseholdProductOutput {
  readonly productId: ProductId;
}

export interface RetireHouseholdProductPersistenceInput {
  readonly commandId: CommandId;
  readonly productId: ProductId;
}

export interface HouseholdProductRetirer {
  retireHouseholdProduct(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: RetireHouseholdProductPersistenceInput,
  ): Promise<ProductId>;
}

export class RetireHouseholdProductUseCase
  implements UseCase<RetireHouseholdProductInput, RetireHouseholdProductOutput>
{
  constructor(
    private readonly transactions: HouseholdCatalogAdministrationTransactionManager,
    private readonly products: HouseholdProductRetirer,
  ) {}

  async execute(input: RetireHouseholdProductInput): Promise<RetireHouseholdProductOutput> {
    let productId: ProductId | undefined;

    await this.transactions.withHouseholdCatalogAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        productId = await this.products.retireHouseholdProduct(transaction, {
          commandId: input.commandId,
          productId: input.productId,
        });
      },
    );

    if (productId === undefined) {
      throw new TypeError('Household Product retirer did not return an identity');
    }

    return { productId };
  }
}
