import type { ExactDecimal, ExactRational, Money } from './exact.js';
import type { HouseholdId, ProductId } from './identifiers.js';

// These declarations are compile-time proofs for BE-01 opacity. If any
// expectation directive below becomes unused, the protected type has become forgeable.

// @ts-expect-error ExactRational must be created through exactRational().
const forgedRational: ExactRational = { numerator: 1n, denominator: 0n };

// @ts-expect-error ExactDecimal must be created through exactDecimal().
const forgedDecimal: ExactDecimal = '01.20';

// @ts-expect-error Money must be created through money().
const forgedMoney: Money = { amount: '1.00', currency: 'BRL' };

// @ts-expect-error HouseholdId and ProductId are not interchangeable.
const wrongIdentifier: ProductId = '' as HouseholdId;

void forgedRational;
void forgedDecimal;
void forgedMoney;
void wrongIdentifier;
