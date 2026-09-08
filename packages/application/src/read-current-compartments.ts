import type {
  CompartmentId,
  HouseholdId,
  Instant,
  PrincipalId,
  StorageLocationId,
} from '@fridge/domain';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';

export interface CurrentCompartment {
  readonly compartmentId: CompartmentId;
  readonly storageLocationId: StorageLocationId;
  readonly kindCode: string | null;
  readonly displayName: string;
  readonly sortOrder: number | null;
  readonly createdAt: Instant;
}

export interface ListCurrentCompartmentsInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly storageLocationId: StorageLocationId;
}

export interface GetCurrentCompartmentInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly compartmentId: CompartmentId;
}

export interface CurrentCompartmentReader {
  listCurrentCompartments(
    transaction: TransactionHandle,
    storageLocationId: StorageLocationId,
  ): Promise<readonly CurrentCompartment[]>;

  getCurrentCompartment(
    transaction: TransactionHandle,
    compartmentId: CompartmentId,
  ): Promise<CurrentCompartment>;
}

export class ListCurrentCompartmentsUseCase
  implements UseCase<ListCurrentCompartmentsInput, { readonly compartments: readonly CurrentCompartment[] }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly compartments: CurrentCompartmentReader,
  ) {}

  async execute(input: ListCurrentCompartmentsInput): Promise<{ readonly compartments: readonly CurrentCompartment[] }> {
    let compartments: readonly CurrentCompartment[] | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        compartments = await this.compartments.listCurrentCompartments(
          transaction,
          input.storageLocationId,
        );
      },
    );
    if (compartments === undefined) {
      throw new TypeError('current Compartment reader did not return a result');
    }
    return { compartments };
  }
}

export class GetCurrentCompartmentUseCase
  implements UseCase<GetCurrentCompartmentInput, { readonly compartment: CurrentCompartment }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly compartments: CurrentCompartmentReader,
  ) {}

  async execute(input: GetCurrentCompartmentInput): Promise<{ readonly compartment: CurrentCompartment }> {
    let compartment: CurrentCompartment | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        compartment = await this.compartments.getCurrentCompartment(
          transaction,
          input.compartmentId,
        );
      },
    );
    if (compartment === undefined) {
      throw new TypeError('current Compartment reader did not return a result');
    }
    return { compartment };
  }
}
