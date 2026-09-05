# FridgeScanner — BE-02 Identity Boundary

## Status

BE-02 — **Identity Boundary** is accepted as CLEAN once `be-02-acceptance.md` is reviewed and merged.

Accepted upstream foundation:

- DB-00 — Domain Discovery & Invariants
- DB-01 — Logical / Relational Database Model
- DB-02 — PostgreSQL Physical Schema & Enforcement
- BE-00 — Backend Foundation & Runtime Contracts
- BE-01 — Application Contracts & Domain Kernel

The final executable BE-02 baseline before acceptance is `aeb7c7ae07df0504e9850b714a0d6ccf6d75ce4d`.

BE-02 consumes those contracts. It may not reinterpret Household authorization, tenant isolation, platform identity, application errors, exact-value semantics or runtime composition for identity-provider convenience.

## Objective

Establish a trusted, provider-replaceable identity/authentication boundary that converts externally supplied authentication evidence into a platform-owned verified `PrincipalId` before application use cases execute.

The authority flow is:

```text
Untrusted HTTP request
  -> authentication evidence extraction
  -> provider/mechanism verification adapter
  -> verified external identity
  -> explicit platform principal mapping
  -> authenticated PrincipalId
  -> application use case
  -> current Household authorization transaction
  -> tenant work
```

Authentication answers **who is this platform principal?** Household authorization separately answers **may this principal act in this Household now?** These authorities must never collapse into one token claim, provider role, requested identifier or cached membership assertion.

## Core trust boundary

### Untrusted inputs

The delivery edge may receive Authorization headers, secure session cookies, bearer tokens, provider JWTs, opaque tokens, session handles and other mechanism-specific evidence.

All such values are untrusted until the configured authentication adapter completes mechanism-appropriate verification. Parsing or decoding is not verification.

### Trusted platform output

Successful authentication yields a minimal provider-neutral value:

```text
AuthenticatedPrincipal {
  principalId: PrincipalId
}
```

Provider subject identifiers, provider SDK objects, raw token claims, token strings, refresh credentials and session secrets remain outside application/domain contracts.

## Required contracts

### 1. Evidence extraction and verification are explicit

Delivery extracts candidate evidence; the authentication adapter verifies it. Missing, malformed, forged, expired, not-yet-valid, wrong-issuer, wrong-audience/resource or otherwise invalid evidence fails closed where those concepts apply to the selected mechanism.

### 2. Provider identity mapping is explicit

A verified external identity is not automatically a platform `PrincipalId`.

BE-02 requires a deterministic mapping contract between verified provider identity and an existing platform principal represented by the accepted database model. Missing, ambiguous or invalid mappings fail authentication.

BE-02 does not silently provision users, Household memberships or roles from a valid provider identity.

### 3. Authentication and Household authorization remain separate

A verified `PrincipalId` never proves access to a requested Household. Every Household-scoped operation continues through the accepted BE-00/BE-01 authorization transaction boundary and current membership verification.

### 4. Currentness and revocation are explicit

BE-02 must document what the selected authentication mechanism proves about currentness, expiry, revocation and session termination. Cryptographic validity alone must never be presented as stronger authority than the mechanism actually provides.

Authentication currentness still does not replace execution-time Household authorization.

### 5. Credentials terminate at the boundary

Raw tokens, cookies, refresh tokens, session secrets and provider credentials do not enter use cases, domain objects or persistence ports and are not emitted in ordinary logs or public errors.

### 6. Failures are provider-neutral

Provider/parser/SDK failures map into stable platform delivery semantics such as unauthenticated or authentication dependency unavailable. Public responses do not expose raw claims, key identifiers, provider exception classes or unrelated tenant existence.

### 7. Provider replacement remains possible

Provider-specific libraries, key discovery, session formats, token formats and hosted identity services remain adapters/runtime configuration. Replacing the provider must not require changing domain/application contracts or Household authorization semantics.

### 8. Runtime configuration fails closed

Required trust configuration is validated at startup. Missing issuer/audience/key/session configuration or other mandatory mechanism settings cannot silently degrade verification.

### 9. Observability is credential-safe

Authentication telemetry may capture correlation identifiers, outcome categories, timing and safe adapter metadata. Authorization headers, cookies, raw token payloads, refresh credentials and sensitive claims are omitted or redacted.

### 10. Narrow proving integration only

BE-02 may upgrade the accepted BE-01 proving route so it can run with a real verified platform principal rather than a fail-closed placeholder. That route remains a proving fixture and does not authorize broad feature CRUD.

## Security properties that must remain true

- request-supplied principal identifiers are never authority;
- provider identity is never platform identity by implication;
- token validity is never Household authorization;
- requested Household identity is never trusted tenancy context;
- authentication failure cannot fall back to headers, body fields or query parameters;
- stale long-lived authentication state cannot freeze Household membership or role authority;
- provider credentials and raw claims do not cross into domain/application contracts;
- platform nondisclosure semantics remain intact across authentication failures.

## Explicitly not part of BE-02

Unless strictly required to prove the identity boundary, BE-02 excludes Household membership management, role administration, catalog/product CRUD, inventory mutations, procurement/receiving, shopping/replenishment, recipe/preparation workflows, frontend/BFF implementation, social-login UI, password-reset UX, broad account-management APIs and production hosting rollout.

## Required implementation shape

The implementation should preserve the accepted dependency direction:

```text
Domain <- Application <- Adapters / Delivery / Runtime
```

A provider-specific authentication adapter belongs at the outer boundary. Platform principal mapping may use an intent-specific persistence port, but application/domain contracts must remain provider-neutral.

No generic identity-provider repository abstraction is required merely to hide an SDK. Abstractions must represent stable platform intent.

## Test and CI gate

BE-02 cannot be accepted until the exact reviewed HEAD proves, as applicable to the chosen mechanism:

- valid evidence resolves exactly one existing platform principal;
- missing credentials fail closed;
- malformed/forged evidence is rejected;
- expired and not-yet-valid evidence is rejected where temporal claims exist;
- wrong issuer and wrong audience/resource are rejected where applicable;
- unknown or ambiguous provider-to-platform mapping fails closed;
- raw request `PrincipalId` injection cannot bypass authentication;
- a valid authenticated principal still cannot bypass current Household membership verification;
- revoked/removed Household membership takes effect at execution time independently of token validity;
- provider internals and credentials are absent from public errors and ordinary logs;
- protected dependency boundaries remain clean;
- DB-02/RLS regression remains clean;
- container non-root/liveness/readiness behavior remains clean.

## Exit rule

BE-02 is complete only when a real request can cross the identity boundary with verified evidence, resolve to a platform-owned principal, execute the narrow proving route through current Household authorization, and reject adversarial trust-boundary confusion without leaking provider concerns into application/domain code.

Passing tests do not override an architectural or authority invariant violation. Any genuine contradiction with DB-00/DB-01/DB-02/BE-00/BE-01 must be governed explicitly rather than hidden in framework, JWT, session, provider SDK, SQL or deployment convenience.
