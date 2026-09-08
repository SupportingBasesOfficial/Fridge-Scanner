# FridgeScanner — BE-05 Household Catalog Authority Kernel

## Status

This document records the first executable BE-05 slice as a **merge candidate**, not accepted history.

Accepted upstream baseline:

- BE-04 closed on `main @ bc3874df2d3106bb66f57a102465a48c57d83956`.
- BE-05 normative baseline accepted by PR #38 squash `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`, exact reviewed HEAD `2e0c73387184c737abf0ec9bdada5af8e4f3f39d`.
- BE-00 #208 on the BE-05 normative baseline: SUCCESS.
- BE-05 normative panoramic reviews: CLEAN.
- unresolved material normative threads at merge: 0.

Active implementation candidate:

- PR #39 — `backend: establish BE-05 household catalog authority kernel`.
- branch `backend/be-05-household-catalog-authority-kernel`.
- base `main @ bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`.

## Capability boundary

The candidate establishes the provider-neutral Household capability:

`HOUSEHOLD_CATALOG_ADMINISTER`

It is deliberately distinct from:

- `HOUSEHOLD_MEMBERSHIP_ADMINISTER`;
- `HOUSEHOLD_STORAGE_ADMINISTER`;
- any provider role/claim;
- any future GLOBAL catalog governance authority.

No production Household role is mapped automatically. Role-to-capability assignment remains governed data.

## Application contract

The application layer defines:

- `HOUSEHOLD_CATALOG_ADMINISTRATION_CAPABILITY`;
- nominal `HouseholdCatalogAdministrationTransaction`;
- `HouseholdCatalogAdministrationTransactionManager`.

A use case that requires Household-private catalog mutation must receive this stronger transaction type rather than a generic authorized Household transaction.

## PostgreSQL authority acquisition

Migration `000051__household_catalog_capability.sql` establishes:

- canonical capability reference data;
- `fridge_internal.acquire_household_catalog_admin_authority(uuid,uuid,uuid)`;
- SECURITY DEFINER execution with fixed `pg_catalog` search path;
- mandatory server-set Household context match;
- Household-first `FOR UPDATE` serialization;
- fresh post-lock `clock_timestamp()` authority observation;
- exact active membership identity revalidation;
- active role and role-capability mapping revalidation;
- active capability revalidation;
- narrow EXECUTE only for `fridge_app`.

The function does not grant authority based on role names and does not create a GLOBAL catalog authority path.

## Least privilege

The integrity proof requires:

- `fridge_app` has no direct capability/reference-table access;
- `fridge_app` may only execute the narrow authority function;
- `fridge_worker` and `fridge_readonly` cannot execute it;
- no pre-serialization `statement_timestamp()` is used;
- the canonical `HOUSEHOLD_CATALOG_ADMINISTER` capability is revalidated inside the function.

## Runtime adapter

`PgHouseholdCatalogAdministrationTransactionManager` wraps the already accepted `TransactionManager` and:

1. enters current authorized Household context;
2. calls the narrow PostgreSQL authority acquisition function;
3. requires the returned role code to match the already verified current Household role;
4. materializes the nominal catalog capability only after successful revalidation;
5. maps provider/database failures to accepted provider-neutral dependency/internal errors.

It does not expose SQL or PostgreSQL types to future BE-05 use cases.

## Adversarial evidence

The database integration suite proves:

- a current member whose governed role carries `HOUSEHOLD_CATALOG_ADMINISTER` receives the catalog administration transaction;
- a current member with `HOUSEHOLD_STORAGE_ADMINISTER` but no catalog capability is denied;
- deleting the role-to-catalog-capability mapping causes the next acquisition to be denied, proving execution-time revalidation;
- the capability value exposed to application code is exactly the canonical provider-neutral capability.

## Initial executable evidence

On pre-documentation candidate HEAD `e0a0266536aa3af81d4197c55922b854d2d41395`:

- DB-02 PostgreSQL Gate #122: SUCCESS on PostgreSQL 17 and PostgreSQL 18;
- BE-00 Backend Gate #209: SUCCESS across Runtime / TypeScript / Unit, Container Smoke / Non-root / Health Semantics, PostgreSQL 17 contract + backend RLS/database integration, and configured authentication regression.

This evidence is intermediate because this evidence document moves the PR HEAD. Formal acceptance requires the final exact HEAD to pass DB-02 PG17/18 and BE-00 again, followed by CLEAN panoramic reviews, zero unresolved material findings, explicit owner-authorized squash merge, verified resulting `main` commit/parent, and preserved branch.

## Non-goals

This slice does not implement:

- Product create/read/change/retire;
- IngredientConcept create/read/change/retire;
- ProductCategory, Brand or Manufacturer governance;
- ProductIdentifier or StagedIdentifierClaim workflows;
- Product↔IngredientConcept compatibility mutation;
- GLOBAL catalog administration;
- HTTP delivery;
- procurement, inventory, frontend or deployment behavior.

Those later slices must consume this authority boundary rather than invent parallel Household catalog authority.
