import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HouseholdId,
  addExactDecimal,
  addExactRational,
  addMoney,
  equalExactRational,
  exactDecimal,
  exactRational,
  instant,
  money,
} from './index.js';

test('exact rational normalizes equivalent values', () => {
  assert.deepEqual(exactRational(2n, 4n), { numerator: 1n, denominator: 2n });
  assert.deepEqual(exactRational(2n, -4n), { numerator: -1n, denominator: 2n });
  assert.deepEqual(exactRational(0n, -99n), { numerator: 0n, denominator: 1n });
});

test('exact rational arithmetic remains exact', () => {
  const value = addExactRational(exactRational(1n, 10n), exactRational(1n, 10n));
  assert.equal(equalExactRational(value, exactRational(1n, 5n)), true);
});

test('invalid rational denominator fails closed', () => {
  assert.throws(() => exactRational(1n, 0n), /denominator must not be zero/);
});

test('exact decimal preserves PostgreSQL numeric semantics without floating point', () => {
  assert.equal(addExactDecimal(exactDecimal('0.1'), exactDecimal('0.2')), '0.3');
  assert.equal(addExactDecimal(exactDecimal('12.345'), exactDecimal('-2.345')), '10');
  assert.throws(() => exactDecimal('01.20'), /canonical finite decimal/);
  assert.throws(() => exactDecimal('1e-3'), /canonical finite decimal/);
  assert.throws(() => exactDecimal('1.2300'), /canonical finite decimal/);
});

test('money arithmetic is exact and rejects currency mismatch', () => {
  assert.deepEqual(
    addMoney(money(exactDecimal('1.25'), 'BRL'), money(exactDecimal('0.75'), 'BRL')),
    { amount: '2', currency: 'BRL' },
  );
  assert.throws(
    () => addMoney(money(exactDecimal('1'), 'BRL'), money(exactDecimal('1'), 'USD')),
    /currencies must match/,
  );
});

test('opaque identifiers validate canonical UUID input', () => {
  assert.equal(HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.throws(() => HouseholdId('household-from-request-header'), /Invalid HouseholdId/);
  assert.throws(() => HouseholdId('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'), /Invalid HouseholdId/);
});

test('instant accepts valid UTC timestamps including leap day', () => {
  assert.equal(instant('2026-09-04T15:26:17Z'), '2026-09-04T15:26:17Z');
  assert.equal(instant('2024-02-29T23:59:59.123456789Z'), '2024-02-29T23:59:59.123456789Z');
});

test('instant rejects offset, ambiguous, normalized-invalid and out-of-range timestamps', () => {
  assert.throws(() => instant('2026-09-04T12:26:17-03:00'), /UTC RFC3339/);
  assert.throws(() => instant('2026-09-04 15:26:17'), /UTC RFC3339/);
  assert.throws(() => instant('2026-02-30T00:00:00Z'), /UTC RFC3339/);
  assert.throws(() => instant('2026-09-04T24:00:00Z'), /UTC RFC3339/);
  assert.throws(() => instant('2026-13-01T00:00:00Z'), /UTC RFC3339/);
  assert.throws(() => instant('2026-01-01T00:60:00Z'), /UTC RFC3339/);
  assert.throws(() => instant('2026-01-01T00:00:60Z'), /UTC RFC3339/);
});
