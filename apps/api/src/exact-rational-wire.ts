import { InvalidInputError, exactRational } from '@fridge/application';

const CANONICAL_SIGNED_INTEGER = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/;
const CANONICAL_POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

export function parseCanonicalExactRationalWire(value: unknown, label = 'Quantity') {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidInputError(`${label} is invalid`);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'denominator' || keys[1] !== 'numerator') {
    throw new InvalidInputError(`${label} must contain exactly numerator and denominator`);
  }

  const numerator = record.numerator;
  const denominator = record.denominator;
  if (
    typeof numerator !== 'string'
    || typeof denominator !== 'string'
    || !CANONICAL_SIGNED_INTEGER.test(numerator)
    || !CANONICAL_POSITIVE_INTEGER.test(denominator)
  ) {
    throw new InvalidInputError(`${label} numerator and denominator must be canonical decimal integer strings`);
  }

  const numeratorValue = BigInt(numerator);
  const denominatorValue = BigInt(denominator);
  if (gcd(numeratorValue, denominatorValue) !== 1n) {
    throw new InvalidInputError(`${label} must already be reduced to canonical form`);
  }

  return exactRational(numeratorValue, denominatorValue);
}
