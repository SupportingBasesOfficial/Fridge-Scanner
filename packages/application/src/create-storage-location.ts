import type {
  CommandId,
  HouseholdId,
  PrincipalId,
  StorageLocationId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdStorageAdministrationTransaction,
  HouseholdStorageAdministrationTransactionManager,
} from './household-storage-administration.js';

export interface CreateStorageLocationInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly kindCode: string;
  readonly displayName: string;
  readonly sortOrder: number | null;
}

export interface CreateStorageLocationOutput {
  readonly storageLocationId: StorageLocationId;
}

export interface CreateStorageLocationPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateStorageLocationId: StorageLocationId;
  readonly kindCode: string;
  readonly displayName: string;
  readonly sortOrder: number | null;
}

export interface StorageLocationWriter {
  createStorageLocation(
    transaction: HouseholdStorageAdministrationTransaction,
    input: CreateStorageLocationPersistenceInput,
  ): Promise<StorageLocationId>;
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

function requireSortOrder(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new InvalidInputError('sort order must fit PostgreSQL integer or be null');
  }
  return value;
}

export class CreateStorageLocationUseCase
  implements UseCase<CreateStorageLocationInput, CreateStorageLocationOutput>
{
  constructor(
    private readonly transactions: HouseholdStorageAdministrationTransactionManager,
    private readonly storageLocations: StorageLocationWriter,
    private readonly storageLocationIds: IdentifierGenerator<StorageLocationId>,
  ) {}

  async execute(input: CreateStorageLocationInput): Promise<CreateStorageLocationOutput> {
    const kindCode = requireExactNonblank(input.kindCode, 'storage location kind code');
    const displayName = requireExactNonblank(input.displayName, 'storage location display name');
    const sortOrder = requireSortOrder(input.sortOrder);
    const candidateStorageLocationId = this.storageLocationIds.generate();
    let storageLocationId: StorageLocationId | undefined;

    await this.transactions.withHouseholdStorageAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        storageLocationId = await this.storageLocations.createStorageLocation(transaction, {
          commandId: input.commandId,
          candidateStorageLocationId,
          kindCode,
          displayName,
          sortOrder,
        });
      },
    );

    if (storageLocationId === undefined) {
      throw new TypeError('storage location writer did not return an identity');
    }

    return { storageLocationId };
  }
}
