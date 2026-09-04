import type { ExactRational, Money } from './exact.js';
import type { HouseholdId, ProductId } from './identifiers.js';

// These declarations are compile-time proofs for BE-01 opacity. If any
// @ts-expect-error becomes unused, the protected type has become forgeable.

// @ts-expect-error ExactRational must be created through exactRational().
const forgedRational: ExactRational = { numerator: 1n, denominator: 0n };

// @ts-expect-error Money must be created through money().
const forgedMoney: Money = { minorUnits: 100n, currency: 'BRL' };

// @ts-expect-error HouseholdId and ProductId are not interchangeable.
const wrongIdentifier: ProductId = '' as HouseholdId;

void forgedRational;
void forgedMoney;
void wrongIdentifier;
