export type DomainErrorCode =
  | 'DOMAIN_INVALID_VALUE'
  | 'DOMAIN_INVARIANT_VIOLATION'
  | 'DOMAIN_CONFLICT';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function invalidDomainValue(message: string): DomainError {
  return new DomainError('DOMAIN_INVALID_VALUE', message);
}

export function invariantViolation(message: string): DomainError {
  return new DomainError('DOMAIN_INVARIANT_VIOLATION', message);
}

export function domainConflict(message: string): DomainError {
  return new DomainError('DOMAIN_CONFLICT', message);
}
