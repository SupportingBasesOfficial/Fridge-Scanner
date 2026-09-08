# BE-05 — ChangeHouseholdProductMetadata acceptance

## Status

**ACCEPTED / MERGED**

- PR #41: `backend: implement governed ChangeHouseholdProductMetadata mutation`
- Squash/main: `2e91a52742ac1143292db2edd9da32b7aa6f8006`
- Parent: `b568831c6227c3a48ff6d72f70f126b4aad30934`
- Exact reviewed HEAD: `835966221e0181fc968f9708075c855595d5f015`
- Branch preserved: `backend/be-05-change-household-product-metadata`
- DB-02 #136: SUCCESS on PostgreSQL 17 and PostgreSQL 18
- BE-00 #223: SUCCESS complete
- Final panoramic reviews: CLEAN
- Unresolved material threads at merge: 0
- No automated Codex review was published; no claim of Codex CLEAN

## Accepted contract

- intent-specific `ChangeHouseholdProductMetadata`;
- stable caller `CommandId` and shared Household catalog intent `CHANGE_HOUSEHOLD_PRODUCT_METADATA`;
- current `HOUSEHOLD_CATALOG_ADMINISTER` authority;
- current same-Household `HOUSEHOLD` Product only;
- ProductId, catalog scope and owner Household immutable;
- mutable canonical name plus optional Brand/Manufacturer/ProductCategory references;
- global reference consumption only when selected rows are ACTIVE; this grants no authority to mutate those global reference rows;
- canonical serialization: Household authority -> Product -> Brand -> Manufacturer -> ProductCategory;
- committed replay before current target/reference validation;
- non-restoring retry semantics;
- provider-neutral invalid-reference, not-found, idempotency, authorization and dependency errors;
- least-privileged SECURITY DEFINER persistence.

## Adversarial behavior proved

- metadata change preserves Product identity, HOUSEHOLD scope, authoritative owner and ACTIVE lifecycle;
- ACTIVE Brand/Manufacturer/ProductCategory can be attached without mutating those global rows;
- retired global reference is rejected and Product remains unchanged;
- committed replay after later Product retirement/metadata changes returns the original target without restoring old state;
- cross-intent reuse of a CreateHouseholdProduct CommandId conflicts through the shared registry;
- foreign-Household private, GLOBAL, retired and missing Product targets collapse to NotFound;
- ordinary current Household membership without `HOUSEHOLD_CATALOG_ADMINISTER` is denied;
- malformed/non-exact canonical name is rejected before authority acquisition.
