import assert from 'node:assert/strict';
import test from 'node:test';
import { InvalidInputError } from '@fridge/application';
import { parseCanonicalExactRationalWire } from './exact-rational-wire.js';

function rejects(value: unknown): void {
  assert.throws(
    () => parseCanonicalExactRationalWire(value),
    (error: unknown) => error instanceof InvalidInputError,
  );
}

test('canonical exact-rational wire accepts only exact reduced decimal representation', () => {
  const value = parseCanonicalExactRationalWire({ numerator: '3', denominator: '2' });
  assert.equal(value.numerator, 3n);
  assert.equal(value.denominator, 2n);
});

test('canonical exact-rational wire rejects reducible fractions instead of normalizing them', () => {
  rejects({ numerator: '2', denominator: '4' });
  rejects({ numerator: '-2', denominator: '4' });
  rejects({ numerator: '0', denominator: '2' });
});

test('canonical exact-rational wire rejects non-decimal and non-canonical integer strings', () => {
  rejects({ numerator: ' 1', denominator: '2' });
  rejects({ numerator: '01', denominator: '2' });
  rejects({ numerator: '+1', denominator: '2' });
  rejects({ numerator: '0x10', denominator: '2' });
  rejects({ numerator: '-0', denominator: '1' });
  rejects({ numerator: '1', denominator: '01' });
  rejects({ numerator: '1', denominator: '0' });
  rejects({ numerator: '1', denominator: '-2' });
});

test('canonical exact-rational wire rejects components beyond PostgreSQL numeric integer range before BigInt parsing', () => {
  const tooManyDigits = '1'.repeat(131_073);
  rejects({ numerator: tooManyDigits, denominator: '1' });
  rejects({ numerator: `-${tooManyDigits}`, denominator: '1' });
  rejects({ numerator: '1', denominator: tooManyDigits });
});

test('canonical exact-rational wire rejects structural ambiguity and extra keys', () => {
  rejects(null);
  rejects([]);
  rejects({ numerator: '1' });
  rejects({ denominator: '1' });
  rejects({ numerator: 1, denominator: '1' });
  rejects({ numerator: '1', denominator: 1 });
  rejects({ numerator: '1', denominator: '2', unit: 'EACH' });
});
