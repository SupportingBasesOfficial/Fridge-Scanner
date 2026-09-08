import type {
  CommandId,
  HouseholdId,
  IngredientConceptId,
  PrincipalId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdCatalogAdministrationTransaction,
  HouseholdCatalogAdministrationTransactionManager,
} from './household-catalog-administration.js';

export interface CreateHouseholdIngredientConceptInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly canonicalName: string;
}

export interface CreateHouseholdIngredientConceptOutput {
  readonly ingredientConceptId: IngredientConceptId;
}

export interface CreateHouseholdIngredientConceptPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateIngredientConceptId: IngredientConceptId;
  readonly canonicalName: string;
}

export interface HouseholdIngredientConceptWriter {
  createHouseholdIngredientConcept(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: CreateHouseholdIngredientConceptPersistenceInput,
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

export class CreateHouseholdIngredientConceptUseCase
  implements UseCase<CreateHouseholdIngredientConceptInput, CreateHouseholdIngredientConceptOutput>
{
  constructor(
    private readonly transactions: HouseholdCatalogAdministrationTransactionManager,
    private readonly ingredientConcepts: HouseholdIngredientConceptWriter,
    private readonly ingredientConceptIds: IdentifierGenerator<IngredientConceptId>,
  ) {}

  async execute(
    input: CreateHouseholdIngredientConceptInput,
  ): Promise<CreateHouseholdIngredientConceptOutput> {
    const canonicalName = requireExactNonblank(
      input.canonicalName,
      'ingredient concept canonical name',
    );
    const candidateIngredientConceptId = this.ingredientConceptIds.generate();
    let ingredientConceptId: IngredientConceptId | undefined;

    await this.transactions.withHouseholdCatalogAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        ingredientConceptId = await this.ingredientConcepts.createHouseholdIngredientConcept(
          transaction,
          {
            commandId: input.commandId,
            candidateIngredientConceptId,
            canonicalName,
          },
        );
      },
    );

    if (ingredientConceptId === undefined) {
      throw new TypeError('Household IngredientConcept writer did not return an identity');
    }

    return { ingredientConceptId };
  }
}
