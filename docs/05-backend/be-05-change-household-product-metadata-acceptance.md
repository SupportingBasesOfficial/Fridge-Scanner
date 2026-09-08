# BE-05 — ChangeHouseholdProductMetadata candidate evidence

## Status

Candidate evidence only. Formal acceptance requires exact-final-HEAD DB-02 PostgreSQL 17/18 + BE-00 SUCCESS, CLEAN panoramic reviews, zero unresolved material findings and explicit owner-authorized squash merge.

## Accepted upstream

- BE-05 normative baseline: PR #38 squash `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`.
- BE-05 Household catalog authority kernel: PR #39 squash `37e93ded114f1c8f82a16d7089d9e65b887bc433`.
- BE-05 CreateHouseholdProduct: PR #40 squash `b568831c6227c3a48ff6d72f70f126b4aad30934`, exact reviewed HEAD `a1fdc4c7d7a4e56eef13bd4ec1d969cf00ba3aee`, DB-02 #132 PG17/18 SUCCESS, BE-00 #219 SUCCESS.

## Candidate slice

PR #41 — `backend: implement governed ChangeHouseholdProductMetadata mutation`

Branch: `backend/be-05-change-household-product-metadata`

Base: `b568831c6227c3a48ff6d72f70f126b4aad30934`

The candidate establishes:

- intent-specific `ChangeHouseholdProductMetadata`;
- stable caller `CommandId` and shared Household catalog intent `CHANGE_HOUSEHOLD_PRODUCT_METADATA`;
- immutable ProductId, catalog scope and owner Household;
- current same-Household HOUSEHOLD Product only;
- mutable canonical name plus optional Brand/Manufacturer/ProductCategory references;
- global reference consumption only when referenced rows are ACTIVE; this does not grant authority to create/change global references;
- canonical serialization: Household authority -> Product -> Brand -> Manufacturer -> ProductCategory;
- committed replay before current target/reference validation;
- non-restoring retry semantics;
- provider-neutral invalid-reference, not-found, idempotency, authorization and dependency errors;
- least-privileged SECURITY DEFINER persistence.

## First executable gate evidence

Intermediate implementation HEAD `29ec38499f9e135c2a9f559140468347613b6441`:

- DB-02 #133: SUCCESS on PostgreSQL 17 and PostgreSQL 18;
- BE-00 #220: SUCCESS complete.

This evidence is intermediate because governance reconciliation moves the PR HEAD. Final acceptance must use the later exact final HEAD.

## Adversarial behavior proved

- metadata change preserves Product identity, HOUSEHOLD scope, authoritative owner and ACTIVE lifecycle;
- ACTIVE Brand/Manufacturer/ProductCategory can be attached without mutating those global reference rows;
- retired global reference is rejected and Product remains unchanged;
- committed replay after later Product retirement/metadata changes returns the original target without restoring old state;
- cross-intent reuse of a CreateHouseholdProduct CommandId conflicts through the shared registry;
- foreign-Household private, GLOBAL, retired and missing Product targets collapse to NotFound;
- ordinary current Household membership without `HOUSEHOLD_CATALOG_ADMINISTER` is denied;
- malformed/non-exact canonical name is rejected before authority acquisition.

## Non-goals

No Product retirement, GLOBAL Product mutation, Brand/Manufacturer/ProductCategory mutation, ProductIdentifier/StagedIdentifierClaim, IngredientConcept/compatibility, HTTP delivery, procurement/inventory, frontend or production deployment.
