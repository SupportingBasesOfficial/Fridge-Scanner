import type {
  CommandId,
  CompatibilityMappingId,
  HouseholdId,
  PrincipalId,
} from '@fridge/domain';
import type { UseCase } from './index.js';
import type {
  HouseholdCatalogAdministrationTransaction,
  HouseholdCatalogAdministrationTransactionManager,
} from './household-catalog-administration.js';

export interface RetireHouseholdCompatibilityMappingInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly compatibilityMappingId: CompatibilityMappingId;
}

export interface RetireHouseholdCompatibilityMappingOutput {
  readonly compatibilityMappingId: CompatibilityMappingId;
}

export interface RetireHouseholdCompatibilityMappingPersistenceInput {
  readonly commandId: CommandId;
  readonly compatibilityMappingId: CompatibilityMappingId;
}

export interface HouseholdCompatibilityMappingRetirer {
  retireHouseholdCompatibilityMapping(
    transaction: HouseholdCatalogAdministrationTransaction,
    input: RetireHouseholdCompatibilityMappingPersistenceInput,
  ): Promise<CompatibilityMappingId>;
}

export class RetireHouseholdCompatibilityMappingUseCase
  implements UseCase<RetireHouseholdCompatibilityMappingInput, RetireHouseholdCompatibilityMappingOutput>
{
  constructor(
    private readonly transactions: HouseholdCatalogAdministrationTransactionManager,
    private readonly mappings: HouseholdCompatibilityMappingRetirer,
  ) {}

  async execute(
    input: RetireHouseholdCompatibilityMappingInput,
  ): Promise<RetireHouseholdCompatibilityMappingOutput> {
    let compatibilityMappingId: CompatibilityMappingId | undefined;

    await this.transactions.withHouseholdCatalogAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        compatibilityMappingId = await this.mappings.retireHouseholdCompatibilityMapping(
          transaction,
          {
            commandId: input.commandId,
            compatibilityMappingId: input.compatibilityMappingId,
          },
        );
      },
    );

    if (compatibilityMappingId === undefined) {
      throw new TypeError('Household compatibility mapping retirer did not return an identity');
    }

    return { compatibilityMappingId };
  }
}
