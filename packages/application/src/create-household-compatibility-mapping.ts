import type {
  CommandId,
  CompatibilityMappingFamilyId,
  CompatibilityMappingId,
  HouseholdId,
  IngredientConceptId,
  PrincipalId,
  ProductId,
} from '@fridge/domain';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdCatalogAdministrationTransaction,
  HouseholdCatalogAdministrationTransactionManager,
} from './household-catalog-administration.js';

export interface CreateHouseholdCompatibilityMappingInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly productId: ProductId;
  readonly ingredientConceptId: IngredientConceptId;
}

export interface CreateHouseholdCompatibilityMappingOutput {
  readonly mappingFamilyId: CompatibilityMappingFamilyId;
  readonly compatibilityMappingId: CompatibilityMappingId;
}

export interface CreateHouseholdCompatibilityMappingPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateMappingFamilyId: CompatibilityMappingFamilyId;
  readonly candidateCompatibilityMappingId: CompatibilityMappingId;
  readonly productId: ProductId;
  readonly ingredientConceptId: IngredientConceptId;
}

export interface HouseholdCompatibilityMappingWriter {
  createHouseholdCompatibilityMapping(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: CreateHouseholdCompatibilityMappingPersistenceInput,
  ): Promise<CreateHouseholdCompatibilityMappingOutput>;
}

export class CreateHouseholdCompatibilityMappingUseCase
  implements UseCase<
    CreateHouseholdCompatibilityMappingInput,
    CreateHouseholdCompatibilityMappingOutput
  >
{
  constructor(
    private readonly transactions: HouseholdCatalogAdministrationTransactionManager,
    private readonly mappings: HouseholdCompatibilityMappingWriter,
    private readonly mappingFamilyIds: IdentifierGenerator<CompatibilityMappingFamilyId>,
    private readonly compatibilityMappingIds: IdentifierGenerator<CompatibilityMappingId>,
  ) {}

  async execute(
    input: CreateHouseholdCompatibilityMappingInput,
  ): Promise<CreateHouseholdCompatibilityMappingOutput> {
    const candidateMappingFamilyId = this.mappingFamilyIds.generate();
    const candidateCompatibilityMappingId = this.compatibilityMappingIds.generate();
    let result: CreateHouseholdCompatibilityMappingOutput | undefined;

    await this.transactions.withHouseholdCatalogAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        result = await this.mappings.createHouseholdCompatibilityMapping(transaction, {
          commandId: input.commandId,
          candidateMappingFamilyId,
          candidateCompatibilityMappingId,
          productId: input.productId,
          ingredientConceptId: input.ingredientConceptId,
        });
      },
    );

    if (result === undefined) {
      throw new TypeError('Household compatibility mapping writer did not return identities');
    }

    return result;
  }
}
