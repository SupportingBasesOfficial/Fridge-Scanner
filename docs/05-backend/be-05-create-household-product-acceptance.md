# BE-05 — CreateHouseholdProduct acceptance

## Status

**Accepted.**

- PR #40 — `backend: implement governed CreateHouseholdProduct mutation`
- squash/main: `b568831c6227c3a48ff6d72f70f126b4aad30934`
- parent: `37e93ded114f1c8f82a16d7089d9e65b887bc433`
- exact reviewed HEAD: `a1fdc4c7d7a4e56eef13bd4ec1d969cf00ba3aee`
- DB-02 #132: SUCCESS on PostgreSQL 17 and PostgreSQL 18
- BE-00 #219: SUCCESS complete
- final panoramic reviews: CLEAN
- unresolved material threads at merge: 0
- automated Codex review: none published; no claim of Codex CLEAN
- branch `backend/be-05-create-household-product`: preserved

## Accepted upstream

- BE-05 normative baseline: PR #38 squash `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`.
- BE-05 Household catalog authority kernel: PR #39 squash `37e93ded114f1c8f82a16d7089d9e65b887bc433`.

## Accepted behavior

The accepted slice establishes:

- intent-specific `CreateHouseholdProduct`;
- stable caller `CommandId`;
- internal/server-generated ProductId candidate;
- exact canonical-name validation before authority acquisition;
- current `HOUSEHOLD_CATALOG_ADMINISTER` reauthorization;
- forced `catalog_scope = HOUSEHOLD` and exact authoritative owner Household;
- no implicit Brand/Manufacturer/ProductCategory creation or attachment;
- durable create command ledger;
- shared Household-scoped BE-05 catalog CommandId registry introduced from the first mutation;
- candidate-independent committed replay;
- non-restoring retry behavior;
- provider-neutral error mapping;
- least-privileged SECURITY DEFINER persistence.

## Adversarial behavior proved

- created Product is HOUSEHOLD-scoped and owned by the authoritative Household;
- Brand, Manufacturer and ProductCategory remain null in this slice;
- shared registry records `CREATE_HOUSEHOLD_PRODUCT`;
- committed retry with a different internal candidate returns the first ProductId;
- replay does not restore later canonical-name/lifecycle changes;
- divergent facts under one committed CommandId conflict;
- ordinary current Household membership without `HOUSEHOLD_CATALOG_ADMINISTER` is denied;
- malformed/non-exact canonical name is rejected before authority acquisition.

## Non-goals retained

No GLOBAL Product mutation, Product metadata change/retirement, catalog reads, Brand/Manufacturer/ProductCategory mutation, ProductIdentifier/StagedIdentifierClaim, IngredientConcept/compatibility, HTTP delivery, procurement/inventory, frontend or production deployment.
