# BE-06 — Household Procurement Administration Authority Kernel

## Status

Candidate executable slice on accepted `main @ 379738310ea3ab24e57850131df8cc624e0d75a0`.

This document becomes acceptance evidence only if one exact final PR HEAD passes all required DB-02/BE-00 gates and independent review, then is explicitly owner-authorized for squash merge.

## Scope

This slice materializes the dedicated BE-06 Household procurement/receiving mutation authority required by B6-002 and B6-003. It deliberately implements no Purchase or Receipt mutation yet.

Application boundary:

- `HOUSEHOLD_PROCUREMENT_ADMINISTRATION_CAPABILITY = 'HOUSEHOLD_PROCUREMENT_ADMINISTER'`;
- nominal `HouseholdProcurementAdministrationTransaction`;
- `HouseholdProcurementAdministrationTransactionManager`.

Persistence boundary:

- canonical `HOUSEHOLD_PROCUREMENT_ADMINISTER` capability reference fact;
- `fridge_internal.acquire_household_procurement_admin_authority(uuid,uuid,uuid)`;
- SECURITY DEFINER with fixed `pg_catalog` search path;
- EXECUTE granted only to `fridge_app`;
- no direct capability/reference-table access granted to runtime roles.

## Authority semantics

Authority acquisition preserves the accepted chain:

```text
verified PrincipalId
  -> current authorized Household transaction
  -> Household FOR UPDATE serialization anchor
  -> exact current membership FOR UPDATE
  -> current role FOR SHARE
  -> exact role/capability mapping FOR SHARE
  -> active capability FOR SHARE
  -> fresh clock_timestamp()
  -> HOUSEHOLD_PROCUREMENT_ADMINISTER transaction capability
```

The function returns the current role code only if all authority facts remain current after every required lock wait. Application code verifies that returned role equals the already-authorized transaction role before materializing the nominal capability.

No JWT/provider role, Household claim, request header, storage authority or catalog authority becomes procurement authority.

## Separation proofs

Integration coverage establishes that:

- a role explicitly mapped to `HOUSEHOLD_PROCUREMENT_ADMINISTER` acquires procurement authority;
- a role holding both `HOUSEHOLD_CATALOG_ADMINISTER` and `HOUSEHOLD_STORAGE_ADMINISTER` but not procurement capability is denied;
- current membership time is evaluated after governance lock waits rather than before them;
- revoking the procurement role/capability mapping is observed at next acquisition;
- delegated database availability failures remain provider-neutral;
- provider-neutral application errors raised inside a procurement transaction are preserved.

## Least privilege proof

The DB integrity gate requires:

- capability exists and is ACTIVE;
- migration does not guess any concrete role mapping;
- `fridge_app` has no direct SELECT/DML on capability mapping/reference tables;
- only `fridge_app` may execute the procurement authority acquisition function;
- `fridge_worker` and `fridge_readonly` cannot materialize procurement administration authority;
- the function explicitly uses post-lock `clock_timestamp()` and never `statement_timestamp()` for current authority truth.

## Non-goals

This slice does not implement:

- Purchase/PurchaseItem creation or mutation;
- Receipt/ReceiptItem creation or commitment;
- money or measurement evidence workflows;
- substitution/over-receipt allocation;
- inventory ingress or generic inventory authority;
- Product/catalog mutation;
- storage mutation;
- HTTP/frontend/deployment changes;
- production role-to-capability assignment policy.

## Acceptance gate

A final candidate is merge-ready only when:

1. it remains one exact immutable HEAD over the accepted BE-06 baseline;
2. DB-02 passes on PostgreSQL 17 and PostgreSQL 18;
3. BE-00 passes completely, including database/RLS regressions;
4. independent panoramic/adversarial review is CLEAN;
5. unresolved material findings are zero;
6. the owner explicitly authorizes squash merge and the source branch is preserved.
