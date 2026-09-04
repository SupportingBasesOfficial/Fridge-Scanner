import { invalidDomainValue } from './errors.js';

declare const instantBrand: unique symbol;
export type Instant = string & { readonly [instantBrand]: 'Instant' };

const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export function instant(value: string): Instant {
  if (!UTC_INSTANT_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw invalidDomainValue('Instant must be a valid UTC RFC3339 timestamp');
  }
  return value as Instant;
}
