# BE-05 — ChangeHouseholdIngredientConceptMetadata Acceptance

## Status

Candidate executable slice on accepted `main @ fb0958a38c38c6ec318a48a893189f3885b242c4`.

This document is not acceptance evidence until the exact final PR HEAD passes all required CI and independent review gates.

## Purpose

Introduce governed metadata mutation for a current Household-private IngredientConcept after governed creation was accepted.

## Contract

`ChangeHouseholdIngredientConceptMetadata`:

- requires current `HOUSEHOLD_CATALOG_ADMINISTER` authority;
- targets only an `ACTIVE`, same-Household, `HOUSEHOLD` IngredientConcept;
- collapses missing, foreign, GLOBAL and retired targets to nondisclosure-safe `NotFound`;
- changes only exact nonblank `canonicalName`;
- preserves IngredientConcept identity, scope, owner and lifecycle;
- does not rewrite Product↔IngredientConcept compatibility mappings or evidence;
- uses stable caller `CommandId`;
- binds command semantics to actor, target IngredientConcept and exact canonical name;
- participates in the shared Household catalog CommandId registry;
- returns committed replay without reapplying or restoring later IngredientConcept state.

## Least privilege

`fridge_app` receives only EXECUTE on the intent-specific SECURITY DEFINER function. Direct IngredientConcept INSERT/UPDATE/DELETE is not widened. `fridge_worker` and `fridge_readonly` do not receive the application mutation boundary.

## Non-goals

This slice does not implement IngredientConcept retirement, compatibility mapping/evidence mutation, ProductIdentifier/staged claims, GLOBAL catalog mutation, HTTP delivery, frontend or deployment.

## Acceptance gate

Before squash merge, one exact final HEAD must demonstrate:

- application build/unit success;
- DB-02 PostgreSQL 17/18 success;
- BE-00 regression success;
- catalog-admin-only mutation authority;
- same-Household ACTIVE target enforcement with GLOBAL/foreign/retired/missing nondisclosure;
- mutation of canonical name only, preserving identity/scope/owner/lifecycle;
- committed replay without state restoration;
- divergent actor, target and canonical-name conflicts for the same intent;
- cross-intent Household catalog CommandId conflict;
- no privilege widening;
- independent panoramic/adversarial review with zero unresolved material findings;
- external automated review, when available, is additional evidence and is not an acceptance dependency;
- explicit owner authorization for squash merge;
- branch preservation after merge.
