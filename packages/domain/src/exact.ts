import { invalidDomainValue } from './errors.js';

function gcd(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;

  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left;
}

export interface ExactRational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export function exactRational(numerator: bigint, denominator: bigint): ExactRational {
  if (denominator === 0n) throw invalidDomainValue('ExactRational denominator must not be zero');
  if (numerator === 0n) return Object.freeze({ numerator: 0n, denominator: 1n });

  const sign = denominator < 0n ? -1n : 1n;
  const n = numerator * sign;
  const d = denominator * sign;
  const divisor = gcd(n, d);
  return Object.freeze({ numerator: n / divisor, denominator: d / divisor });
}

export function addExactRational(left: ExactRational, right: ExactRational): ExactRational {
  return exactRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function equalExactRational(left: ExactRational, right: ExactRational): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

export interface Money {
  readonly minorUnits: bigint;
  readonly currency: string;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function money(minorUnits: bigint, currency: string): Money {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw invalidDomainValue('Money currency must be an uppercase three-letter code');
  }
  return Object.freeze({ minorUnits, currency });
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) throw invalidDomainValue('Money currencies must match');
  return money(left.minorUnits + right.minorUnits, left.currency);
}
