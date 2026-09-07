import {
  HouseholdMembershipId,
  HouseholdUnauthorizedError,
  PrincipalId,
  instant,
  type CurrentHouseholdMember,
  type CurrentHouseholdMembershipReader,
  type TransactionHandle,
} from '@fridge/application';
import { requirePgClient } from './index.js';

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
    const result = await client.query<{
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

    // A valid current actor is necessarily part of the current-member result.
    // Zero rows therefore means the privileged read boundary rejected the exact
    // actor membership after the application transaction was initially opened.
    if (result.rows.length === 0) {
      throw new HouseholdMembershipReadAuthorizationError();
    }

    return result.rows.map((row) => ({
      membershipId: HouseholdMembershipId(row.membership_id),
      principalId: PrincipalId(row.user_id),
      displayName: row.display_name,
      roleCode: row.role_code,
      effectiveFrom: instant(row.effective_from.toISOString()),
      effectiveTo: row.effective_to === null ? null : instant(row.effective_to.toISOString()),
    }));
  }
}
