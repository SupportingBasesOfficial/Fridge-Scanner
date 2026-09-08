import type {
  CommandId,
  CompartmentId,
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

export interface CreateCompartmentInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly storageLocationId: StorageLocationId;
  readonly kindCode: string | null;
  readonly displayName: string;
  readonly sortOrder: number | null;
}

export interface CreateCompartmentOutput {
  readonly compartmentId: CompartmentId;
}

export interface CreateCompartmentPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateCompartmentId: CompartmentId;
  readonly storageLocationId: StorageLocationId;
  readonly kindCode: string | null;
  readonly displayName: string;
  readonly sortOrder: number | null;
}

export interface CompartmentWriter {
  createCompartment(
    transaction: HouseholdStorageAdministrationTransaction,
    input: CreateCompartmentPersistenceInput,
  ): Promise<CompartmentId>;
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

function requireOptionalKindCode(value: string | null): string | null {
  return value === null ? null : requireExactNonblank(value, 'compartment kind code');
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

export class CreateCompartmentUseCase
  implements UseCase<CreateCompartmentInput, CreateCompartmentOutput>
{
  constructor(
    private readonly transactions: HouseholdStorageAdministrationTransactionManager,
    private readonly compartments: CompartmentWriter,
    private readonly compartmentIds: IdentifierGenerator<CompartmentId>,
  ) {}

  async execute(input: CreateCompartmentInput): Promise<CreateCompartmentOutput> {
    const kindCode = requireOptionalKindCode(input.kindCode);
    const displayName = requireExactNonblank(input.displayName, 'compartment display name');
    const sortOrder = requireSortOrder(input.sortOrder);
    const candidateCompartmentId = this.compartmentIds.generate();
    let compartmentId: CompartmentId | undefined;

    await this.transactions.withHouseholdStorageAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        compartmentId = await this.compartments.createCompartment(transaction, {
          commandId: input.commandId,
          candidateCompartmentId,
          storageLocationId: input.storageLocationId,
          kindCode,
          displayName,
          sortOrder,
        });
      },
    );

    if (compartmentId === undefined) {
      throw new TypeError('compartment writer did not return an identity');
    }

    return { compartmentId };
  }
}
