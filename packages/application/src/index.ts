import type {
  HouseholdId,
  HouseholdMembershipId,
  Instant,
  PrincipalId,
} from '@fridge/domain';

export {
  HouseholdId,
  HouseholdMembershipId,
  Instant,
  PrincipalId,
} from '@fridge/domain';
export * from './errors.js';

export interface TransactionHandle {
  readonly kind: 'fridge-transaction';
  readonly principalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly membershipId: HouseholdMembershipId;
  readonly householdRoleCode: string;
}

export interface TransactionManager {
  withAuthorizedHouseholdTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (transaction: TransactionHandle) => Promise<T>,
  ): Promise<T>;
}

export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

export interface ReadinessProbe {
  check(): Promise<ReadinessResult>;
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly reason?: string;
}

export interface Clock {
  now(): Instant;
}

export interface IdentifierGenerator<TIdentifier> {
  generate(): TIdentifier;
}
