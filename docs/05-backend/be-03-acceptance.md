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

### Candidate execution evidence before temporal hardening

On implementation HEAD `64369e229f5363ea1769253afe731eab5cde3a91`:

- BE-00 Backend Gate #150: SUCCESS.
- Runtime / TypeScript / Unit: SUCCESS.
- Container Smoke / Non-root / Health Semantics: SUCCESS.
- PostgreSQL 17 Contract + Backend RLS Integration: SUCCESS.
- Accepted DB-02 contract replay inside that lane: SUCCESS.
- Database integration suite passed, including authority, history, retry, survivability and concurrency regressions.
- Configured authentication runtime end-to-end step: SUCCESS, including the B3-030 authenticated HTTP governed rejoin proof.

This was candidate evidence only. Later exact-HEAD reruns exposed two additional closure findings that were corrected before acceptance.

### PR #26 closure findings and hardening

#### Delivery parser 4xx normalization

Codex review found that Fastify-generated client errors such as malformed JSON or unsupported media type bypassed `ApplicationError` and fell into the generic 500 handler. The delivery error boundary now preserves framework 4xx status while returning only the provider-neutral public code `INVALID_REQUEST` plus request correlation. Regression tests prove malformed JSON remains 400 and unsupported media type remains 415, and neither reaches the application use case.

#### Post-lock temporal authority

A later BE-00 rerun exposed an intermittent failure in the accepted two-administrator concurrent self-leave regression: both operations could occasionally succeed. The Household row lock itself serialized correctly. The defect was temporal: `statement_timestamp()` is fixed at statement start, so a statement that began before waiting for the Household lock could evaluate current membership after the wait using a timestamp from before the serialized predecessor closed its interval.

Migration `000039__be03_post_lock_temporal_authority.sql` hardens the serialized BE-03 kernels without changing their public signatures or widening privileges:

- administration-authority acquisition samples current authority after the Household lock is held;
- survivability samples target and surviving-admin authority at one fresh post-lock database time;
- add/rejoin binds overlap detection and new `effective_from` to post-lock time;
- role change binds current target interpretation and history boundary to post-lock time;
- membership end binds current target interpretation and interval closure to post-lock time;
- self-leave revalidates the exact actor membership at post-lock time.

The integrity gate rejects reintroduction of `statement_timestamp()` into these serialized kernels and confirms internal helpers remain unavailable to `fridge_app`.

A deterministic integration proof deliberately locks the Household first, starts both administrator self-leave statements while they are blocked, verifies both reached the lock wait, and only then releases the blocker. This makes both statement-start timestamps pre-serialization by construction. The required result is one successful self-leave, one provider-neutral conflict and exactly one current administrator. This directly proves that post-lock temporal observation, not scheduler luck, protects survivability.

On hardening HEAD `af68449bcc11f87fcb31beaa889a3437cea93c77`:

- DB-02 PostgreSQL Gate #73: SUCCESS on PostgreSQL 17 and PostgreSQL 18.
- BE-00 Backend Gate #157: SUCCESS.
- Runtime / TypeScript / Unit: SUCCESS, including parser 400/415 regressions.
- Container Smoke / Non-root / Health Semantics: SUCCESS.
- PostgreSQL 17 Contract + Backend RLS Integration: SUCCESS.
- Configured authentication runtime end-to-end/B3-030: SUCCESS.
- The deterministic post-lock self-leave serialization proof: SUCCESS.

This evidence is still not the final acceptance evidence because documenting it changes the PR HEAD. The final exact HEAD must pass the gates again.

## Final acceptance gate

BE-03 may be marked accepted only when all of the following are simultaneously true on one stable final PR #26 HEAD:

1. DB-02 exact-HEAD gate is SUCCESS on PostgreSQL 17 and PostgreSQL 18 when the final HEAD contains a database delta.
2. BE-00 exact-HEAD gate is SUCCESS, including replay of the accepted DB-02 contract and PostgreSQL/RLS integration.
3. The authenticated B3-030 request succeeds through the complete authority chain and the resulting current membership is observable after commit.
4. Existing adversarial/concurrency tests and the deterministic post-lock temporal-serialization proof remain green.
5. Delivery exposes only provider-neutral contracts, preserves parser 4xx classification and preserves tenant nondisclosure.
6. No unresolved material review finding remains.
7. Final panoramic reviews are CLEAN.
8. The owner explicitly authorizes squash merge.
9. The PR is squash-merged with the reviewed expected HEAD and its branch is preserved.

Until those conditions are satisfied, PR #26 is a closure candidate and BE-03 remains active.
