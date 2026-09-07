import type {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type {
  IdentifierGenerator,
  UseCase,
} from './index.js';
import type {
  HouseholdMembershipAdministrationTransaction,
  HouseholdMembershipAdministrationTransactionManager,
} from './household-membership-administration.js';

export interface AddHouseholdMemberInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly targetPrincipalId: PrincipalId;
  readonly roleCode: string;
}

export interface AddHouseholdMemberOutput {
  readonly membershipId: HouseholdMembershipId;
}

export interface AddHouseholdMemberPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateMembershipId: HouseholdMembershipId;
  readonly targetPrincipalId: PrincipalId;
  readonly roleCode: string;
}

export interface HouseholdMembershipWriter {
  addHouseholdMember(
    transaction: HouseholdMembershipAdministrationTransaction,
    input: AddHouseholdMemberPersistenceInput,
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

export class AddHouseholdMemberUseCase
  implements UseCase<AddHouseholdMemberInput, AddHouseholdMemberOutput>
{
  constructor(
    private readonly transactions: HouseholdMembershipAdministrationTransactionManager,
    private readonly memberships: HouseholdMembershipWriter,
    private readonly membershipIds: IdentifierGenerator<HouseholdMembershipId>,
  ) {}

  async execute(input: AddHouseholdMemberInput): Promise<AddHouseholdMemberOutput> {
    const roleCode = requireGovernedRoleCode(input.roleCode);
    const candidateMembershipId = this.membershipIds.generate();
    let membershipId: HouseholdMembershipId | undefined;

    await this.transactions.withHouseholdMembershipAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        membershipId = await this.memberships.addHouseholdMember(transaction, {
          commandId: input.commandId,
          candidateMembershipId,
          targetPrincipalId: input.targetPrincipalId,
          roleCode,
        });
      },
    );

    if (membershipId === undefined) {
      throw new TypeError('Household membership writer did not return a membership identity');
    }

    return { membershipId };
  }
}
