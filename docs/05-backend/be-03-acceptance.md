# FridgeScanner — BE-03 Acceptance Evidence

## Status

This document consolidates the BE-03 — Household Access Management evidence chain. The normative and previously merged slices listed below are accepted. The final HTTP delivery slice in PR #26 remains a closure candidate until its exact final HEAD passes execution/review gates and is squash-merged with explicit owner authorization.

## Normative authority

BE-03 is governed by `be-03-decisions.md`, including:

- current Household authorization as execution-time truth;
- provider-neutral `HOUSEHOLD_MEMBERSHIP_ADMINISTER` capability;
- governed role/capability reference data rather than guessed role strings;
- history-preserving add/rejoin, role-change and membership-end semantics;
- atomic last-administrator survivability;
- explicit self-mutation policy;
- stable command identity and retry safety;
- least-privileged intent-specific persistence;
- provider-neutral errors and tenant nondisclosure;
- Household-scoped observational current-member reads;
- B3-030 real authenticated governed-mutation proof as the phase exit condition.

## Accepted implementation lineage

### PR #19 — Normative BE-03 baseline

- Squash: `75db7717761e791c04bbe43a5762fb3381b91e3f`
- Exact reviewed HEAD: `b826f12cfc1307962740b3774d2f3deb01bf84af`

### PR #20 — Membership administration authority kernel

- Squash: `9d9323122a86fbe572b7fd5bc5ea8d96a4cad65f`
- Exact reviewed HEAD: `5c7feb9940b5e66d857780e5eb585e36a1ddb81e`
- Established provider-neutral membership-administration capability, opaque application authority and least-privileged transaction-scoped acquisition.

### PR #21 — Governed add/rejoin

- Squash: `e4558a605ef31ace98e7dcf599784e413eb7dc8a`
- Exact reviewed HEAD: `1200a73e0cedd35b148f0522d795bcccfb91b5d6`
- Established durable caller-supplied `CommandId`, history-preserving add/rejoin, non-restoring replay, governed target/role validation and concurrent-add convergence.

### PR #22 — Last-administrator survivability and lock order

- Squash: `f9e7b2a9b8749a3c36530a3ba8d758856f55b64c`
- Exact reviewed HEAD: `7ec622558f711408e36e0d44545f85f7ca59594f`
- Established Household-first serialization, atomic survivability and canonical actor/target/governance lock ordering.

### PR #23 — Governed role change

- Squash: `23bc0306c1f25df510b654b94f6ebb80b0a7491b`
- Exact reviewed HEAD: `67d8f4a2823830519b8e469fbfde8e37336ea527`
- Established interval-preserving role transitions, stable command replay, explicit self-demotion semantics and atomic survivability.

### PR #24 — Membership end and self-leave

- Squash: `5af9f92fd38466d7b9429465d59e9f0f7f2498f3`
- Exact reviewed HEAD: `1a57cc01844d3f12bbab7ddeaaf0b9a69118d692`
- Established administrative end and ordinary-member self-leave as distinct intents, historical interval closure, durable provenance, last-admin protection and replay after authority loss.
- Two Codex findings were fixed and resolved before merge: committed self-leave replay and unknown-principal nondisclosure/FK handling.

### PR #25 — Current Household membership read model

- Squash: `7cd840c1a169ed09a15e4045be2772ef002a14a5`
- Exact reviewed HEAD: `10d7203189d12514ab0fbeb95d9d31427e47f1d5`
- DB-02 PostgreSQL Gate #70: SUCCESS.
- BE-00 Backend Gate #147: SUCCESS.
- Established B3-026/B3-027 current-only Household-scoped observation with exact actor-membership revalidation, no provider metadata and no widening of direct `user_profile` privilege.

## PR #26 — Closure candidate: authenticated HTTP delivery

PR #26 adds the first public BE-03 membership delivery routes:

- `GET /households/:householdId/members`
- `POST /households/:householdId/members`

Delivery remains an adapter. It does not perform SQL, infer role meaning or implement capability policy. The POST preserves caller-supplied `CommandId`; actor identity is supplied only by the accepted authentication boundary.

### B3-030 proving chain

The closure proof is designed to execute this exact chain:

```text
signed Bearer JWT
  -> JWT/JWKS verification
  -> provider-neutral verified identity evidence
  -> platform PrincipalId mapping boundary
  -> current Household authorization
  -> HOUSEHOLD_MEMBERSHIP_ADMINISTER acquisition
  -> governed Add/Rejoin use case
  -> intent-specific SECURITY DEFINER persistence
  -> durable new membership interval + command provenance
  -> authenticated current-member observation after commit
```

The proving JWT deliberately contains provider role and Household claims inconsistent with the requested Household. They are not consulted as Household authority. A spoofable principal header is also ignored.

The proving target is an existing platform principal with prior ended Household history and no current Household authority when the HTTP test begins. Success therefore proves a new rejoin interval rather than historical-row resurrection.

### Candidate execution evidence before final documentation HEAD

On implementation HEAD `64369e229f5363ea1769253afe731eab5cde3a91`:

- BE-00 Backend Gate #150: SUCCESS.
- Runtime / TypeScript / Unit: SUCCESS.
- Container Smoke / Non-root / Health Semantics: SUCCESS.
- PostgreSQL 17 Contract + Backend RLS Integration: SUCCESS.
- Accepted DB-02 contract replay inside that lane: SUCCESS.
- Database integration suite: 38/38 PASS, including authority, history, retry, survivability and concurrency regressions.
- Configured authentication runtime end-to-end step: SUCCESS, including the B3-030 authenticated HTTP governed rejoin proof.

This evidence is intentionally not the final acceptance evidence because this document itself changes the PR HEAD. The final HEAD must pass the gate again.

## Final acceptance gate

BE-03 may be marked accepted only when all of the following are simultaneously true on one stable final PR #26 HEAD:

1. BE-00 exact-HEAD gate is SUCCESS, including replay of the accepted DB-02 contract and PostgreSQL/RLS integration.
2. The authenticated B3-030 request succeeds through the complete authority chain and the resulting current membership is observable after commit.
3. Existing adversarial/concurrency tests remain green.
4. Delivery exposes only provider-neutral contracts and preserves tenant nondisclosure.
5. No unresolved material review finding remains.
6. Final panoramic review is CLEAN.
7. The owner explicitly authorizes squash merge.
8. The PR is squash-merged with the reviewed expected HEAD and its branch is preserved.

Until those conditions are satisfied, PR #26 is a closure candidate and BE-03 remains active.
