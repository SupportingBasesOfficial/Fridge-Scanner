# FridgeScanner — BE-05 Household Catalog Authority Kernel

## Status

**Formally accepted.**

Accepted evidence:

- PR #39 — `backend: establish BE-05 household catalog authority kernel`;
- squash/main commit `37e93ded114f1c8f82a16d7089d9e65b887bc433`;
- parent `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`;
- exact reviewed HEAD `25f56ac86a32657e1674527b686e26ef7922d229`;
- DB-02 #128: SUCCESS on PostgreSQL 17 and PostgreSQL 18;
- BE-00 #215: SUCCESS complete;
- two exact-final-HEAD panoramic reviews: CLEAN;
- unresolved material threads at merge: 0;
- branch `backend/be-05-household-catalog-authority-kernel` preserved.

Codex evidence: an automated review on an earlier head found one P1 (authority time sampled before all governance-row lock waits) and one P2 (delegated transaction bootstrap failures could leak raw driver errors). Both findings were fixed, replied, resolved and outdated before merge. No claim is made that Codex published a separate CLEAN review of the final HEAD.

## Capability boundary

The accepted kernel establishes the provider-neutral Household capability:

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
- exact membership, role, role-capability mapping and capability locks;
- fresh `clock_timestamp()` only after all required authority/governance lock waits;
- exact active membership temporal revalidation using that fresh post-wait time;
- active role/mapping/capability revalidation;
- narrow EXECUTE only for `fridge_app`.

The function does not grant authority based on role names and does not create a GLOBAL catalog authority path.

## Least privilege

The accepted integrity proof requires:

- `fridge_app` has no direct authority reference-table access;
- `fridge_app` may execute only the narrow authority function needed by this boundary;
- `fridge_worker` and `fridge_readonly` cannot execute it;
- no pre-serialization `statement_timestamp()` is used;
- current time is sampled only after all governance locks required by B5-032;
- the canonical `HOUSEHOLD_CATALOG_ADMINISTER` capability is revalidated inside the function.

## Runtime adapter

`PgHouseholdCatalogAdministrationTransactionManager` wraps the already accepted `TransactionManager` and:

1. enters current authorized Household context;
2. calls the narrow PostgreSQL authority acquisition function;
3. requires the returned role code to match the already verified current Household role;
4. materializes the nominal catalog capability only after successful revalidation;
5. normalizes database failures from both the delegated transaction bootstrap and the authority query into provider-neutral application errors while preserving deliberate `ApplicationError` values.

It does not expose SQL or PostgreSQL types to BE-05 use cases.

## Adversarial evidence

The accepted database integration suite proves:

- a current member whose governed role carries `HOUSEHOLD_CATALOG_ADMINISTER` receives the catalog administration transaction;
- a current member with `HOUSEHOLD_STORAGE_ADMINISTER` but no catalog capability is denied;
- deleting the role-to-catalog-capability mapping causes the next acquisition to be denied, proving execution-time revalidation;
- membership expiry while authority acquisition waits on a governance-row lock is observed after the wait and denied;
- delegated SQLSTATE `08006` before the adapter callback maps to `DependencyUnavailableError`;
- deliberate provider-neutral `ApplicationError` from the operation is preserved;
- the capability exposed to application code is exactly the canonical provider-neutral value.

## Non-goals retained

This accepted kernel does not itself implement Product/IngredientConcept/Identifier/Compatibility mutation, GLOBAL catalog administration, HTTP delivery, procurement, inventory, frontend or deployment behavior. Later BE-05 slices consume this boundary rather than inventing parallel Household catalog authority.
