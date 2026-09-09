import { invalidDomainValue } from './errors.js';

declare const brand: unique symbol;

type Brand<TName extends string> = string & { readonly [brand]: TName };

// DB-02 uses PostgreSQL uuid without a version/variant CHECK constraint. The
// application boundary therefore enforces only the canonical lowercase,
// hyphenated textual representation and must not silently narrow database truth.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parseUuid<TName extends string>(value: string, name: TName): Brand<TName> {
  if (!UUID_PATTERN.test(value)) {
    throw invalidDomainValue(`Invalid ${name}`);
  }

  return value as Brand<TName>;
}

export type PrincipalId = Brand<'PrincipalId'>;
export type HouseholdId = Brand<'HouseholdId'>;
export type UserId = Brand<'UserId'>;
export type HouseholdMembershipId = Brand<'HouseholdMembershipId'>;
export type ProductId = Brand<'ProductId'>;
export type IngredientConceptId = Brand<'IngredientConceptId'>;
export type CompatibilityMappingFamilyId = Brand<'CompatibilityMappingFamilyId'>;
export type CompatibilityMappingId = Brand<'CompatibilityMappingId'>;
export type CompatibilityEvidenceId = Brand<'CompatibilityEvidenceId'>;
export type ProductIdentifierId = Brand<'ProductIdentifierId'>;
export type ProductIdentifierNormalizationRuleId = Brand<'ProductIdentifierNormalizationRuleId'>;
export type StagedIdentifierClaimId = Brand<'StagedIdentifierClaimId'>;
export type BrandId = Brand<'BrandId'>;
export type ManufacturerId = Brand<'ManufacturerId'>;
export type ProductCategoryId = Brand<'ProductCategoryId'>;
export type StorageLocationId = Brand<'StorageLocationId'>;
export type CompartmentId = Brand<'CompartmentId'>;
export type BatchId = Brand<'BatchId'>;
export type InventoryMovementId = Brand<'InventoryMovementId'>;
export type CommandId = Brand<'CommandId'>;
export type CorrelationId = Brand<'CorrelationId'>;

export const PrincipalId = (value: string): PrincipalId => parseUuid(value, 'PrincipalId');
export const HouseholdId = (value: string): HouseholdId => parseUuid(value, 'HouseholdId');
export const UserId = (value: string): UserId => parseUuid(value, 'UserId');
export const HouseholdMembershipId = (value: string): HouseholdMembershipId =>
  parseUuid(value, 'HouseholdMembershipId');
export const ProductId = (value: string): ProductId => parseUuid(value, 'ProductId');
export const IngredientConceptId = (value: string): IngredientConceptId =>
  parseUuid(value, 'IngredientConceptId');
export const CompatibilityMappingFamilyId = (value: string): CompatibilityMappingFamilyId =>
  parseUuid(value, 'CompatibilityMappingFamilyId');
export const CompatibilityMappingId = (value: string): CompatibilityMappingId =>
  parseUuid(value, 'CompatibilityMappingId');
export const CompatibilityEvidenceId = (value: string): CompatibilityEvidenceId =>
  parseUuid(value, 'CompatibilityEvidenceId');
export const ProductIdentifierId = (value: string): ProductIdentifierId =>
  parseUuid(value, 'ProductIdentifierId');
export const ProductIdentifierNormalizationRuleId = (
  value: string,
): ProductIdentifierNormalizationRuleId => parseUuid(value, 'ProductIdentifierNormalizationRuleId');
export const StagedIdentifierClaimId = (value: string): StagedIdentifierClaimId =>
  parseUuid(value, 'StagedIdentifierClaimId');
export const BrandId = (value: string): BrandId => parseUuid(value, 'BrandId');
export const ManufacturerId = (value: string): ManufacturerId => parseUuid(value, 'ManufacturerId');
export const ProductCategoryId = (value: string): ProductCategoryId => parseUuid(value, 'ProductCategoryId');
export const StorageLocationId = (value: string): StorageLocationId => parseUuid(value, 'StorageLocationId');
export const CompartmentId = (value: string): CompartmentId => parseUuid(value, 'CompartmentId');
export const BatchId = (value: string): BatchId => parseUuid(value, 'BatchId');
export const InventoryMovementId = (value: string): InventoryMovementId => parseUuid(value, 'InventoryMovementId');
export const CommandId = (value: string): CommandId => parseUuid(value, 'CommandId');
export const CorrelationId = (value: string): CorrelationId => parseUuid(value, 'CorrelationId');