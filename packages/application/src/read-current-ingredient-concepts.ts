import type { HouseholdId, IngredientConceptId, Instant, PrincipalId } from '@fridge/domain';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';

export type IngredientCatalogScope = 'GLOBAL' | 'HOUSEHOLD';

export interface CurrentIngredientConcept {
  readonly ingredientConceptId: IngredientConceptId;
  readonly catalogScope: IngredientCatalogScope;
  readonly ownerHouseholdId: HouseholdId | null;
  readonly canonicalName: string;
  readonly createdAt: Instant;
}

export interface ListCurrentIngredientConceptsInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
}

export interface GetCurrentIngredientConceptInput extends ListCurrentIngredientConceptsInput {
  readonly ingredientConceptId: IngredientConceptId;
}

export interface CurrentIngredientConceptReader {
  listCurrentIngredientConcepts(
    transaction: TransactionHandle,
  ): Promise<readonly CurrentIngredientConcept[]>;

  getCurrentIngredientConcept(
    transaction: TransactionHandle,
    ingredientConceptId: IngredientConceptId,
  ): Promise<CurrentIngredientConcept>;
}

export class ListCurrentIngredientConceptsUseCase
  implements
    UseCase<
      ListCurrentIngredientConceptsInput,
      { readonly ingredientConcepts: readonly CurrentIngredientConcept[] }
    >
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly ingredientConcepts: CurrentIngredientConceptReader,
  ) {}

  async execute(
    input: ListCurrentIngredientConceptsInput,
  ): Promise<{ readonly ingredientConcepts: readonly CurrentIngredientConcept[] }> {
    let ingredientConcepts: readonly CurrentIngredientConcept[] | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        ingredientConcepts =
          await this.ingredientConcepts.listCurrentIngredientConcepts(transaction);
      },
    );
    if (ingredientConcepts === undefined) {
      throw new TypeError('current IngredientConcept reader did not return a result');
    }
    return { ingredientConcepts };
  }
}

export class GetCurrentIngredientConceptUseCase
  implements
    UseCase<GetCurrentIngredientConceptInput, { readonly ingredientConcept: CurrentIngredientConcept }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly ingredientConcepts: CurrentIngredientConceptReader,
  ) {}

  async execute(
    input: GetCurrentIngredientConceptInput,
  ): Promise<{ readonly ingredientConcept: CurrentIngredientConcept }> {
    let ingredientConcept: CurrentIngredientConcept | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        ingredientConcept = await this.ingredientConcepts.getCurrentIngredientConcept(
          transaction,
          input.ingredientConceptId,
        );
      },
    );
    if (ingredientConcept === undefined) {
      throw new TypeError('current IngredientConcept reader did not return a result');
    }
    return { ingredientConcept };
  }
}
