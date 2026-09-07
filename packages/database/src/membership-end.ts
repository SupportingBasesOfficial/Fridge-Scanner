import {
  ConflictError,
  DependencyUnavailableError,
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

const DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES = new Set([
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

function providerNeutralDatabaseFailure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { readonly code?: unknown }).code ?? '')
      : '';

  if (code.startsWith('08') || DEPENDENCY_UNAVAILABLE_SQLSTATE_CODES.has(code)) {
    return new DependencyUnavailableError('required dependency is unavailable', error);
  }

  return new InternalApplicationError(error);
}

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
    let result: {
      readonly rows: { readonly outcome_code: string; readonly ended_membership_id: string | null }[];
    };

    try {
      result = await client.query<{
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
    } catch (error) {
      throw providerNeutralDatabaseFailure(error);
    }

    return mapEndOutcome(result.rows[0]);
  }

  async leaveHousehold(
    transaction: TransactionHandle,
    input: LeaveHouseholdPersistenceInput,
  ): Promise<HouseholdMembershipId> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: { readonly outcome_code: string; readonly ended_membership_id: string | null }[];
    };

    try {
      result = await client.query<{
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
    } catch (error) {
      throw providerNeutralDatabaseFailure(error);
    }

    return mapEndOutcome(result.rows[0]);
  }
}
