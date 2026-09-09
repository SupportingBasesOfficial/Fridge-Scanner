import type {
  CommandId,
  HouseholdId,
  IngredientConceptId,
  PrincipalId,
} from '@fridge/domain';
import type { UseCase } from './index.js';
import type {
  HouseholdCatalogAdministrationTransaction,
  HouseholdCatalogAdministrationTransactionManager,
} from './household-catalog-administration.js';

export interface RetireHouseholdIngredientConceptInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly ingredientConceptId: IngredientConceptId;
}

export interface RetireHouseholdIngredientConceptOutput {
  readonly ingredientConceptId: IngredientConceptId;
}

export interface RetireHouseholdIngredientConceptPersistenceInput {
  readonly commandId: CommandId;
  readonly ingredientConceptId: IngredientConceptId;
}

export interface HouseholdIngredientConceptRetirer {
  retireHouseholdIngredientConcept(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: RetireHouseholdIngredientConceptPersistenceInput,
  ): Promise<IngredientConceptId>;
}

export class RetireHouseholdIngredientConceptUseCase
  implements UseCase<RetireHouseholdIngredientConceptInput, RetireHouseholdIngredientConceptOutput>
{
  constructor(
    private readonly transactions: HouseholdCatalogAdministrationTransactionManager,
    private readonly ingredientConcepts: HouseholdIngredientConceptRetirer,
  ) {}

  async execute(
    input: RetireHouseholdIngredientConceptInput,
  ): Promise<RetireHouseholdIngredientConceptOutput> {
    let ingredientConceptId: IngredientConceptId | undefined;

    await this.transactions.withHouseholdCatalogAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        ingredientConceptId = await this.ingredientConcepts.retireHouseholdIngredientConcept(
          transaction,
          {
            commandId: input.commandId,
            ingredientConceptId: input.ingredientConceptId,
          },
        );
      },
    );

    if (ingredientConceptId === undefined) {
      throw new TypeError('Household IngredientConcept retirer did not return an identity');
    }

    return { ingredientConceptId };
  }
}
