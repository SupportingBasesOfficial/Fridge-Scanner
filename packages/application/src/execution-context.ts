import type { HouseholdId, MembershipId, PrincipalId } from '@fridge/domain';

const verifiedHouseholdContextBrand: unique symbol = Symbol('verifiedHouseholdContext');

export interface VerifiedHouseholdContext {
  readonly principalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly membershipId: MembershipId;
  readonly householdRoleCode: string;
  readonly [verifiedHouseholdContextBrand]: true;
}

export interface VerifiedHouseholdContextInput {
  readonly principalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly membershipId: MembershipId;
  readonly householdRoleCode: string;
}

export function verifiedHouseholdContext(
  input: VerifiedHouseholdContextInput,
): VerifiedHouseholdContext {
  if (input.householdRoleCode.trim().length === 0) {
    throw new TypeError('householdRoleCode must not be blank');
  }

  return Object.freeze({
    ...input,
    [verifiedHouseholdContextBrand]: true as const,
  });
}
