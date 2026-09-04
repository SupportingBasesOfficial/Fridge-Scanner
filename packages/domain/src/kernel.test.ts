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
  parseExactDecimalWire,
  parseExactRationalWire,
  parseMoneyWire,
  serializeExactDecimal,
  serializeExactRational,
  serializeMoney,
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

test('exact rational wire codec preserves values beyond JavaScript safe integer range', () => {
  const source = exactRational(
    900719925474099312345678901234567890n,
    700000000000000000000000000000000001n,
  );
  const wire = serializeExactRational(source);

  assert.deepEqual(wire, {
    numerator: '900719925474099312345678901234567890',
    denominator: '700000000000000000000000000000000001',
  });
  assert.equal(typeof JSON.stringify(wire), 'string');
  assert.equal(equalExactRational(parseExactRationalWire(JSON.parse(JSON.stringify(wire))), source), true);
});

test('exact rational wire parser rejects noncanonical or open-ended shapes', () => {
  assert.throws(
    () => parseExactRationalWire({ numerator: '2', denominator: '4' }),
    /must be normalized/,
  );
  assert.throws(
    () => parseExactRationalWire({ numerator: '01', denominator: '2' }),
    /canonical integer strings/,
  );
  assert.throws(
    () => parseExactRationalWire({ numerator: '1', denominator: '-2' }),
    /canonical integer strings/,
  );
  assert.throws(
    () => parseExactRationalWire({ numerator: '1', denominator: '2', ignored: 'field' }),
    /contain only numerator and denominator/,
  );
});

test('exact decimal canonicalizes PostgreSQL numeric text without floating point', () => {
  assert.equal(exactDecimal('01.2300'), '1.23');
  assert.equal(exactDecimal('-0.00'), '0');
  assert.equal(exactDecimal('00012'), '12');
  assert.equal(addExactDecimal(exactDecimal('0.1'), exactDecimal('0.2')), '0.3');
  assert.equal(addExactDecimal(exactDecimal('12.345'), exactDecimal('-2.345')), '10');
  assert.throws(() => exactDecimal('1e-3'), /finite plain decimal/);
  assert.throws(() => exactDecimal(' 1.23 '), /finite plain decimal/);
});

test('exact decimal wire codec round-trips only canonical strings', () => {
  const source = exactDecimal('123456789012345678901234567890.000000000000000001');
  const wire = serializeExactDecimal(source);

  assert.equal(wire, '123456789012345678901234567890.000000000000000001');
  assert.equal(parseExactDecimalWire(JSON.parse(JSON.stringify(wire))), source);
  assert.throws(() => parseExactDecimalWire('01.2300'), /must be canonical/);
  assert.throws(() => parseExactDecimalWire(1.23), /must be a string/);
});

test('money arithmetic is exact and rejects currency mismatch', () => {
  assert.deepEqual(
    addMoney(money(exactDecimal('1.2500'), 'BRL'), money(exactDecimal('0.750'), 'BRL')),
    { amount: '2', currency: 'BRL' },
  );
  assert.throws(
    () => addMoney(money(exactDecimal('1'), 'BRL'), money(exactDecimal('1'), 'USD')),
    /currencies must match/,
  );
});

test('money wire codec is explicit, closed and precision-safe', () => {
  const source = money(
    exactDecimal('999999999999999999999999999999.123456789012345678'),
    'BRL',
  );
  const wire = serializeMoney(source);

  assert.deepEqual(wire, {
    amount: '999999999999999999999999999999.123456789012345678',
    currency: 'BRL',
  });
  assert.deepEqual(parseMoneyWire(JSON.parse(JSON.stringify(wire))), source);
  assert.throws(
    () => parseMoneyWire({ amount: '01.00', currency: 'BRL' }),
    /must be canonical/,
  );
  assert.throws(
    () => parseMoneyWire({ amount: '1', currency: 'BRL', ignored: true }),
    /contain only amount and currency/,
  );
});

test('opaque identifiers accept DB-02 uuid values in canonical text form', () => {
  assert.equal(HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(HouseholdId('00000000-0000-0000-0000-000000000000'), '00000000-0000-0000-0000-000000000000');
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
