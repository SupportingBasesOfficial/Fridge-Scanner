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

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function serializeExactRational(value: ExactRational): ExactRationalWire {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  };
}

export function parseExactRationalWire(value: unknown): ExactRational {
  if (!isRecord(value) || !hasExactKeys(value, ['numerator', 'denominator'])) {
    throw invalidDomainValue('ExactRational wire value must contain only numerator and denominator');
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
  if (!isRecord(value) || !hasExactKeys(value, ['amount', 'currency'])) {
    throw invalidDomainValue('Money wire value must contain only amount and currency');
  }
  if (typeof value.currency !== 'string') {
    throw invalidDomainValue('Money wire currency must be a string');
  }

  return money(parseExactDecimalWire(value.amount), value.currency);
}
