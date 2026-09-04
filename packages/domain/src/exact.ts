import { invalidDomainValue } from './errors.js';

declare const exactRationalBrand: unique symbol;
declare const exactDecimalBrand: unique symbol;
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

export type ExactDecimal = string & { readonly [exactDecimalBrand]: 'ExactDecimal' };

const DECIMAL_INPUT_PATTERN = /^(-?)([0-9]+)(?:\.([0-9]+))?$/;

export function exactDecimal(value: string): ExactDecimal {
  const match = DECIMAL_INPUT_PATTERN.exec(value);
  if (match === null) {
    throw invalidDomainValue('ExactDecimal must be a finite plain decimal string');
  }

  const negative = match[1] === '-';
  const rawWhole = match[2] ?? '0';
  const rawFraction = match[3] ?? '';
  const whole = rawWhole.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  const isZero = whole === '0' && fraction.length === 0;
  const sign = negative && !isZero ? '-' : '';
  const canonical = fraction.length === 0
    ? `${sign}${whole}`
    : `${sign}${whole}.${fraction}`;

  return canonical as ExactDecimal;
}

interface DecimalParts {
  readonly coefficient: bigint;
  readonly scale: number;
}

function decimalParts(value: ExactDecimal): DecimalParts {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const coefficient = BigInt(`${negative ? '-' : ''}${whole}${fraction}`);
  return { coefficient, scale: fraction.length };
}

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function decimalFromParts(coefficient: bigint, scale: number): ExactDecimal {
  if (coefficient === 0n) return exactDecimal('0');

  const negative = coefficient < 0n;
  let digits = (negative ? -coefficient : coefficient).toString();
  if (scale === 0) return exactDecimal(`${negative ? '-' : ''}${digits}`);

  digits = digits.padStart(scale + 1, '0');
  const split = digits.length - scale;
  const fraction = digits.slice(split).replace(/0+$/, '');
  const whole = digits.slice(0, split);
  if (fraction.length === 0) return exactDecimal(`${negative ? '-' : ''}${whole}`);
  return exactDecimal(`${negative ? '-' : ''}${whole}.${fraction}`);
}

export function addExactDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftCoefficient = leftParts.coefficient * powerOfTen(scale - leftParts.scale);
  const rightCoefficient = rightParts.coefficient * powerOfTen(scale - rightParts.scale);
  return decimalFromParts(leftCoefficient + rightCoefficient, scale);
}

export interface Money {
  readonly amount: ExactDecimal;
  readonly currency: string;
  readonly [moneyBrand]: 'Money';
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function asMoney(amount: ExactDecimal, currency: string): Money {
  return Object.freeze({ amount, currency }) as Money;
}

export function money(amount: ExactDecimal, currency: string): Money {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw invalidDomainValue('Money currency must be an uppercase three-letter code');
  }
  return asMoney(amount, currency);
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) throw invalidDomainValue('Money currencies must match');
  return money(addExactDecimal(left.amount, right.amount), left.currency);
}
