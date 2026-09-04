# FridgeScanner — BE-02 Decisions

## Status

This register defines the initial normative decisions for BE-02. It becomes authoritative only after the BE-02 baseline is reviewed and merged.

## B2-001 — Authentication and Household authorization are separate authorities

**Decision:** authentication establishes a verified platform principal; Household authorization is evaluated separately through the accepted BE-00/BE-01 authorized Household transaction boundary.

**Rule:** provider authentication success, token validity, provider roles or requested Household identifiers never directly grant Household authority.

## B2-002 — Provider evidence is untrusted until verified

**Decision:** headers, cookies, bearer tokens, JWTs, opaque tokens and provider session handles are untrusted inputs.

**Rule:** parsing or decoding evidence is never equivalent to verification.

## B2-003 — Application consumes platform identity, not provider identity

**Decision:** successful authentication produces a platform-owned `PrincipalId` for application use.

**Rule:** provider subject strings, token objects and SDK models remain adapter concerns and may not become application/domain parameters by convenience.

## B2-004 — Provider identity mapping is explicit and fail closed

**Decision:** verified provider identity must map deterministically to an existing platform principal under an accepted mapping contract.

**Rule:** missing, ambiguous or invalid mappings fail authentication. BE-02 does not silently provision users or Household memberships from a valid provider identity.

## B2-005 — Verification is mechanism-complete

**Decision:** the authentication adapter verifies all invariants required by the chosen evidence mechanism before producing a principal.

**Rule:** where applicable this includes integrity/signature, issuer, intended audience/resource, temporal validity and mechanism-specific constraints. Individual checks may not be omitted because a provider SDK happens to parse the evidence successfully.

## B2-006 — Authentication adapter is provider-replaceable

**Decision:** provider-specific authentication code lives behind a runtime/delivery adapter boundary.

**Rule:** replacing the provider must not change domain/application contracts or current Household authorization semantics.

## B2-007 — Raw credentials never enter use cases

**Decision:** raw access tokens, refresh tokens, cookies, session secrets and provider credentials terminate at the authentication adapter.

**Rule:** they are not passed to use cases, persisted in domain objects or emitted to ordinary logs/errors.

## B2-008 — Authentication failures are provider-neutral

**Decision:** authentication failures map into stable platform/application delivery semantics such as unauthenticated or dependency unavailable.

**Rule:** provider exception classes, token parser messages, signing-key identifiers and raw claims are not public error contracts.

## B2-009 — Runtime remains fail closed when authentication is unavailable

**Decision:** absence, misconfiguration or failure of the authentication authority cannot fall back to request-supplied identity.

**Rule:** no `x-principal-id`, query parameter, body field or unsigned claim may serve as an emergency authentication mechanism.

## B2-010 — Current Household membership remains execution-time truth

**Decision:** a valid authenticated principal still requires current membership verification for every Household-scoped execution.

**Rule:** long-lived authentication/session state cannot freeze Household role or membership authority.

## B2-011 — Token validity is not platform authorization validity

**Decision:** cryptographic validity and authentication currentness are distinct from business authorization currentness.

**Rule:** later revocation/session mechanisms may strengthen authentication currentness, but they never replace the Household authorization check.

## B2-012 — Authentication logging is credential-safe

**Decision:** observability records outcome categories and safe operational context only.

**Rule:** Authorization headers, cookies, refresh tokens, raw token payloads and sensitive claims are redacted or omitted.

## B2-013 — Authentication configuration is validated at startup

**Decision:** required provider/mechanism configuration is parsed and validated by the runtime configuration boundary.

**Rule:** incomplete trust configuration must fail closed rather than silently weaken issuer/audience/key/session verification.

## B2-014 — BE-01 proving route may be upgraded, not expanded

**Decision:** the accepted BE-01 proving route may be wired to real authentication evidence solely to prove the BE-02 boundary.

**Rule:** BE-02 does not use authentication work as justification for broad Household or feature CRUD.

## B2-015 — Authentication tests are adversarial

**Decision:** tests must include invalid and boundary-confusion cases, not only successful token/session fixtures.

**Rule:** the chosen mechanism must prove rejection of malformed, forged, expired/not-yet-valid and wrong-trust-boundary evidence where those concepts apply, plus missing/ambiguous platform identity mapping.

## B2-016 — Accepted upstream contracts remain authoritative

**Decision:** DB-00, DB-01, DB-02, BE-00 and BE-01 remain authoritative for domain truth, database enforcement, runtime, application contracts, exactness and Household authority.

**Rule:** identity-provider convenience may not weaken tenant isolation, provider neutrality, opaque identities, verified transaction capability or nondisclosure semantics.
