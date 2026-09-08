# BE-05 — CreateHouseholdProduct candidate evidence

## Status

Candidate evidence only. Formal acceptance requires exact-final-HEAD DB-02 PostgreSQL 17/18 + BE-00 SUCCESS, CLEAN panoramic reviews, zero unresolved material findings and explicit owner-authorized squash merge.

## Accepted upstream

- BE-05 normative baseline: PR #38 squash `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`, reviewed HEAD `2e0c73387184c737abf0ec9bdada5af8e4f3f39d`, BE-00 #208 SUCCESS.
- BE-05 Household catalog authority kernel: PR #39 squash `37e93ded114f1c8f82a16d7089d9e65b887bc433`, reviewed HEAD `25f56ac86a32657e1674527b686e26ef7922d229`, DB-02 #128 SUCCESS on PostgreSQL 17/18 and BE-00 #215 SUCCESS.
- PR #39 Codex evidence: one P1 and one P2 on an earlier head; both fixed, replied, resolved and outdated. No claim of a final-head Codex CLEAN review.

## Candidate slice

PR #40 — `backend: implement governed CreateHouseholdProduct mutation`

Branch: `backend/be-05-create-household-product`

Base: `37e93ded114f1c8f82a16d7089d9e65b887bc433`

The candidate establishes:

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

## First executable gate evidence

Intermediate implementation HEAD `6ad1e64c4c06b0abf066ca93d2f3b40830c1848f`:

- DB-02 #129: SUCCESS on PostgreSQL 17 and PostgreSQL 18;
- BE-00 #216: SUCCESS for Runtime/TypeScript/Unit, Container Smoke/Non-root/Health, PostgreSQL Contract + Backend RLS Integration, and configured authentication regression.

This evidence is intermediate because this document itself moves the PR HEAD. Final acceptance must use the later exact final HEAD.

## Adversarial behavior proved

- created Product is HOUSEHOLD-scoped and owned by the authoritative Household;
- Brand, Manufacturer and ProductCategory remain null in this slice;
- shared registry records `CREATE_HOUSEHOLD_PRODUCT`;
- committed retry with a different internal candidate returns the first ProductId;
- replay does not restore later canonical-name/lifecycle changes;
- divergent facts under one committed CommandId conflict;
- ordinary current Household membership without `HOUSEHOLD_CATALOG_ADMINISTER` is denied;
- malformed/non-exact canonical name is rejected before authority acquisition.

## Non-goals

No GLOBAL Product mutation, Product metadata change/retirement, catalog reads, Brand/Manufacturer/ProductCategory governance, ProductIdentifier/StagedIdentifierClaim, IngredientConcept/compatibility, HTTP delivery, procurement/inventory, frontend or production deployment.
