import type {
  CommandId,
  CompartmentId,
  HouseholdId,
  PrincipalId,
} from '@fridge/domain';
import type { UseCase } from './index.js';
import type {
  HouseholdStorageAdministrationTransaction,
  HouseholdStorageAdministrationTransactionManager,
} from './household-storage-administration.js';

export interface RetireCompartmentInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly compartmentId: CompartmentId;
}

export interface RetireCompartmentOutput {
  readonly compartmentId: CompartmentId;
}

export interface RetireCompartmentPersistenceInput {
  readonly commandId: CommandId;
  readonly compartmentId: CompartmentId;
}

export interface CompartmentRetirer {
  retireCompartment(
    transaction: HouseholdStorageAdministrationTransaction,
    input: RetireCompartmentPersistenceInput,
  ): Promise<CompartmentId>;
}

export class RetireCompartmentUseCase
  implements UseCase<RetireCompartmentInput, RetireCompartmentOutput>
{
  constructor(
    private readonly transactions: HouseholdStorageAdministrationTransactionManager,
    private readonly compartments: CompartmentRetirer,
  ) {}

  async execute(input: RetireCompartmentInput): Promise<RetireCompartmentOutput> {
    let compartmentId: CompartmentId | undefined;

    await this.transactions.withHouseholdStorageAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        compartmentId = await this.compartments.retireCompartment(transaction, {
          commandId: input.commandId,
          compartmentId: input.compartmentId,
        });
      },
    );

    if (compartmentId === undefined) {
      throw new TypeError('compartment retirer did not return an identity');
    }

    return { compartmentId };
  }
}
