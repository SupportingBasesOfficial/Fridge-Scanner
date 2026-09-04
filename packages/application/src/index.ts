export type PrincipalId = string;
export type HouseholdId = string;

export interface TransactionHandle {
  readonly kind: 'fridge-transaction';
  readonly principalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly householdRoleCode: string;
}

export interface TransactionManager {
  withAuthorizedHouseholdTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (transaction: TransactionHandle) => Promise<T>,
  ): Promise<T>;
}

export interface ReadinessProbe {
  check(): Promise<ReadinessResult>;
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly reason?: string;
}

export interface Clock {
  now(): Date;
}

export interface IdentifierGenerator {
  uuid(): string;
}
