# BE-05 — Current IngredientConcept Reads

## Status

Candidate executable slice on accepted `main @ 4563c7b04be15816665747bea26bf47045bff5e7`.

This document is not acceptance evidence until the exact final PR HEAD passes the required CI and review gates.

## Purpose

Complete the observational half of BE-05 initial slice 2 by adding governed current `IngredientConcept` list/get reads after current Product reads were accepted.

## Contract

A Household-scoped caller may observe only:

- current ACTIVE GLOBAL IngredientConcepts;
- current ACTIVE IngredientConcepts owned by that same Household.

Another Household's private IngredientConcept, a retired/non-current concept and a missing identity collapse to the same provider-neutral `NOT_FOUND` identity-read outcome.

Observation requires an authorized Household transaction and persistence revalidates the exact current acting membership before exposing catalog truth. Ordinary current Household membership is sufficient for observation; `HOUSEHOLD_CATALOG_ADMINISTER` remains mutation-only authority.

List ordering is deterministic by `IngredientConceptId` at both persistence and consuming adapter query boundaries.

## Least privilege

Runtime roles do not receive direct `SELECT` on `fridge.ingredient_concept` as the application observation contract.

`fridge_app` receives EXECUTE only on the narrow SECURITY DEFINER list/get functions. `fridge_worker` and `fridge_readonly` do not receive those application observation functions. Direct IngredientConcept mutation privileges are not added.

## Application boundary

The slice introduces provider-neutral `IngredientConceptId`, `CurrentIngredientConcept`, `ListCurrentIngredientConceptsUseCase`, `GetCurrentIngredientConceptUseCase` and `CurrentIngredientConceptReader` contracts.

The database adapter validates the scope/owner invariant fail-closed and normalizes provider failures without leaking SQLSTATE/table/provider details through normal application contracts.

## Non-goals

This slice does not implement:

- IngredientConcept creation/change/retirement;
- Product↔IngredientConcept compatibility mapping/evidence;
- ProductIdentifier resolution or staged claims;
- global catalog mutation governance;
- HTTP delivery;
- frontend or deployment work.

## Acceptance gate

Before squash merge, one exact final HEAD must demonstrate:

- TypeScript build/unit success;
- DB-02 PostgreSQL 17/18 success;
- BE-00 regression success;
- GLOBAL + same-Household visibility;
- foreign/private/non-current nondisclosure;
- exact-membership revalidation after transaction authorization;
- deterministic ordering;
- direct IngredientConcept SELECT fencing and narrow EXECUTE privileges;
- panoramic review with zero unresolved material findings;
- automated Codex review completed without unresolved material findings;
- explicit owner authorization for squash merge;
- branch preservation after merge.
