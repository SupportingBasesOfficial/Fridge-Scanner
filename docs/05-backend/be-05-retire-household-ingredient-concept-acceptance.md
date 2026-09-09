# BE-05 — RetireHouseholdIngredientConcept Acceptance

## Status

Candidate executable slice on accepted `main @ 3f5f9aaa18edffd036ff406de6e1d2ad2e54c81e`.

This document is not acceptance evidence until the exact final PR HEAD passes all required CI and independent review gates.

## Purpose

Introduce governed retirement for a current Household-private IngredientConcept after governed creation and metadata mutation were accepted.

## Contract

`RetireHouseholdIngredientConcept`:

- requires current `HOUSEHOLD_CATALOG_ADMINISTER` authority;
- targets only an `ACTIVE`, same-Household, `HOUSEHOLD` IngredientConcept;
- collapses missing, foreign, GLOBAL and already-retired targets to nondisclosure-safe `NotFound`;
- preserves IngredientConcept identity and metadata while transitioning lifecycle to `RETIRED`;
- blocks retirement while any current/non-ended `product_ingredient_compatibility` references the concept;
- preserves ended/historical compatibility mappings and compatibility evidence;
- prevents creation/reactivation of a current compatibility pointing to a non-current IngredientConcept;
- uses stable caller `CommandId`;
- binds command semantics to actor and target IngredientConcept;
- participates in the shared Household catalog CommandId registry;
- returns committed replay without reapplying or restoring later state.

## Concurrency and current-reference invariant

Current compatibility writers acquire IngredientConcept `KEY SHARE` through the trigger guard. Retirement acquires the target IngredientConcept row `FOR UPDATE`, then locks ACTIVE compatibility rows deterministically before sampling the effective-time anchor. A concurrent current-reference creation and IngredientConcept retirement therefore cannot both commit.

## Least privilege

`fridge_app` receives only EXECUTE on the intent-specific SECURITY DEFINER retirement function. Direct IngredientConcept INSERT/UPDATE/DELETE is not widened. Guard helpers are not granted to application roles.

## Non-goals

This slice does not implement compatibility mapping/evidence mutation workflows, ProductIdentifier/staged claims, GLOBAL catalog mutation, HTTP delivery, frontend or deployment.

## Acceptance gate

Before squash merge, one exact final HEAD must demonstrate:

- application build/unit success;
- DB-02 PostgreSQL 17/18 success;
- BE-00 regression success;
- catalog-admin-only retirement authority;
- same-Household ACTIVE target enforcement with GLOBAL/foreign/retired/missing nondisclosure;
- current compatibility dependency conflict;
- ended/historical compatibility does not block retirement;
- current compatibility cannot reference a retired IngredientConcept;
- committed replay without state restoration;
- divergent actor and target conflicts for the same intent;
- cross-intent Household catalog CommandId conflict;
- no privilege widening or historical cascade;
- independent panoramic/adversarial review with zero unresolved material findings;
- external automated review, when available, is additional evidence and is not an acceptance dependency;
- explicit owner authorization for squash merge;
- branch preservation after merge.
