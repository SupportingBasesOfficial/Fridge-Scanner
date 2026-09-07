import type {
  HouseholdId,
  HouseholdMembershipId,
  Instant,
  PrincipalId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type {
  Clock,
  IdentifierGenerator,
  UseCase,
} from './index.js';
import type {
  HouseholdMembershipAdministrationTransaction,
  HouseholdMembershipAdministrationTransactionManager,
} from './household-membership-administration.js';

export interface AddHouseholdMemberInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly targetPrincipalId: PrincipalId;
  readonly roleCode: string;
}

export interface AddHouseholdMemberOutput {
  readonly membershipId: HouseholdMembershipId;
}

export interface AddHouseholdMemberPersistenceInput {
  readonly membershipId: HouseholdMembershipId;
  readonly targetPrincipalId: PrincipalId;
  readonly roleCode: string;
  readonly effectiveAt: Instant;
}

export interface HouseholdMembershipWriter {
  addHouseholdMember(
    transaction: HouseholdMembershipAdministrationTransaction,
    input: AddHouseholdMemberPersistenceInput,
  ): Promise<void>;
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
    private readonly clock: Clock,
  ) {}

  async execute(input: AddHouseholdMemberInput): Promise<AddHouseholdMemberOutput> {
    const roleCode = requireGovernedRoleCode(input.roleCode);
    const membershipId = this.membershipIds.generate();
    const effectiveAt = this.clock.now();

    await this.transactions.withHouseholdMembershipAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        await this.memberships.addHouseholdMember(transaction, {
          membershipId,
          targetPrincipalId: input.targetPrincipalId,
          roleCode,
          effectiveAt,
        });
      },
    );

    return { membershipId };
  }
}
