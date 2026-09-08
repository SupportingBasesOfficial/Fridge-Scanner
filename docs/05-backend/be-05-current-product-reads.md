# FridgeScanner — BE-05 Current Product Reads

## Status

Executable BE-05 slice candidate built on accepted `main @ 460f7d452fbac180a1db6320764c5ad60601c376`.

## Purpose

Establish provider-neutral observational Product reads before BE-05 HTTP delivery and phase-exit proof. This slice implements B5-006, B5-019, B5-020, B5-021 and B5-033 without widening Household catalog mutation authority.

## Contracts

The application exposes two intent-specific observations:

- `ListCurrentProducts` for one authorized Household context;
- `GetCurrentProduct` for one Product identity in that Household context.

Ordinary current Household membership is sufficient for these observations. `HOUSEHOLD_CATALOG_ADMINISTER` is not required and no read result confers mutation authority.

## Visibility

A current Product is observable only when `lifecycle_status = 'ACTIVE'` and either:

- `catalog_scope = 'GLOBAL'`; or
- `catalog_scope = 'HOUSEHOLD'` with `owner_household_id` equal to the exact requested Household.

Another Household's private Product is never returned. Missing, non-current and foreign-Household private targets collapse to the same provider-neutral `NOT_FOUND` outcome for identity reads.

List ordering is deterministic by `product_id`. The contract exposes Product identity/scope/owner plus canonical metadata identifiers and creation time; it does not infer stock, identifier, compatibility or mutation authority.

## Authorization and least privilege

Both persistence reads execute only inside an already-authorized Household transaction and independently revalidate:

- server-set Household context;
- exact actor PrincipalId;
- exact current membership identity;
- current membership lifecycle/effective interval.

Persistence is exposed through narrow `SECURITY DEFINER` functions granted to `fridge_app`. Worker/readonly roles do not receive these application read entry points, and no broad Product DML privilege is added.

## Failure normalization

- invalid/expired exact acting membership -> `HouseholdUnauthorizedError`;
- hidden/missing/non-current Product -> `NotFoundError`;
- database availability failure -> `DependencyUnavailableError`;
- malformed/impossible persistence state -> `InternalApplicationError`.

Raw SQLSTATEs, table names and foreign private Product existence do not cross the application boundary.

## Non-goals

This slice does not implement:

- IngredientConcept reads;
- Product mutation;
- ProductIdentifier resolution or staged claims;
- compatibility reads/evidence;
- global catalog mutation governance;
- HTTP routes;
- frontend or deployment changes.

## Acceptance gate

The candidate requires one exact final HEAD with:

- strict TypeScript/unit success;
- DB-02 replay on PostgreSQL 17/18;
- least-privileged PostgreSQL integration proving GLOBAL + same-Household visibility;
- foreign/private/non-current nondisclosure;
- exact-membership revalidation;
- deterministic list ordering;
- existing BE-00 regressions green;
- panoramic review with zero unresolved material findings.

Merge remains owner-authorized only and the branch must be preserved.
