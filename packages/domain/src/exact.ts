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
  if (denominator === 0n) {
    throw new Error('ExactRational denominator must not be zero');
  }

  if (numerator === 0n) {
    return Object.freeze({ numerator: 0n, denominator: 1n });
  }

  const sign = denominator < 0n ? -1n : 1n;
  const normalizedNumerator = numerator * sign;
  const normalizedDenominator = denominator * sign;
  const divisor = gcd(normalizedNumerator, normalizedDenominator);

  return Object.freeze({
    numerator: normalizedNumerator / divisor,
    denominator: normalizedDenominator / divisor,
  });
}

export function addExactRational(left: ExactRational, right: ExactRational): ExactRational {
  return exactRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiplyExactRational(left: ExactRational, right: ExactRational): ExactRational {
  return exactRational(
    left.numerator * right.numerator,
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
    throw new Error('Money currency must be an uppercase ISO-4217-style code');
  }

  return Object.freeze({ minorUnits, currency });
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error('Money currencies must match');
  }

  return money(left.minorUnits + right.minorUnits, left.currency);
}
