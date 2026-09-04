export type ApplicationErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'HOUSEHOLD_UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL';

export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
  }
}

export class InvalidInputError extends ApplicationError {
  constructor(message = 'input is invalid', cause?: unknown) {
    super('INVALID_INPUT', message, cause);
  }
}

export class UnauthenticatedError extends ApplicationError {
  constructor() {
    super('UNAUTHENTICATED', 'authentication is required');
  }
}

export class HouseholdUnauthorizedError extends ApplicationError {
  constructor() {
    super('HOUSEHOLD_UNAUTHORIZED', 'Household access is not authorized');
  }
}

export class NotFoundError extends ApplicationError {
  constructor() {
    super('NOT_FOUND', 'resource was not found');
  }
}

export class ConflictError extends ApplicationError {
  constructor(message = 'operation conflicts with current state') {
    super('CONFLICT', message);
  }
}

export class IdempotencyConflictError extends ApplicationError {
  constructor() {
    super('IDEMPOTENCY_CONFLICT', 'idempotency key was reused with a different request');
  }
}

export class IdempotencyInProgressError extends ApplicationError {
  constructor() {
    super('IDEMPOTENCY_IN_PROGRESS', 'an operation with this idempotency key is still in progress');
  }
}

export class DependencyUnavailableError extends ApplicationError {
  constructor(message = 'required dependency is unavailable', cause?: unknown) {
    super('DEPENDENCY_UNAVAILABLE', message, cause);
  }
}

export class InternalApplicationError extends ApplicationError {
  constructor(cause?: unknown) {
    super('INTERNAL', 'unexpected internal failure', cause);
  }
}
