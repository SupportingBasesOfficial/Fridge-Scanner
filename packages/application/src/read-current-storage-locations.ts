import type { HouseholdId, Instant, PrincipalId, StorageLocationId } from '@fridge/domain';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';

export interface CurrentStorageLocation {
  readonly storageLocationId: StorageLocationId;
  readonly kindCode: string;
  readonly displayName: string;
  readonly sortOrder: number | null;
  readonly createdAt: Instant;
}

export interface ListCurrentStorageLocationsInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
}

export interface GetCurrentStorageLocationInput extends ListCurrentStorageLocationsInput {
  readonly storageLocationId: StorageLocationId;
}

export interface CurrentStorageLocationReader {
  listCurrentStorageLocations(
    transaction: TransactionHandle,
  ): Promise<readonly CurrentStorageLocation[]>;

  getCurrentStorageLocation(
    transaction: TransactionHandle,
    storageLocationId: StorageLocationId,
  ): Promise<CurrentStorageLocation>;
}

export class ListCurrentStorageLocationsUseCase
  implements UseCase<ListCurrentStorageLocationsInput, { readonly storageLocations: readonly CurrentStorageLocation[] }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly storageLocations: CurrentStorageLocationReader,
  ) {}

  async execute(input: ListCurrentStorageLocationsInput): Promise<{ readonly storageLocations: readonly CurrentStorageLocation[] }> {
    let storageLocations: readonly CurrentStorageLocation[] | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        storageLocations = await this.storageLocations.listCurrentStorageLocations(transaction);
      },
    );
    if (storageLocations === undefined) {
      throw new TypeError('current StorageLocation reader did not return a result');
    }
    return { storageLocations };
  }
}

export class GetCurrentStorageLocationUseCase
  implements UseCase<GetCurrentStorageLocationInput, { readonly storageLocation: CurrentStorageLocation }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly storageLocations: CurrentStorageLocationReader,
  ) {}

  async execute(input: GetCurrentStorageLocationInput): Promise<{ readonly storageLocation: CurrentStorageLocation }> {
    let storageLocation: CurrentStorageLocation | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        storageLocation = await this.storageLocations.getCurrentStorageLocation(
          transaction,
          input.storageLocationId,
        );
      },
    );
    if (storageLocation === undefined) {
      throw new TypeError('current StorageLocation reader did not return a result');
    }
    return { storageLocation };
  }
}
