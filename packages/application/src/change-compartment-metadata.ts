import type {
  CommandId,
  CompartmentId,
  HouseholdId,
  PrincipalId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { UseCase } from './index.js';
import type {
  HouseholdStorageAdministrationTransaction,
  HouseholdStorageAdministrationTransactionManager,
} from './household-storage-administration.js';

export interface ChangeCompartmentMetadataInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly compartmentId: CompartmentId;
  readonly kindCode: string | null;
  readonly displayName: string;
  readonly sortOrder: number | null;
}

export interface ChangeCompartmentMetadataOutput {
  readonly compartmentId: CompartmentId;
}

export interface ChangeCompartmentMetadataPersistenceInput {
  readonly commandId: CommandId;
  readonly compartmentId: CompartmentId;
  readonly kindCode: string | null;
  readonly displayName: string;
  readonly sortOrder: number | null;
}

export interface CompartmentMetadataChanger {
  changeCompartmentMetadata(
    transaction: HouseholdStorageAdministrationTransaction,
    input: ChangeCompartmentMetadataPersistenceInput,
  ): Promise<CompartmentId>;
}

function requireOptionalExactNonblank(value: string | null, label: string): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new InvalidInputError(`${label} must be null or a nonblank exact value`);
  }
  return value;
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
  if (value === null) return null;
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new InvalidInputError('sort order must fit PostgreSQL integer or be null');
  }
  return value;
}

export class ChangeCompartmentMetadataUseCase
  implements UseCase<ChangeCompartmentMetadataInput, ChangeCompartmentMetadataOutput>
{
  constructor(
    private readonly transactions: HouseholdStorageAdministrationTransactionManager,
    private readonly compartments: CompartmentMetadataChanger,
  ) {}

  async execute(input: ChangeCompartmentMetadataInput): Promise<ChangeCompartmentMetadataOutput> {
    const kindCode = requireOptionalExactNonblank(input.kindCode, 'compartment kind code');
    const displayName = requireExactNonblank(input.displayName, 'compartment display name');
    const sortOrder = requireSortOrder(input.sortOrder);
    let compartmentId: CompartmentId | undefined;

    await this.transactions.withHouseholdStorageAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        compartmentId = await this.compartments.changeCompartmentMetadata(transaction, {
          commandId: input.commandId,
          compartmentId: input.compartmentId,
          kindCode,
          displayName,
          sortOrder,
        });
      },
    );

    if (compartmentId === undefined) {
      throw new TypeError('compartment metadata changer did not return an identity');
    }

    return { compartmentId };
  }
}
