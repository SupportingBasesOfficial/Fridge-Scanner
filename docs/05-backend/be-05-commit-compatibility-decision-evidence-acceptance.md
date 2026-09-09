# BE-05 — CommitCompatibilityDecisionEvidence Acceptance

## Status

Candidate acceptance contract for immutable Household compatibility decision evidence.

Base: `main @ 9239f82797b143530bf10ab0a50d268c27df2c04`

This document becomes acceptance evidence only when the exact final PR HEAD passes all required CI and independent review gates.

## Intent

Introduce `CommitCompatibilityDecisionEvidence` as the governed append-only record of a Household decision that treats the Product endpoint of one exact compatibility mapping as satisfying that mapping's IngredientConcept endpoint.

This slice records a decision made **now**, under current Household authority and current mapping truth. It does not accept a caller-selected historical timestamp.

## Authority

- requires an exact current Household membership and an ACTIVE current role;
- does **not** require `HOUSEHOLD_CATALOG_ADMINISTER`;
- therefore evidence commit does not confer catalog mutation authority;
- Household context is revalidated inside PostgreSQL after Household/membership/role lock waits;
- non-members, ended memberships and retired roles are unauthorized.

## Mapping eligibility

The exact mapping must be visible to the Household and current at the commit anchor:

- GLOBAL mapping is visible when its endpoints remain current GLOBAL catalog objects;
- HOUSEHOLD mapping must belong to the current Household and its endpoints must be GLOBAL or owned by that same Household;
- Product and IngredientConcept endpoints must be `ACTIVE` at evidence commit;
- mapping lifecycle must be `ACTIVE`;
- mapping effective interval must contain the server-sampled evaluation anchor;
- foreign, retired, ended, not-yet-effective, endpoint-ineligible and missing targets collapse to `NotFound`.

## Evaluation anchor

`evaluation_anchor` is not caller controlled.

Lock order is:

1. Household membership/role authority;
2. Product reference lock;
3. IngredientConcept reference lock;
4. exact mapping share lock;
5. fresh `clock_timestamp()` sample.

The mapping is revalidated against that fresh anchor after the required locks. This prevents client backdating and prevents a concurrent retirement from producing evidence for a mapping that was no longer current at commit.

Historical-domain workflows that require a past authoritative anchor must introduce a separate reviewed boundary that proves that anchor's source; they may not reuse this command with an arbitrary timestamp.

## Evidence identity and payload

- `CompatibilityEvidenceId` is server-generated;
- Product and IngredientConcept are derived from the pinned mapping, never supplied independently by the caller;
- `household_id` is always the consuming Household, including when the pinned mapping is GLOBAL;
- provenance is required, nonblank and preserved exactly;
- `recorded_at` equals the server-sampled `evaluation_anchor` for this command;
- `approved_by_user_id` and `approval_reason` are explicitly `NULL` in this slice;
- no caller may impersonate or fabricate an approver;
- a future approval workflow must be explicit and separately governed.

## Immutability

`compatibility_decision_evidence` is append-only historical truth:

- runtime roles receive no direct INSERT/UPDATE/DELETE;
- insert occurs only through the governed function;
- a structural `BEFORE UPDATE OR DELETE` trigger rejects later mutation even for privileged ordinary DML paths;
- corrections must append new governed evidence rather than rewrite prior evidence;
- existing downstream FKs continue to use `ON UPDATE RESTRICT / ON DELETE RESTRICT`.

## Scope guard

The existing deferred compatibility evidence scope assertion remains authoritative defense in depth.

Because it was originally `SECURITY INVOKER`, this slice installs a dedicated `SECURITY DEFINER` trigger guard so the least-privileged app can commit a governed insert without receiving direct EXECUTE on the assertion helper.

The guard itself and the assertion helper remain unavailable as direct `fridge_app` endpoints.

## Idempotency

Evidence commit has a dedicated Household-scoped CommandId registry, separate from catalog mutation and identifier observation command scopes.

Semantic fingerprint:

- Household;
- actor;
- exact compatibility mapping;
- exact provenance.

Excluded from the fingerprint:

- server-generated evidence candidate ID;
- server-sampled evaluation anchor.

Committed replay:

- returns the original `CompatibilityEvidenceId`;
- returns the original `evaluation_anchor`;
- happens before current mapping eligibility validation;
- does not create another row;
- does not rewrite or restore later state;
- divergent actor/mapping/provenance returns `IdempotencyConflict`.

First use of an absent CommandId is serialized by reserving/locking the dedicated registry after first-attempt mapping validation, followed by a command-row recheck. Concurrent first writers therefore converge to one committed row plus deterministic replay/conflict instead of leaking a unique-constraint failure.

## Concurrency

The slice must prove:

- evidence commit serializes correctly against compatibility retirement;
- endpoint locks align with compatibility lifecycle lock order;
- simultaneous first use of one CommandId cannot commit two evidence rows;
- for two different actors racing the same CommandId, exactly one evidence row/command row commits and the other receives `IdempotencyConflict`.

## Nondisclosure

Foreign Household mappings, retired/ended mappings and missing mappings return the same `NotFound` behavior. The command does not expose mapping ownership or lifecycle details through differentiated outcomes.

## Least privilege

- `fridge_app`: EXECUTE only on `commit_compatibility_decision_evidence`;
- `fridge_worker`: no EXECUTE;
- `fridge_readonly`: no EXECUTE;
- no runtime direct DML on `compatibility_decision_evidence`;
- no runtime direct access to evidence command registry/table;
- no runtime EXECUTE on evidence scope assertion/trigger guard/immutability blocker.

## Proof obligations

The exact candidate HEAD must prove:

1. ordinary current member can commit evidence without catalog-admin capability;
2. Household mapping pins exact current Product/IngredientConcept identities;
3. GLOBAL mapping may be used by a Household while evidence remains Household-scoped;
4. evaluation anchor is server sampled after locks;
5. provenance is exact and nonblank;
6. approver fields remain null;
7. foreign/retired/missing mapping is nondisclosure-safe `NotFound`;
8. committed replay survives later mapping retirement;
9. divergent actor/mapping/provenance conflicts;
10. evidence UPDATE/DELETE is structurally rejected;
11. direct runtime evidence DML remains absent;
12. deferred scope guard remains least-privileged;
13. concurrent first-use CommandId commits exactly one evidence row;
14. DB-02 passes PostgreSQL 17 and 18;
15. BE-00 runtime/unit/container/RLS integration passes on the same exact HEAD;
16. independent panoramic/adversarial review is CLEAN.

## Explicit non-goals

- no arbitrary historical/backdated evidence anchor;
- no compatibility approval workflow or approver impersonation;
- no mapping creation/retirement/versioning;
- no GLOBAL mutation authority;
- no typed compatibility constraints beyond the current unconditional positive mapping contract;
- no ProductIdentifier normalization/promotion;
- no preparation/shopping/shelf-life commit integration yet;
- no HTTP/frontend/deployment changes.
