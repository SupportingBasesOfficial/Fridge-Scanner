import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HouseholdId,
  addExactRational,
  addMoney,
  equalExactRational,
  exactRational,
  instant,
  money,
} from './index.js';

test('exact rational normalizes signs and common divisors', () => {
  assert.deepEqual(exactRational(2n, 4n), { numerator: 1n, denominator: 2n });
  assert.deepEqual(exactRational(2n, -4n), { numerator: -1n, denominator: 2n });
  assert.deepEqual(exactRational(0n, -99n), { numerator: 0n, denominator: 1n });
});

test('exact rational arithmetic remains exact for values binary floating point cannot represent exactly', () => {
  const oneTenth = exactRational(1n, 10n);
  const twoTenths = addExactRational(oneTenth, oneTenth);

  assert.equal(equalExactRational(twoTenths, exactRational(1n, 5n)), true);
});

test('exact rational rejects a zero denominator', () => {
  assert.throws(() => exactRational(1n, 0n), /denominator must not be zero/);
});

test('money adds only equal currencies', () => {
  assert.deepEqual(addMoney(money(125n, 'BRL'), money(75n, 'BRL')), {
    minorUnits: 200n,
    currency: 'BRL',
  });
  assert.throws(() => addMoney(money(1n, 'BRL'), money(1n, 'USD')), /currencies must match/);
});

test('domain identifiers reject non-canonical UUID input', () => {
  assert.equal(
    HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  assert.throws(() => HouseholdId('household-from-request-header'), /Invalid HouseholdId/);
});

test('instant accepts explicit UTC timestamps and rejects offset/ambiguous timestamps', () => {
  assert.equal(instant('2026-09-04T15:26:17Z'), '2026-09-04T15:26:17Z');
  assert.throws(() => instant('2026-09-04T12:26:17-03:00'), /UTC RFC3339/);
  assert.throws(() => instant('2026-09-04 15:26:17'), /UTC RFC3339/);
});
