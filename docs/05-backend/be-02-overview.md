# FridgeScanner — BE-02 Identity & Authentication Boundary

## Status

BE-02 is the first backend phase after accepted BE-01.

Accepted upstream foundation:

- DB-00 — Domain Discovery & Invariants
- DB-01 — Logical / Relational Database Model
- DB-02 — PostgreSQL Physical Schema & Enforcement
- BE-00 — Backend Foundation & Runtime Contracts
- BE-01 — Application Contracts & Domain Kernel, including the accepted narrow proving vertical slice

BE-02 consumes those contracts. It does not reinterpret Household authorization, tenant isolation, domain identity, application errors or runtime composition for identity-provider convenience.

## Objective

Establish a trusted, provider-replaceable authentication boundary that converts externally supplied authentication evidence into a platform-owned verified `PrincipalId` before application use cases run.

The target authority flow is:

```text
Untrusted HTTP request
  -> authentication adapter
  -> verified platform PrincipalId
  -> application use case
  -> current Household authorization transaction
  -> tenant work
```

Authentication answers **who is this principal?** Household authorization separately answers **may this principal act in this Household now?** These decisions must never collapse into one provider claim or token check.

## Why this phase exists

BE-01 deliberately made the proving route fail closed in runtime because no real principal-authentication adapter existed. That was correct: a raw `x-principal-id`, requested user identifier, unsigned token payload or provider claim is not authority.

Before real catalog, inventory, procurement or other feature APIs are exposed, the backend needs a trusted identity boundary with explicit verification, provider-neutral output, stable failure semantics and tests proving that authentication cannot bypass current Household authorization.

## Boundary model

### Untrusted side

The HTTP adapter may receive evidence such as:

- Authorization headers;
- secure session cookies;
- bearer tokens;
- provider-issued JWTs or opaque tokens;
- provider session handles.

All such values are untrusted until verified by the configured authentication adapter.

### Trusted platform output

Successful authentication yields only the stable platform identity needed by application code, initially:

```text
AuthenticatedPrincipal {
  principalId: PrincipalId
}
```

Provider subject identifiers, token objects, raw claims and provider SDK models remain inside the adapter unless a later accepted contract explicitly requires additional provider-neutral evidence.

## Required BE-02 contracts

### 1. Authentication port

Delivery/runtime composition owns an authentication capability that can resolve a verified platform principal from request authentication evidence.

Application/domain code must not depend on Fastify request objects, JWT libraries or provider SDK types.

### 2. Provider identity mapping

A provider identity is not automatically a platform `PrincipalId`.

The adapter must use an accepted mapping rule that binds verified provider identity to the platform user identity represented by DB-02. Mapping behavior must be explicit, deterministic and fail closed when no valid mapping exists.

BE-02 must not silently create users or memberships merely because a provider identity is valid.

### 3. Verification before trust

Token/session evidence is trusted only after the configured adapter verifies all evidence required by that mechanism. Parsing is not verification.

Where applicable, verification must cover signature/integrity, issuer/provider identity, intended audience/resource, temporal validity and any other mechanism-specific invariant required to prevent accepting evidence minted for another trust boundary.

### 4. Authentication is not Household authorization

A verified `PrincipalId` never proves access to a requested Household.

Every Household-scoped use case continues through the accepted authorized Household transaction boundary, which validates current membership and produces the verified transaction capability.

### 5. Stable failures and nondisclosure

Authentication failures map to provider-neutral application/delivery semantics.

The public boundary must not leak provider internals, token parsing errors, key identifiers, raw claim values or whether an unrelated Household exists.

### 6. Revocation/currentness model

BE-02 must define how the chosen authentication mechanism establishes current validity and what guarantees are and are not available for revocation/session termination.

A cryptographically valid token is not automatically equivalent to current platform authorization. Household membership is always checked independently at execution time.

### 7. Credentials do not enter domain/application objects

Raw tokens, cookies, secrets, refresh tokens and provider sessions must not be passed into use cases, stored in domain entities or logged.

### 8. Logging and observability

Authentication events may record safe operational metadata such as request correlation, adapter outcome category and timing, but must redact credentials and avoid emitting sensitive claim payloads.

### 9. Provider replacement

Provider-specific code is isolated behind adapters and runtime configuration. Replacing the provider must not require changing domain/application contracts or Household authorization semantics.

### 10. Narrow proving integration

BE-02 may upgrade the accepted BE-01 proving route so that it is reachable with real verified authentication evidence instead of the fail-closed placeholder.

That upgrade remains a proving fixture. It does not authorize broad feature CRUD.

## Explicitly not part of BE-02

Unless strictly necessary to prove the authentication boundary, BE-02 excludes:

- Household membership management;
- role administration;
- catalog/product CRUD;
- inventory mutations;
- procurement/receiving;
- shopping/replenishment;
- recipe/preparation workflows;
- frontend/BFF implementation;
- social-login UI;
- password-reset UX;
- broad account-management APIs;
- production hosting configuration.

## Required CI gate

BE-02 cannot be accepted until CI proves on the exact reviewed HEAD:

- reproducible install;
- existing dependency-boundary checks;
- strict typecheck/build/tests;
- authentication adapter contract tests;
- malformed/forged/expired/wrong-boundary evidence rejection for the chosen mechanism;
- provider identity → platform principal mapping behavior;
- runtime proving route fails closed without valid authentication;
- valid authentication still requires current Household authorization;
- credentials are not exposed in public errors/logging fixtures;
- DB-02/RLS regression;
- container regression;
- no known material review findings.

## Exit rule

BE-02 is CLEAN only when the backend can establish a verified platform principal through a replaceable authentication adapter while preserving the stronger invariant that authentication is not Household authorization.

A token that parses or verifies is not enough. The trust boundary, platform identity mapping, fail-closed behavior, nondisclosure, dependency direction, current Household authorization and exact-HEAD CI/review gate must all be clean.
