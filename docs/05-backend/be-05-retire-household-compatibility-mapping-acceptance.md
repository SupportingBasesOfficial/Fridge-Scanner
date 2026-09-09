# BE-05 — RetireHouseholdCompatibilityMapping Acceptance

## Status

Candidate acceptance contract for the BE-05 Household compatibility mapping retirement slice.

Base: `main @ a1c2d95e355043c863b65eac373267728ef11c47`

This document is not acceptance evidence until the exact final PR HEAD passes all required CI and independent review gates.

## Intent

Introduce an explicit `RetireHouseholdCompatibilityMapping` command that closes the current Household-owned compatibility mapping version without deleting history, fabricating a replacement version or reinterpreting previously committed compatibility evidence.

## Authority

- requires current `HOUSEHOLD_CATALOG_ADMINISTER` authority;
- authority is reacquired inside the PostgreSQL mutation boundary after Household/governance serialization;
- ordinary Household membership is insufficient;
- no GLOBAL compatibility mutation authority is implied.

## Eligible target

The command may retire only a mapping that is simultaneously:

- `catalog_scope = HOUSEHOLD`;
- owned by the acting Household;
- `lifecycle_status = ACTIVE`;
- open-ended (`effective_to IS NULL`).

Foreign Household, GLOBAL, already-ended, already-retired and missing mapping identities collapse to `NotFound`.

## Mutation semantics

Retirement changes only:

- `effective_to` from `NULL` to a database-sampled instant strictly after `effective_from`;
- `lifecycle_status` from `ACTIVE` to `RETIRED`.

It preserves:

- `compatibility_mapping_id`;
- `mapping_family_id`;
- `version_no`;
- catalog scope and owner;
- Product and IngredientConcept endpoints;
- `effective_from`;
- `recorded_at`;
- all historical `CompatibilityDecisionEvidence` rows.

No row is deleted, no family is cloned and no version 2 is created by this command.

## Why there is no generic version-change command yet

The accepted DB-02 compatibility model currently represents unconditional positive compatibility. It does not yet contain typed constraint/policy fields whose change would carry a distinct compatibility meaning. Creating a replacement version without an explicit semantic delta would manufacture version history rather than preserve domain truth.

Future compatibility versioning/reactivation therefore requires an explicit reviewed command once the changed semantic payload is materialized. Retirement is the only lifecycle transition introduced here.

## Concurrency and lock order

The mutation uses the established Household catalog authority serialization anchor, then:

1. reads the eligible mapping endpoints;
2. locks Product `FOR KEY SHARE`;
3. locks IngredientConcept `FOR KEY SHARE`;
4. locks and revalidates the exact mapping `FOR UPDATE`;
5. samples the database effective-end time;
6. closes the mapping.

This ordering is aligned with compatibility creation and avoids mapping→endpoint lock inversion with endpoint retirement workflows.

Concurrent retirement attempts for one mapping must serialize to exactly one committed retirement. A later contender with a distinct command sees the now-noncurrent target as `NotFound` and cannot create a second retirement command fact.

## Idempotency

The stable Household-scoped `CommandId` semantic fingerprint is:

- actor user identity;
- exact `compatibilityMappingId`.

Server state is not part of the fingerprint.

A committed replay:

- returns the originally retired mapping identity;
- is resolved before current target validation;
- never re-retires, re-closes or restores later state.

Divergent actor or target mapping with the same CommandId returns `IdempotencyConflict`.

The command participates in the shared Household catalog CommandId registry under `RETIRE_HOUSEHOLD_COMPATIBILITY_MAPPING`, so cross-intent reuse conflicts.

## Evidence and downstream history

Existing `compatibility_decision_evidence` remains immutable historical evidence pinned to the exact mapping identity/version/evaluation context used when the decision committed. Mapping retirement governs future decisions only; it does not reinterpret or delete historical evidence.

The slice proves that current compatibility blocks Product retirement and that Product retirement can proceed after the mapping is retired, without cascade or evidence rewrite.

## Least privilege

- `fridge_app` receives EXECUTE only on the intent-specific retirement function;
- `fridge_worker` and `fridge_readonly` do not receive that mutation entry point;
- runtime roles receive no direct INSERT/UPDATE/DELETE on `product_ingredient_compatibility`;
- the durable retirement command table is not directly exposed to `fridge_app`;
- the dedicated deferred compatibility scope guard remains internal `SECURITY DEFINER` and is not directly executable by `fridge_app`.

## Proof obligations

Acceptance requires executable proof that:

- exact authority is required;
- current same-Household mapping retirement succeeds;
- family/version/endpoints/start/recorded history are preserved;
- effective interval closes strictly after its start;
- historical decision evidence remains stored;
- GLOBAL/foreign/retired/missing targets are nondisclosure-safe;
- committed replay is non-restoring;
- actor/target divergence conflicts;
- cross-intent CommandId reuse conflicts;
- direct compatibility DML is not widened;
- concurrent retirement commits once;
- Product retirement is blocked before compatibility retirement and succeeds afterward.

## Non-goals

- generic compatibility metadata mutation;
- mapping family supersession or version 2 creation;
- mapping reactivation;
- `CompatibilityDecisionEvidence` commit workflow;
- GLOBAL compatibility mutation;
- typed compatibility constraints/policies;
- ProductIdentifier staged promotion/normalization engine;
- HTTP/frontend/inventory/deployment changes.

## Merge gate

Merge readiness requires one exact final HEAD with:

- DB-02 PostgreSQL 17/18 gate green;
- BE-00 backend gate green;
- independent panoramic/adversarial review CLEAN;
- zero unresolved material findings;
- explicit owner authorization for squash merge.

The source branch must be preserved after merge.
