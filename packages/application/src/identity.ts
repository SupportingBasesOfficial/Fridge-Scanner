import type { PrincipalId } from '@fridge/domain';

const AUTHORITY_MAX_LENGTH = 512;
const SUBJECT_MAX_LENGTH = 1024;

function requireExactNonBlankBounded(value: string, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`);
  }
  if (value.length === 0 || value.trim().length === 0) {
    throw new TypeError(`${label} must not be blank`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${label} must not contain surrounding whitespace`);
  }
  if (value.length > maxLength) {
    throw new TypeError(`${label} exceeds maximum length`);
  }

  return value;
}

export interface VerifiedExternalIdentity {
  readonly authority: string;
  readonly subject: string;
}

export function verifiedExternalIdentity(
  authority: string,
  subject: string,
): VerifiedExternalIdentity {
  return Object.freeze({
    authority: requireExactNonBlankBounded(
      authority,
      'external identity authority',
      AUTHORITY_MAX_LENGTH,
    ),
    subject: requireExactNonBlankBounded(
      subject,
      'external identity subject',
      SUBJECT_MAX_LENGTH,
    ),
  });
}

export interface ExternalIdentityPrincipalResolver {
  resolvePrincipal(identity: VerifiedExternalIdentity): Promise<PrincipalId | null>;
}
