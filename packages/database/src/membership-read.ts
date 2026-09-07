import {
  DependencyUnavailableError,
  HouseholdMembershipId,
  HouseholdUnauthorizedError,
  InternalApplicationError,
  PrincipalId,
  instant,
  type CurrentHouseholdMember,
  type CurrentHouseholdMembershipReader,
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

export class HouseholdMembershipReadAuthorizationError extends HouseholdUnauthorizedError {
  constructor() {
    super();
    this.name = 'HouseholdMembershipReadAuthorizationError';
  }
}

export class PgCurrentHouseholdMembershipReader implements CurrentHouseholdMembershipReader {
  async readCurrentHouseholdMembers(
    transaction: TransactionHandle,
  ): Promise<readonly CurrentHouseholdMember[]> {
    const client = requirePgClient(transaction);
    let result: {
      readonly rows: {
        readonly membership_id: string;
        readonly user_id: string;
        readonly display_name: string | null;
        readonly role_code: string;
        readonly effective_from: Date;
        readonly effective_to: Date | null;
      }[];
    };

    try {
      result = await client.query<{
        membership_id: string;
        user_id: string;
        display_name: string | null;
        role_code: string;
        effective_from: Date;
        effective_to: Date | null;
      }>(
        `select membership_id::text,
                user_id::text,
                display_name,
                role_code,
                effective_from,
                effective_to
           from fridge_internal.read_current_household_members(
             $1::uuid,
             $2::uuid,
             $3::uuid
           )`,
        [transaction.householdId, transaction.principalId, transaction.membershipId],
      );
    } catch (error) {
      throw providerNeutralDatabaseFailure(error);
    }

    // A valid current actor is necessarily part of the current-member result.
    // Zero rows therefore means the privileged read boundary rejected the exact
    // actor membership after the application transaction was initially opened.
    if (result.rows.length === 0) {
      throw new HouseholdMembershipReadAuthorizationError();
    }

    try {
      return result.rows.map((row) => ({
        membershipId: HouseholdMembershipId(row.membership_id),
        principalId: PrincipalId(row.user_id),
        displayName: row.display_name,
        roleCode: row.role_code,
        effectiveFrom: instant(row.effective_from.toISOString()),
        effectiveTo: row.effective_to === null ? null : instant(row.effective_to.toISOString()),
      }));
    } catch (error) {
      throw new InternalApplicationError(error);
    }
  }
}
