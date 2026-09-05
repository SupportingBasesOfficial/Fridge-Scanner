import type { FastifyRequest } from 'fastify';
import {
  DependencyUnavailableError,
  PrincipalId,
  UnauthenticatedError,
} from '@fridge/application';

const BEARER_AUTHORIZATION_PATTERN = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i;

export interface BearerAuthenticationEvidence {
  readonly kind: 'bearer';
  readonly token: string;
}

export interface VerifiedExternalIdentity {
  readonly authority: string;
  readonly subject: string;
}

export interface AuthenticationEvidenceVerifier {
  verify(evidence: BearerAuthenticationEvidence): Promise<VerifiedExternalIdentity>;
}

export interface PlatformPrincipalMapper {
  resolve(identity: VerifiedExternalIdentity): Promise<PrincipalId>;
}

export interface AuthenticatedPrincipalResolver {
  resolve(request: FastifyRequest): Promise<PrincipalId>;
}

export const rejectUnauthenticatedPrincipal: AuthenticatedPrincipalResolver = {
  async resolve() {
    throw new UnauthenticatedError();
  },
};

function extractBearerEvidence(request: FastifyRequest): BearerAuthenticationEvidence {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string') {
    throw new UnauthenticatedError();
  }

  const match = BEARER_AUTHORIZATION_PATTERN.exec(authorization);
  if (match === null || match[1] === undefined) {
    throw new UnauthenticatedError();
  }

  return {
    kind: 'bearer',
    token: match[1],
  };
}

function snapshotVerifiedIdentity(identity: unknown): VerifiedExternalIdentity {
  try {
    if (typeof identity !== 'object' || identity === null) {
      throw new UnauthenticatedError();
    }

    const authority = Reflect.get(identity, 'authority');
    const subject = Reflect.get(identity, 'subject');

    if (
      typeof authority !== 'string'
      || typeof subject !== 'string'
      || authority.length === 0
      || subject.length === 0
    ) {
      throw new UnauthenticatedError();
    }

    return { authority, subject };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      throw error;
    }
    throw new UnauthenticatedError();
  }
}

async function verifyEvidence(
  verifier: AuthenticationEvidenceVerifier,
  evidence: BearerAuthenticationEvidence,
): Promise<VerifiedExternalIdentity> {
  try {
    const identity: unknown = await verifier.verify(evidence);
    return snapshotVerifiedIdentity(identity);
  } catch (error) {
    if (error instanceof DependencyUnavailableError) {
      throw new DependencyUnavailableError();
    }
    throw new UnauthenticatedError();
  }
}

async function mapPrincipal(
  principalMapper: PlatformPrincipalMapper,
  identity: VerifiedExternalIdentity,
): Promise<PrincipalId> {
  try {
    return await principalMapper.resolve(identity);
  } catch (error) {
    if (error instanceof DependencyUnavailableError) {
      throw new DependencyUnavailableError();
    }
    throw new UnauthenticatedError();
  }
}

export class BearerAuthenticatedPrincipalResolver implements AuthenticatedPrincipalResolver {
  constructor(
    private readonly verifier: AuthenticationEvidenceVerifier,
    private readonly principalMapper: PlatformPrincipalMapper,
  ) {}

  async resolve(request: FastifyRequest): Promise<PrincipalId> {
    const evidence = extractBearerEvidence(request);
    const externalIdentity = await verifyEvidence(this.verifier, evidence);
    return mapPrincipal(this.principalMapper, externalIdentity);
  }
}
