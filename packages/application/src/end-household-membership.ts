import type {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/domain';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';
import type {
  HouseholdMembershipAdministrationTransaction,
  HouseholdMembershipAdministrationTransactionManager,
} from './household-membership-administration.js';

export interface EndHouseholdMembershipInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly targetPrincipalId: PrincipalId;
}

export interface EndHouseholdMembershipOutput {
  readonly endedMembershipId: HouseholdMembershipId;
}

export interface EndHouseholdMembershipPersistenceInput {
  readonly commandId: CommandId;
  readonly targetPrincipalId: PrincipalId;
}

export interface HouseholdMembershipEnder {
  endHouseholdMembership(
    transaction: HouseholdMembershipAdministrationTransaction,
    input: EndHouseholdMembershipPersistenceInput,
  ): Promise<HouseholdMembershipId>;
}

export interface LeaveHouseholdInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
}

export interface LeaveHouseholdOutput {
  readonly endedMembershipId: HouseholdMembershipId;
}

export interface LeaveHouseholdPersistenceInput {
  readonly commandId: CommandId;
}

export interface HouseholdSelfLeaver {
  leaveHousehold(
    transaction: TransactionHandle,
    input: LeaveHouseholdPersistenceInput,
  ): Promise<HouseholdMembershipId>;
}

export class EndHouseholdMembershipUseCase
  implements UseCase<EndHouseholdMembershipInput, EndHouseholdMembershipOutput>
{
  constructor(
    private readonly transactions: HouseholdMembershipAdministrationTransactionManager,
    private readonly memberships: HouseholdMembershipEnder,
  ) {}

  async execute(input: EndHouseholdMembershipInput): Promise<EndHouseholdMembershipOutput> {
    let endedMembershipId: HouseholdMembershipId | undefined;

    await this.transactions.withHouseholdMembershipAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        endedMembershipId = await this.memberships.endHouseholdMembership(transaction, {
          commandId: input.commandId,
          targetPrincipalId: input.targetPrincipalId,
        });
      },
    );

    if (endedMembershipId === undefined) {
      throw new TypeError('Household membership ender did not return a membership identity');
    }

    return { endedMembershipId };
  }
}

export class LeaveHouseholdUseCase
  implements UseCase<LeaveHouseholdInput, LeaveHouseholdOutput>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly memberships: HouseholdSelfLeaver,
  ) {}

  async execute(input: LeaveHouseholdInput): Promise<LeaveHouseholdOutput> {
    let endedMembershipId: HouseholdMembershipId | undefined;

    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        endedMembershipId = await this.memberships.leaveHousehold(transaction, {
          commandId: input.commandId,
        });
      },
    );

    if (endedMembershipId === undefined) {
      throw new TypeError('Household self-leave writer did not return a membership identity');
    }

    return { endedMembershipId };
  }
}
