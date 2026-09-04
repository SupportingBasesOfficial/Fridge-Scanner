import { invalidDomainValue } from './errors.js';

declare const brand: unique symbol;

type Brand<TName extends string> = string & { readonly [brand]: TName };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function parseUuid<TName extends string>(value: string, name: TName): Brand<TName> {
  if (!UUID_PATTERN.test(value)) {
    throw invalidDomainValue(`Invalid ${name}`);
  }

  return value as Brand<TName>;
}

export type PrincipalId = Brand<'PrincipalId'>;
export type HouseholdId = Brand<'HouseholdId'>;
export type UserId = Brand<'UserId'>;
export type MembershipId = Brand<'MembershipId'>;
export type ProductId = Brand<'ProductId'>;
export type StorageLocationId = Brand<'StorageLocationId'>;
export type BatchId = Brand<'BatchId'>;
export type InventoryMovementId = Brand<'InventoryMovementId'>;
export type CommandId = Brand<'CommandId'>;
export type CorrelationId = Brand<'CorrelationId'>;

export const PrincipalId = (value: string): PrincipalId => parseUuid(value, 'PrincipalId');
export const HouseholdId = (value: string): HouseholdId => parseUuid(value, 'HouseholdId');
export const UserId = (value: string): UserId => parseUuid(value, 'UserId');
export const MembershipId = (value: string): MembershipId => parseUuid(value, 'MembershipId');
export const ProductId = (value: string): ProductId => parseUuid(value, 'ProductId');
export const StorageLocationId = (value: string): StorageLocationId => parseUuid(value, 'StorageLocationId');
export const BatchId = (value: string): BatchId => parseUuid(value, 'BatchId');
export const InventoryMovementId = (value: string): InventoryMovementId => parseUuid(value, 'InventoryMovementId');
export const CommandId = (value: string): CommandId => parseUuid(value, 'CommandId');
export const CorrelationId = (value: string): CorrelationId => parseUuid(value, 'CorrelationId');
