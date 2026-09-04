export type HouseholdId = string;

export interface TransactionHandle {
  readonly kind: 'fridge-transaction';
}

export interface TransactionManager {
  withHouseholdTransaction<T>(
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
