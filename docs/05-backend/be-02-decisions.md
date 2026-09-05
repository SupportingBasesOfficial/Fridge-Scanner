# FridgeScanner — BE-02 Decisions

## Status

This register defines the initial normative decisions for BE-02 — Identity Boundary. It becomes authoritative only after the BE-02 baseline is reviewed and merged.

## B2-001 — Authentication and Household authorization are separate authorities

**Decision:** authentication establishes a verified platform principal; Household authorization is evaluated separately through the accepted BE-00/BE-01 authorized Household transaction boundary.

**Rule:** provider authentication success, token validity, provider roles or requested Household identifiers never directly grant Household authority.

## B2-002 — Authentication evidence is untrusted until verified

**Decision:** headers, cookies, bearer tokens, JWTs, opaque tokens, session handles and provider evidence are untrusted inputs.

**Rule:** parsing or decoding evidence is never equivalent to verification.

## B2-003 — Application consumes platform identity, not provider identity

**Decision:** successful authentication produces a platform-owned `PrincipalId` for application use.

**Rule:** provider subject strings, token objects, raw claims and SDK models remain adapter concerns and may not become domain/application parameters by convenience.

## B2-004 — Provider identity mapping is explicit and fail closed

**Decision:** verified provider identity must map deterministically to exactly one existing platform principal under an accepted mapping contract.

**Rule:** missing, ambiguous or invalid mappings fail authentication. BE-02 does not silently provision users, Household memberships or roles from a valid provider identity.

## B2-005 — Verification is mechanism-complete

**Decision:** the authentication adapter verifies all invariants required by the selected evidence mechanism before producing an authenticated principal.

**Rule:** where applicable this includes integrity/signature, issuer, intended audience/resource, temporal validity and mechanism-specific anti-confusion constraints. A provider SDK parsing successfully is not sufficient evidence of verification.

## B2-006 — Authentication adapter is provider-replaceable

**Decision:** provider-specific authentication code lives behind runtime/delivery adapter boundaries.

**Rule:** replacing the provider must not change domain/application contracts or Household authorization semantics.

## B2-007 — Raw credentials never enter use cases

**Decision:** access tokens, refresh tokens, cookies, session secrets and provider credentials terminate at the authentication boundary.

**Rule:** they are not passed to use cases, persisted in domain objects or emitted to ordinary logs/errors.

## B2-008 — Authentication failures are provider-neutral

**Decision:** authentication failures map into stable platform delivery semantics.

**Rule:** provider exception classes, token parser messages, signing-key identifiers and raw claims are not public error contracts.

## B2-009 — Runtime remains fail closed when authentication is unavailable

**Decision:** absence, misconfiguration or failure of the authentication authority cannot fall back to request-supplied identity.

**Rule:** no `x-principal-id`, query parameter, body field, unsigned claim or other caller-supplied identifier may serve as an emergency authentication mechanism.

## B2-010 — Current Household membership remains execution-time truth

**Decision:** a valid authenticated principal still requires current membership verification for every Household-scoped execution.

**Rule:** long-lived authentication/session state cannot freeze Household membership or role authority.

## B2-011 — Token/session validity is not platform authorization validity

**Decision:** authentication validity/currentness and business authorization currentness are distinct.

**Rule:** revocation/session mechanisms may strengthen authentication currentness, but they never replace the Household authorization check.

## B2-012 — Authentication logging is credential-safe

**Decision:** observability records outcome categories and safe operational context only.

**Rule:** Authorization headers, cookies, refresh tokens, raw token payloads and sensitive claims are redacted or omitted.

## B2-013 — Authentication configuration is validated at startup

**Decision:** required provider/mechanism trust configuration is parsed and validated by the runtime configuration boundary.

**Rule:** incomplete trust configuration fails closed rather than silently weakening issuer, audience/resource, key, session or other required verification.

## B2-014 — The BE-01 proving route may be upgraded, not expanded

**Decision:** the accepted BE-01 proving route may be wired to real authentication evidence solely to prove the BE-02 boundary.

**Rule:** BE-02 does not use identity work as justification for broad Household or feature CRUD.

## B2-015 — Authentication tests are adversarial

**Decision:** tests include boundary-confusion and rejection cases, not only successful fixtures.

**Rule:** the chosen mechanism must prove rejection of malformed, forged, expired/not-yet-valid, wrong-trust-boundary evidence where those concepts apply, plus missing/ambiguous platform identity mapping and request-supplied principal injection.

## B2-016 — Accepted upstream contracts remain authoritative

**Decision:** DB-00, DB-01, DB-02, BE-00 and BE-01 remain authoritative for domain truth, database enforcement, runtime, application contracts, exactness and Household authority.

**Rule:** identity-provider convenience may not weaken tenant isolation, provider neutrality, opaque identities, verified transaction capability, nondisclosure or exact-value semantics.

## B2-017 — External identity linkage is a platform-owned relation

**Decision:** linkage between an external provider identity and a platform principal is explicit platform data, not an implicit equality between provider subject and `PrincipalId`.

**Rule:** provider subject namespaces must be scoped by the relevant trust authority/provider identity so equal subject strings from different authorities cannot collide.

## B2-018 — Mapping lookup is intent-specific

**Decision:** any persistence contract used to map verified external identity to a platform principal expresses the stable intent of principal resolution.

**Rule:** BE-02 does not introduce a generic provider/user repository abstraction merely to wrap a database or SDK.

## B2-019 — Authentication ambiguity is failure, never best-effort selection

**Decision:** if more than one platform principal could match one verified external identity, authentication fails closed.

**Rule:** adapters may not choose the first row, newest row or otherwise guess authority.

## B2-020 — Trust metadata is never Household authority

**Decision:** provider claims such as roles, groups, organizations, tenant hints or custom metadata are authentication-side metadata only and do not constitute Household authority.

**Rule:** Household membership and role authority come exclusively from current platform truth through the accepted authorization boundary. A future contract may define provider-neutral uses for external metadata, but it cannot turn that metadata into Household authority unless the canonical Household-authority contract itself is explicitly superseded through governance.

## B2-021 — Credential-bearing failures preserve nondisclosure

**Decision:** authentication and identity-mapping failures must not reveal whether a particular platform principal, Household, provider subject or unrelated tenant resource exists.

**Rule:** diagnostic detail belongs only in credential-safe internal observability with appropriate classification.

## B2-022 — Phase completion requires real end-to-end proof

**Decision:** documentation and unit-level verifier tests alone do not complete BE-02.

**Rule:** exit requires an exact-HEAD proving path from untrusted request evidence through verification and platform principal mapping into the accepted Household authorization transaction boundary, with adversarial tests proving the separation of authorities.
