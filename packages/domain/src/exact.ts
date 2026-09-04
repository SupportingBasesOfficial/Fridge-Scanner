import { invalidDomainValue } from './errors.js';

declare const exactRationalBrand: unique symbol;
declare const moneyBrand: unique symbol;

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
  readonly [exactRationalBrand]: 'ExactRational';
}

function asExactRational(numerator: bigint, denominator: bigint): ExactRational {
  return Object.freeze({ numerator, denominator }) as ExactRational;
}

export function exactRational(numerator: bigint, denominator: bigint): ExactRational {
  if (denominator === 0n) throw invalidDomainValue('ExactRational denominator must not be zero');
  if (numerator === 0n) return asExactRational(0n, 1n);

  const sign = denominator < 0n ? -1n : 1n;
  const n = numerator * sign;
  const d = denominator * sign;
  const divisor = gcd(n, d);
  return asExactRational(n / divisor, d / divisor);
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
  readonly [moneyBrand]: 'Money';
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function asMoney(minorUnits: bigint, currency: string): Money {
  return Object.freeze({ minorUnits, currency }) as Money;
}

export function money(minorUnits: bigint, currency: string): Money {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw invalidDomainValue('Money currency must be an uppercase three-letter code');
  }
  return asMoney(minorUnits, currency);
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) throw invalidDomainValue('Money currencies must match');
  return money(left.minorUnits + right.minorUnits, left.currency);
}
