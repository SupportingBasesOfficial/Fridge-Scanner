import type {
  HouseholdId,
  HouseholdMembershipId,
  Instant,
  PrincipalId,
} from '@fridge/domain';

export {
  BrandId,
  CommandId,
  CompatibilityEvidenceId,
  CompatibilityMappingFamilyId,
  CompatibilityMappingId,
  CompartmentId,
  HouseholdId,
  HouseholdMembershipId,
  IngredientConceptId,
  InventoryMovementId,
  ManufacturerId,
  MeasurementConversionEvidenceId,
  MeasurementUnitId,
  MoneyRoundingPolicyId,
  PrincipalId,
  ProductCategoryId,
  ProductId,
  ProductIdentifierId,
  ProductIdentifierNormalizationRuleId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  PurchaseItemPricingDiscrepancyId,
  PurchaseItemReceiptAllocationId,
  PurchaseItemSubstitutionAllocationId,
  ReceiptId,
  ReceiptItemId,
  ReceiptItemIntentId,
  ReceiptItemInventoryEffectId,
  StagedIdentifierClaimId,
  StockItemId,
  StorageLocationId,
  exactRational,
  instant,
} from '@fridge/domain';
export type { ExactRational, Instant } from '@fridge/domain';
export * from './add-household-member.js';
export * from './change-compartment-metadata.js';
export * from './change-household-ingredient-concept-metadata.js';
export * from './change-household-member-role.js';
export * from './change-household-product-metadata.js';
export * from './change-storage-location-metadata.js';
export * from './commit-compatibility-decision-evidence.js';
export * from './commit-purchase-item-pricing-basis.js';
export * from './commit-purchase-item-pricing-extension.js';
export * from './commit-purchase-item-source-money-facts.js';
export * from './create-compartment.js';
export * from './create-household-compatibility-mapping.js';
export * from './create-household-ingredient-concept.js';
export * from './create-household-product.js';
export * from './create-purchase.js';
export * from './create-receipt.js';
export * from './create-receipt-item-intent.js';
export * from './create-storage-location.js';
export * from './end-household-membership.js';
export * from './errors.js';
export * from './household-catalog-administration.js';
export * from './household-context.js';
export * from './household-membership-administration.js';
export * from './household-procurement-administration.js';
export * from './household-storage-administration.js';
export * from './materialize-ordinary-receipt-item.js';
export * from './materialize-substitution-receipt-item.js';
export * from './observe-product-identifier.js';
export * from './read-current-compartments.js';
export * from './read-current-household-members.js';
export * from './read-current-ingredient-concepts.js';
export * from './read-current-products.js';
export * from './read-current-storage-locations.js';
export * from './read-household-purchases.js';
export * from './resolve-product-identifier.js';
export * from './retire-compartment.js';
export * from './retire-household-compatibility-mapping.js';
export * from './retire-household-ingredient-concept.js';
export * from './retire-household-product.js';
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