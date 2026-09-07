import type {
  HouseholdId,
  HouseholdMembershipId,
  Instant,
  PrincipalId,
} from '@fridge/domain';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';

export interface CurrentHouseholdMember {
  readonly membershipId: HouseholdMembershipId;
  readonly principalId: PrincipalId;
  readonly displayName: string | null;
  readonly roleCode: string;
  readonly effectiveFrom: Instant;
  readonly effectiveTo: Instant | null;
}

export interface ReadCurrentHouseholdMembersInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
}

export interface ReadCurrentHouseholdMembersOutput {
  readonly members: readonly CurrentHouseholdMember[];
}

export interface CurrentHouseholdMembershipReader {
  readCurrentHouseholdMembers(
    transaction: TransactionHandle,
  ): Promise<readonly CurrentHouseholdMember[]>;
}

export class ReadCurrentHouseholdMembersUseCase
  implements UseCase<ReadCurrentHouseholdMembersInput, ReadCurrentHouseholdMembersOutput>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly memberships: CurrentHouseholdMembershipReader,
  ) {}

  async execute(input: ReadCurrentHouseholdMembersInput): Promise<ReadCurrentHouseholdMembersOutput> {
    let members: readonly CurrentHouseholdMember[] | undefined;

    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        members = await this.memberships.readCurrentHouseholdMembers(transaction);
      },
    );

    if (members === undefined) {
      throw new TypeError('current Household membership reader did not return a result');
    }

    return { members };
  }
}
