# BE-05 — CreateHouseholdIngredientConcept Acceptance

## Status

Candidate executable slice on accepted `main @ d822a60d4ca6ea4008b69529e82ba1399f3d743f`.

This document is not acceptance evidence until the exact final PR HEAD passes all required CI/review gates.

## Purpose

Introduce governed Household-private IngredientConcept creation after current Product and IngredientConcept observation boundaries were accepted.

## Contract

`CreateHouseholdIngredientConcept`:

- requires current `HOUSEHOLD_CATALOG_ADMINISTER` authority;
- creates only `HOUSEHOLD` scope;
- forces `owner_household_id` to the exact authorized Household;
- accepts an exact nonblank canonical name;
- generates IngredientConcept identity internally;
- uses stable caller `CommandId`;
- participates in the same Household catalog CommandId registry as Product mutations;
- returns committed replay without reapplying or restoring later IngredientConcept state.

A Product command and IngredientConcept command may not acquire different meanings under the same Household-scoped `CommandId`.

## Least privilege

`fridge_app` receives only EXECUTE on the intent-specific SECURITY DEFINER function. Direct IngredientConcept INSERT/UPDATE/DELETE is not widened. `fridge_worker` and `fridge_readonly` do not receive the application creation boundary.

## Non-goals

This slice does not implement IngredientConcept metadata change/retirement, compatibility mapping/evidence, ProductIdentifier/staged claims, global catalog mutation, HTTP delivery, frontend or deployment.

## Acceptance gate

Before squash merge, one exact final HEAD must demonstrate:

- application build/unit success;
- DB-02 PostgreSQL 17/18 success;
- BE-00 regression success;
- catalog-admin-only mutation authority;
- forced HOUSEHOLD scope/owner;
- stable CommandId replay and divergent-fact conflict;
- cross-intent Product↔IngredientConcept CommandId conflict;
- no privilege widening;
- automated Codex review and panoramic review with zero unresolved material findings;
- explicit owner authorization for squash merge;
- branch preservation after merge.
