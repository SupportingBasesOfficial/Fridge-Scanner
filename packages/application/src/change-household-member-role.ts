import type {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdMembershipAdministrationTransaction,
  HouseholdMembershipAdministrationTransactionManager,
} from './household-membership-administration.js';

export interface ChangeHouseholdMemberRoleInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly targetPrincipalId: PrincipalId;
  readonly roleCode: string;
}

export interface ChangeHouseholdMemberRoleOutput {
  readonly membershipId: HouseholdMembershipId;
}

export interface ChangeHouseholdMemberRolePersistenceInput {
  readonly commandId: CommandId;
  readonly candidateMembershipId: HouseholdMembershipId;
  readonly targetPrincipalId: PrincipalId;
  readonly roleCode: string;
}

export interface HouseholdMembershipRoleChanger {
  changeHouseholdMemberRole(
    transaction: HouseholdMembershipAdministrationTransaction,
    input: ChangeHouseholdMemberRolePersistenceInput,
  ): Promise<HouseholdMembershipId>;
}

function requireGovernedRoleCode(roleCode: string): string {
  if (
    typeof roleCode !== 'string' ||
    roleCode.length === 0 ||
    roleCode.trim().length === 0 ||
    roleCode !== roleCode.trim()
  ) {
    throw new InvalidInputError('Household role code must be a nonblank exact value');
  }

  return roleCode;
}

export class ChangeHouseholdMemberRoleUseCase
  implements UseCase<ChangeHouseholdMemberRoleInput, ChangeHouseholdMemberRoleOutput>
{
  constructor(
    private readonly transactions: HouseholdMembershipAdministrationTransactionManager,
    private readonly memberships: HouseholdMembershipRoleChanger,
    private readonly membershipIds: IdentifierGenerator<HouseholdMembershipId>,
  ) {}

  async execute(
    input: ChangeHouseholdMemberRoleInput,
  ): Promise<ChangeHouseholdMemberRoleOutput> {
    const roleCode = requireGovernedRoleCode(input.roleCode);
    const candidateMembershipId = this.membershipIds.generate();
    let membershipId: HouseholdMembershipId | undefined;

    await this.transactions.withHouseholdMembershipAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        membershipId = await this.memberships.changeHouseholdMemberRole(transaction, {
          commandId: input.commandId,
          candidateMembershipId,
          targetPrincipalId: input.targetPrincipalId,
          roleCode,
        });
      },
    );

    if (membershipId === undefined) {
      throw new TypeError('Household membership role changer did not return a membership identity');
    }

    return { membershipId };
  }
}
