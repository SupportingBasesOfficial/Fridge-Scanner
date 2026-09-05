import type { RuntimeConfig } from '@fridge/config';
import {
  PgExternalIdentityPrincipalMapper,
  type PgDatabase,
} from '@fridge/database';
import {
  BearerAuthenticatedPrincipalResolver,
  rejectUnauthenticatedPrincipal,
  type AuthenticatedPrincipalResolver,
} from './auth.js';
import {
  JwtJwksAuthenticationEvidenceVerifier,
  type JwtJwksVerifierOptions,
} from './jwt-jwks-verifier.js';

export type RuntimeAuthenticationVerifierOverrides = Omit<
  JwtJwksVerifierOptions,
  'trust'
>;

export function buildRuntimeAuthenticatedPrincipalResolver(
  config: RuntimeConfig,
  database: PgDatabase,
  verifierOverrides: RuntimeAuthenticationVerifierOverrides = {},
): AuthenticatedPrincipalResolver {
  if (config.authentication === null) {
    return rejectUnauthenticatedPrincipal;
  }

  const verifier = new JwtJwksAuthenticationEvidenceVerifier({
    trust: config.authentication,
    ...verifierOverrides,
  });
  const principalMapper = new PgExternalIdentityPrincipalMapper(database);

  return new BearerAuthenticatedPrincipalResolver(
    verifier,
    principalMapper,
  );
}
