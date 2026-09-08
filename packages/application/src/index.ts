import type {
  HouseholdId,
  HouseholdMembershipId,
  Instant,
  PrincipalId,
} from '@fridge/domain';

export {
  BrandId,
  CommandId,
  CompartmentId,
  HouseholdId,
  HouseholdMembershipId,
  ManufacturerId,
  PrincipalId,
  ProductCategoryId,
  ProductId,
  StorageLocationId,
  instant,
} from '@fridge/domain';
export type { Instant } from '@fridge/domain';
export * from './add-household-member.js';
export * from './change-compartment-metadata.js';
export * from './change-household-member-role.js';
export * from './change-household-product-metadata.js';
export * from './change-storage-location-metadata.js';
export * from './create-compartment.js';
export * from './create-household-product.js';
export * from './create-storage-location.js';
export * from './end-household-membership.js';
export * from './errors.js';
export * from './household-catalog-administration.js';
export * from './household-context.js';
export * from './household-membership-administration.js';
export * from './household-storage-administration.js';
export * from './read-current-compartments.js';
export * from './read-current-household-members.js';
export * from './read-current-storage-locations.js';
export * from './retire-compartment.js';
export * from './retire-storage-location.js';

declare const verifiedTransactionBrand: unique symbol;

export interface TransactionHandle {
  readonly [verifiedTransactionBrand]: 'VerifiedTransactionHandle';
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
