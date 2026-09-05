import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedExternalIdentity } from './identity.js';

test('verified external identity preserves exact authority and subject', () => {
  const identity = verifiedExternalIdentity(
    'https://issuer.example.test',
    'provider-subject-001',
  );

  assert.deepEqual(identity, {
    authority: 'https://issuer.example.test',
    subject: 'provider-subject-001',
  });
  assert.equal(Object.isFrozen(identity), true);
});

test('verified external identity rejects blank or whitespace-confused values', () => {
  assert.throws(() => verifiedExternalIdentity('', 'subject'), /must not be blank/);
  assert.throws(() => verifiedExternalIdentity('issuer', '   '), /must not be blank/);
  assert.throws(
    () => verifiedExternalIdentity(' issuer', 'subject'),
    /surrounding whitespace/,
  );
  assert.throws(
    () => verifiedExternalIdentity('issuer', 'subject '),
    /surrounding whitespace/,
  );
});

test('verified external identity rejects unbounded authority and subject values', () => {
  assert.throws(
    () => verifiedExternalIdentity('a'.repeat(513), 'subject'),
    /maximum length/,
  );
  assert.throws(
    () => verifiedExternalIdentity('issuer', 's'.repeat(1025)),
    /maximum length/,
  );
});
