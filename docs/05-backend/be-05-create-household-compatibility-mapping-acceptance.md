# BE-05 — CreateHouseholdCompatibilityMapping Acceptance

## Status

Candidate acceptance contract for branch `backend/be-05-create-household-compatibility-mapping` based exactly on accepted `main @ 703fbe5016cda6a562429c7af5eb708832902151`.

This document is not acceptance evidence until the exact final PR HEAD passes all required CI and independent review gates.

## Intent

Introduce the first governed write boundary for Household-scoped Product↔IngredientConcept compatibility truth without introducing GLOBAL mutation authority, downstream decision evidence, or generic CRUD semantics.

## Contract

`CreateHouseholdCompatibilityMapping`:

- requires current `HOUSEHOLD_CATALOG_ADMINISTER` authority;
- accepts a stable caller `CommandId` plus exact Product and IngredientConcept identities;
- generates `mapping_family_id` and `compatibility_mapping_id` inside the application boundary; generated candidates are not part of the semantic idempotency fingerprint;
- forces `catalog_scope = HOUSEHOLD` and `owner_household_id =` the authorized Household;
- accepts only current `ACTIVE` Product and IngredientConcept endpoints that are either GLOBAL or owned by the same Household;
- collapses missing, foreign-Household private, retired and otherwise ineligible endpoints to the same provider-neutral `NOT_FOUND` outcome;
- creates a new mapping family at `version_no = 1` only;
- samples `effective_from` from database current time after authority and endpoint/history serialization;
- creates an open current interval (`effective_to = NULL`) with `lifecycle_status = ACTIVE`;
- refuses to create another mapping family for the same Household + Product + IngredientConcept pair even if previous versions are historical/ended; future semantic changes must version the existing family through a separate reviewed intent;
- participates in the shared Household catalog CommandId registry;
- binds the semantic fingerprint to actor + Product + IngredientConcept;
- committed replay returns the original family/mapping identities before current target validation and never restores/reactivates later mapping state;
- does not create `CompatibilityDecisionEvidence`; that is a separate immutable-evidence intent;
- does not mutate GLOBAL catalog truth.

## Serialization and race safety

Canonical lock order is:

1. Household catalog authority / Household serialization anchor;
2. Product current-reference lock;
3. IngredientConcept current-reference lock;
4. any existing Household compatibility rows for the exact endpoint pair;
5. database time sampling and insert.

Product and IngredientConcept retirement use conflicting endpoint locks, so current mapping creation cannot race retirement into an invalid committed reference. Household-first serialization makes simultaneous attempts for one Household/pair deterministic: at most one family is created and contenders observe the committed lineage before deciding.

## Least privilege

- `fridge_app` receives EXECUTE only on the intent-specific function;
- `fridge_worker` and `fridge_readonly` do not receive this mutation entry point;
- no runtime role receives direct compatibility mapping INSERT/UPDATE/DELETE;
- the deferred compatibility scope postcondition is moved to a dedicated internal `SECURITY DEFINER` trigger guard;
- neither the dedicated trigger guard nor the underlying scope assertion helper is exposed to `fridge_app`.

## Executable proof obligations

Acceptance requires executable coverage for:

- Household-private endpoints;
- GLOBAL endpoints consumed by a Household-owned mapping;
- foreign/retired/missing Product and IngredientConcept nondisclosure;
- exact scope/owner/version/current-interval persistence;
- duplicate-family prevention even after prior mapping history is ended;
- committed non-restoring replay;
- actor/Product/IngredientConcept fingerprint divergence;
- cross-intent CommandId collision;
- ordinary member authorization denial;
- deterministic concurrent creation for the same Household endpoint pair;
- shared CommandId registry participation;
- no direct DML widening;
- dedicated deferred scope guard security.

## Explicit non-goals

This slice does not implement:

- compatibility family version supersession/change/retirement;
- `CompatibilityDecisionEvidence` commit;
- typed conditional compatibility constraints beyond the accepted unconditional mapping baseline;
- GLOBAL compatibility mutation authority;
- ProductIdentifier staged promotion/normalization execution;
- HTTP delivery, frontend/scanner UI, inventory mutation, or deployment changes.

## Merge gate

Merge readiness requires, on one exact final HEAD:

1. DB-02 PostgreSQL gate green for all supported PostgreSQL versions;
2. BE-00 backend gate green, including least-privileged PostgreSQL/RLS integration;
3. independent panoramic/adversarial review CLEAN with zero unresolved material findings;
4. all material review findings resolved on that same final HEAD;
5. explicit owner authorization for squash merge.

External automated/Codex review is optional defense-in-depth and is not a blocking dependency when the internal gate above is complete. Any material external finding received before merge must still be adjudicated; a code change invalidates prior exact-head evidence.

The source branch must be preserved after squash merge.
