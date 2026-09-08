import type {
  CommandId,
  HouseholdId,
  PrincipalId,
  StorageLocationId,
} from '@fridge/domain';
import type { UseCase } from './index.js';
import type {
  HouseholdStorageAdministrationTransaction,
  HouseholdStorageAdministrationTransactionManager,
} from './household-storage-administration.js';

export interface RetireStorageLocationInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly storageLocationId: StorageLocationId;
}

export interface RetireStorageLocationOutput {
  readonly storageLocationId: StorageLocationId;
}

export interface RetireStorageLocationPersistenceInput {
  readonly commandId: CommandId;
  readonly storageLocationId: StorageLocationId;
}

export interface StorageLocationRetirer {
  retireStorageLocation(
    transaction: HouseholdStorageAdministrationTransaction,
    input: RetireStorageLocationPersistenceInput,
  ): Promise<StorageLocationId>;
}

export class RetireStorageLocationUseCase
  implements UseCase<RetireStorageLocationInput, RetireStorageLocationOutput>
{
  constructor(
    private readonly transactions: HouseholdStorageAdministrationTransactionManager,
    private readonly storageLocations: StorageLocationRetirer,
  ) {}

  async execute(input: RetireStorageLocationInput): Promise<RetireStorageLocationOutput> {
    let storageLocationId: StorageLocationId | undefined;

    await this.transactions.withHouseholdStorageAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        storageLocationId = await this.storageLocations.retireStorageLocation(transaction, {
          commandId: input.commandId,
          storageLocationId: input.storageLocationId,
        });
      },
    );

    if (storageLocationId === undefined) {
      throw new TypeError('storage location retirer did not return an identity');
    }

    return { storageLocationId };
  }
}
