# FridgeScanner — BE-03 Acceptance Evidence

## Status

BE-03 — Household Access Management is **formally accepted and closed**.

Final closure:

- PR #26: `backend: close BE-03 with authenticated membership HTTP delivery`
- Exact final reviewed HEAD: `5a1e05185d6be8d30b5ecb2c6729ccceaeddce44`
- Squash merge on `main`: `546cb70ab6f752912d44f2140bcb3b474066dc07`
- Parent: `7cd840c1a169ed09a15e4045be2772ef002a14a5`
- Branch `backend/be-03-http-delivery-proof`: preserved
- DB-02 PostgreSQL Gate #75: SUCCESS on PostgreSQL 17 and PostgreSQL 18
- BE-00 Backend Gate #159: SUCCESS across runtime/unit, container, DB-02 replay, PostgreSQL/RLS/identity and authenticated runtime/B3-030
- final panoramic reviews: CLEAN
- unresolved material review threads at merge: 0

BE-03 is no longer an active closure candidate. All downstream backend phases consume BE-03 as accepted upstream authority.

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

### PR #26 — Authenticated HTTP delivery and BE-03 closure

- Squash: `546cb70ab6f752912d44f2140bcb3b474066dc07`
- Exact reviewed HEAD: `5a1e05185d6be8d30b5ecb2c6729ccceaeddce44`
- DB-02 PostgreSQL Gate #75: SUCCESS on PostgreSQL 17/18.
- BE-00 Backend Gate #159: SUCCESS.
- Final panoramic reviews: CLEAN.
- One Codex P2 delivery-parser finding was fixed and its thread resolved before merge.

PR #26 introduced the first public BE-03 membership delivery routes:

- `GET /households/:householdId/members`
- `POST /households/:householdId/members`

Delivery remains an adapter. It does not perform SQL, infer role meaning or implement capability policy. The POST preserves caller-supplied `CommandId`; actor identity is supplied only by the accepted authentication boundary.

## B3-030 accepted proving chain

The final accepted runtime proof executes:

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

## Closure findings and hardening accepted before merge

### Delivery parser 4xx normalization

Codex review found that Fastify-generated client errors such as malformed JSON or unsupported media type bypassed `ApplicationError` and fell into the generic 500 handler.

The accepted delivery error boundary now preserves recognized framework 4xx status while returning only provider-neutral `INVALID_REQUEST` plus request correlation. Regression tests prove malformed JSON remains 400 and unsupported media type remains 415, and neither reaches the application use case.

### Post-lock temporal authority

A later BE-00 rerun exposed an intermittent failure in the two-administrator concurrent self-leave regression: both operations could occasionally succeed.

The Household row lock itself serialized correctly. The defect was temporal: `statement_timestamp()` is fixed at statement start, so a statement that began before waiting for the Household lock could evaluate current membership after the wait using a timestamp from before the serialized predecessor closed its interval.

Migration `000039__be03_post_lock_temporal_authority.sql` hardens the serialized BE-03 kernels without changing public signatures or widening privileges:

- administration-authority acquisition samples current authority after the Household lock is held;
- survivability samples target and surviving-admin authority at one fresh post-lock database time;
- add/rejoin binds overlap detection and new `effective_from` to post-lock time;
- role change binds current target interpretation and history boundary to post-lock time;
- membership end binds current target interpretation and interval closure to post-lock time;
- self-leave revalidates the exact actor membership at post-lock time.

The integrity gate rejects reintroduction of `statement_timestamp()` into these serialized kernels and confirms internal helpers remain unavailable to `fridge_app`.

A deterministic integration proof deliberately locks the Household first, starts both administrator self-leave statements while blocked, verifies both reached the lock wait, and then releases the blocker. The accepted result is exactly one successful self-leave, one provider-neutral conflict and exactly one current administrator.

## Final accepted execution evidence

On exact final HEAD `5a1e05185d6be8d30b5ecb2c6729ccceaeddce44`:

- DB-02 PostgreSQL Gate #75: SUCCESS.
- PostgreSQL 17: SUCCESS.
- PostgreSQL 18: SUCCESS.
- BE-00 Backend Gate #159: SUCCESS.
- Runtime / TypeScript / Unit: SUCCESS.
- Container Smoke / Non-root / Health Semantics: SUCCESS.
- accepted DB-02 contract replay inside backend PostgreSQL lane: SUCCESS.
- PostgreSQL/RLS/identity integration: SUCCESS.
- configured authentication runtime end-to-end/B3-030: SUCCESS.
- parser 400/415 regressions: SUCCESS.
- deterministic post-lock self-leave serialization proof: SUCCESS.
- final authority/B3-030/temporal-serialization panoramic review: CLEAN.
- final delivery/least-privilege/provider-neutrality panoramic review: CLEAN.
- unresolved material review threads: 0.

The owner explicitly authorized squash merge, and GitHub merged PR #26 with expected reviewed HEAD. `main` was then verified at `546cb70ab6f752912d44f2140bcb3b474066dc07`.

## Accepted BE-03 outcome

BE-03 now provides the canonical Household access-management substrate:

```text
BE-02 verified identity
  -> current Household authority
  -> governed membership-administration capability
  -> add/rejoin / role-change / end / self-leave
  -> history + provenance + retry safety + survivability
  -> current-member observation
  -> authenticated HTTP delivery
```

All later phases must preserve these authority, nondisclosure, concurrency, temporal, least-privilege and history guarantees. They may consume BE-03; they may not bypass or reinterpret it.
