import type {
  CommandId,
  HouseholdId,
  PrincipalId,
  ProductId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdCatalogAdministrationTransaction,
  HouseholdCatalogAdministrationTransactionManager,
} from './household-catalog-administration.js';

export interface CreateHouseholdProductInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly canonicalName: string;
}

export interface CreateHouseholdProductOutput {
  readonly productId: ProductId;
}

export interface CreateHouseholdProductPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateProductId: ProductId;
  readonly canonicalName: string;
}

export interface HouseholdProductWriter {
  createHouseholdProduct(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: CreateHouseholdProductPersistenceInput,
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

export class CreateHouseholdProductUseCase
  implements UseCase<CreateHouseholdProductInput, CreateHouseholdProductOutput>
{
  constructor(
    private readonly transactions: HouseholdCatalogAdministrationTransactionManager,
    private readonly products: HouseholdProductWriter,
    private readonly productIds: IdentifierGenerator<ProductId>,
  ) {}

  async execute(input: CreateHouseholdProductInput): Promise<CreateHouseholdProductOutput> {
    const canonicalName = requireExactNonblank(input.canonicalName, 'product canonical name');
    const candidateProductId = this.productIds.generate();
    let productId: ProductId | undefined;

    await this.transactions.withHouseholdCatalogAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        productId = await this.products.createHouseholdProduct(transaction, {
          commandId: input.commandId,
          candidateProductId,
          canonicalName,
        });
      },
    );

    if (productId === undefined) {
      throw new TypeError('Household Product writer did not return an identity');
    }

    return { productId };
  }
}
