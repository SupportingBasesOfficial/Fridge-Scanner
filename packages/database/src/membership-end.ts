import {
  ConflictError,
  HouseholdMembershipId,
  HouseholdUnauthorizedError,
  IdempotencyConflictError,
  InternalApplicationError,
  type EndHouseholdMembershipPersistenceInput,
  type HouseholdMembershipAdministrationTransaction,
  type HouseholdMembershipEnder,
  type HouseholdSelfLeaver,
  type LeaveHouseholdPersistenceInput,
  type TransactionHandle,
} from '@fridge/application';
import { requirePgClient } from './index.js';

export class HouseholdMembershipEndAuthorizationError extends HouseholdUnauthorizedError {
  constructor() {
    super();
    this.name = 'HouseholdMembershipEndAuthorizationError';
  }
}

function mapEndOutcome(
  outcome: { readonly outcome_code: string; readonly ended_membership_id: string | null } | undefined,
): HouseholdMembershipId {
  switch (outcome?.outcome_code) {
    case 'ENDED':
      if (outcome.ended_membership_id === null) {
        throw new InternalApplicationError(
          new Error('Household membership end succeeded without membership identity'),
        );
      }
      return HouseholdMembershipId(outcome.ended_membership_id);
    case 'CURRENT_MEMBERSHIP_NOT_FOUND':
      throw new ConflictError('current Household membership does not exist');
    case 'SURVIVABILITY_CONFLICT':
      throw new ConflictError('Household membership administration survivability would be violated');
    case 'IDEMPOTENCY_CONFLICT':
      throw new IdempotencyConflictError();
    case 'UNAUTHORIZED':
      throw new HouseholdMembershipEndAuthorizationError();
    default:
      throw new InternalApplicationError(
        new Error('unexpected Household membership end outcome'),
      );
  }
}

export class PgHouseholdMembershipEndWriter
  implements HouseholdMembershipEnder, HouseholdSelfLeaver
{
  async endHouseholdMembership(
    transaction: HouseholdMembershipAdministrationTransaction,
    input: EndHouseholdMembershipPersistenceInput,
  ): Promise<HouseholdMembershipId> {
    const client = requirePgClient(transaction);
    const result = await client.query<{
      outcome_code: string;
      ended_membership_id: string | null;
    }>(
      `select outcome_code,
              ended_membership_id::text
         from fridge_internal.end_household_membership(
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::uuid,
           $5::uuid
         )`,
      [
        transaction.householdId,
        transaction.principalId,
        transaction.membershipId,
        input.commandId,
        input.targetPrincipalId,
      ],
    );

    return mapEndOutcome(result.rows[0]);
  }

  async leaveHousehold(
    transaction: TransactionHandle,
    input: LeaveHouseholdPersistenceInput,
  ): Promise<HouseholdMembershipId> {
    const client = requirePgClient(transaction);
    const result = await client.query<{
      outcome_code: string;
      ended_membership_id: string | null;
    }>(
      `select outcome_code,
              ended_membership_id::text
         from fridge_internal.leave_household(
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::uuid
         )`,
      [
        transaction.householdId,
        transaction.principalId,
        transaction.membershipId,
        input.commandId,
      ],
    );

    return mapEndOutcome(result.rows[0]);
  }
}
