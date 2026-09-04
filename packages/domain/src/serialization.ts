import { invalidDomainValue } from './errors.js';
import {
  exactDecimal,
  exactRational,
  money,
  type ExactDecimal,
  type ExactRational,
  type Money,
} from './exact.js';

const CANONICAL_INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;
const CANONICAL_POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

export interface ExactRationalWire {
  readonly numerator: string;
  readonly denominator: string;
}

export interface MoneyWire {
  readonly amount: string;
  readonly currency: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serializeExactRational(value: ExactRational): ExactRationalWire {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  };
}

export function parseExactRationalWire(value: unknown): ExactRational {
  if (!isRecord(value)) {
    throw invalidDomainValue('ExactRational wire value must be an object');
  }

  const numerator = value.numerator;
  const denominator = value.denominator;
  if (
    typeof numerator !== 'string'
    || typeof denominator !== 'string'
    || !CANONICAL_INTEGER_PATTERN.test(numerator)
    || !CANONICAL_POSITIVE_INTEGER_PATTERN.test(denominator)
  ) {
    throw invalidDomainValue('ExactRational wire value must contain canonical integer strings');
  }

  const parsed = exactRational(BigInt(numerator), BigInt(denominator));
  const canonical = serializeExactRational(parsed);
  if (canonical.numerator !== numerator || canonical.denominator !== denominator) {
    throw invalidDomainValue('ExactRational wire value must be normalized');
  }

  return parsed;
}

export function serializeExactDecimal(value: ExactDecimal): string {
  return value;
}

export function parseExactDecimalWire(value: unknown): ExactDecimal {
  if (typeof value !== 'string') {
    throw invalidDomainValue('ExactDecimal wire value must be a string');
  }

  const parsed = exactDecimal(value);
  if (parsed !== value) {
    throw invalidDomainValue('ExactDecimal wire value must be canonical');
  }
  return parsed;
}

export function serializeMoney(value: Money): MoneyWire {
  return {
    amount: serializeExactDecimal(value.amount),
    currency: value.currency,
  };
}

export function parseMoneyWire(value: unknown): Money {
  if (!isRecord(value)) {
    throw invalidDomainValue('Money wire value must be an object');
  }

  return money(
    parseExactDecimalWire(value.amount),
    typeof value.currency === 'string'
      ? value.currency
      : (() => { throw invalidDomainValue('Money wire currency must be a string'); })(),
  );
}
