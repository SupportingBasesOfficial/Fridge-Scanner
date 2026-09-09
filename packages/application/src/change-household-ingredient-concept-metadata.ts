import type {
  CommandId,
  HouseholdId,
  IngredientConceptId,
  PrincipalId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { UseCase } from './index.js';
import type {
  HouseholdCatalogAdministrationTransaction,
  HouseholdCatalogAdministrationTransactionManager,
} from './household-catalog-administration.js';

export interface ChangeHouseholdIngredientConceptMetadataInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly ingredientConceptId: IngredientConceptId;
  readonly canonicalName: string;
}

export interface ChangeHouseholdIngredientConceptMetadataOutput {
  readonly ingredientConceptId: IngredientConceptId;
}

export interface ChangeHouseholdIngredientConceptMetadataPersistenceInput {
  readonly commandId: CommandId;
  readonly ingredientConceptId: IngredientConceptId;
  readonly canonicalName: string;
}

export interface HouseholdIngredientConceptMetadataChanger {
  changeHouseholdIngredientConceptMetadata(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: ChangeHouseholdIngredientConceptMetadataPersistenceInput,
  ): Promise<IngredientConceptId>;
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

export class ChangeHouseholdIngredientConceptMetadataUseCase
  implements
    UseCase<
      ChangeHouseholdIngredientConceptMetadataInput,
      ChangeHouseholdIngredientConceptMetadataOutput
    >
{
  constructor(
    private readonly transactions: HouseholdCatalogAdministrationTransactionManager,
    private readonly ingredientConcepts: HouseholdIngredientConceptMetadataChanger,
  ) {}

  async execute(
    input: ChangeHouseholdIngredientConceptMetadataInput,
  ): Promise<ChangeHouseholdIngredientConceptMetadataOutput> {
    const canonicalName = requireExactNonblank(
      input.canonicalName,
      'ingredient concept canonical name',
    );
    let ingredientConceptId: IngredientConceptId | undefined;

    await this.transactions.withHouseholdCatalogAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        ingredientConceptId =
          await this.ingredientConcepts.changeHouseholdIngredientConceptMetadata(transaction, {
            commandId: input.commandId,
            ingredientConceptId: input.ingredientConceptId,
            canonicalName,
          });
      },
    );

    if (ingredientConceptId === undefined) {
      throw new TypeError('Household IngredientConcept metadata changer did not return an identity');
    }

    return { ingredientConceptId };
  }
}
