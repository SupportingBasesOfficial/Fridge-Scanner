import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApplicationError,
  ConflictError,
  DependencyUnavailableError,
  HouseholdUnauthorizedError,
  IdempotencyConflictError,
  IdempotencyInProgressError,
  InternalApplicationError,
  InvalidInputError,
  NotFoundError,
  UnauthenticatedError,
} from './errors.js';

const CASES = [
  [new InvalidInputError(), 'INVALID_INPUT'],
  [new UnauthenticatedError(), 'UNAUTHENTICATED'],
  [new HouseholdUnauthorizedError(), 'HOUSEHOLD_UNAUTHORIZED'],
  [new NotFoundError(), 'NOT_FOUND'],
  [new ConflictError(), 'CONFLICT'],
  [new IdempotencyConflictError(), 'IDEMPOTENCY_CONFLICT'],
  [new IdempotencyInProgressError(), 'IDEMPOTENCY_IN_PROGRESS'],
  [new DependencyUnavailableError(), 'DEPENDENCY_UNAVAILABLE'],
  [new InternalApplicationError(), 'INTERNAL'],
] as const;

test('application errors expose stable provider-neutral codes', () => {
  for (const [error, expectedCode] of CASES) {
    assert.ok(error instanceof ApplicationError);
    assert.equal(error.code, expectedCode);
    assert.equal(error.name, error.constructor.name);
  }
});

test('application error can retain an internal cause without exposing provider shape as code', () => {
  const providerFailure = new Error('ECONNREFUSED database-host');
  const error = new DependencyUnavailableError('dependency unavailable', providerFailure);

  assert.equal(error.code, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(error.cause, providerFailure);
  assert.equal(error.message, 'dependency unavailable');
});
