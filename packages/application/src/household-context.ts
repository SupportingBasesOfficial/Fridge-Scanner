import type {
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
} from '@fridge/domain';

import { NotFoundError } from './errors.js';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';

export interface HouseholdProfileReader {
  readDisplayName(transaction: TransactionHandle): Promise<string | null>;
}

export interface ReadAuthorizedHouseholdContextInput {
  readonly principalId: PrincipalId;
  readonly householdId: HouseholdId;
}

export interface AuthorizedHouseholdContext {
  readonly principalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly householdDisplayName: string;
  readonly membershipId: HouseholdMembershipId;
  readonly householdRoleCode: string;
}

export class ReadAuthorizedHouseholdContext
implements UseCase<ReadAuthorizedHouseholdContextInput, AuthorizedHouseholdContext> {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly households: HouseholdProfileReader,
  ) {}

  execute(input: ReadAuthorizedHouseholdContextInput): Promise<AuthorizedHouseholdContext> {
    return this.transactions.withAuthorizedHouseholdTransaction(
      input.principalId,
      input.householdId,
      async (transaction) => {
        const householdDisplayName = await this.households.readDisplayName(transaction);
        if (householdDisplayName === null) {
          throw new NotFoundError();
        }

        return {
          principalId: transaction.principalId,
          householdId: transaction.householdId,
          householdDisplayName,
          membershipId: transaction.membershipId,
          householdRoleCode: transaction.householdRoleCode,
        };
      },
    );
  }
}
