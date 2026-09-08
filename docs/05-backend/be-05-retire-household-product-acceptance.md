# BE-05 — RetireHouseholdProduct candidate evidence

## Status

Candidate evidence only. Formal acceptance requires exact-final-HEAD DB-02 PostgreSQL 17/18 + BE-00 SUCCESS, CLEAN panoramic reviews, zero unresolved material findings and explicit owner-authorized squash merge.

## Accepted upstream

- BE-05 normative baseline: PR #38 squash `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`.
- Household catalog authority kernel: PR #39 squash `37e93ded114f1c8f82a16d7089d9e65b887bc433`.
- CreateHouseholdProduct: PR #40 squash `b568831c6227c3a48ff6d72f70f126b4aad30934`.
- ChangeHouseholdProductMetadata: PR #41 squash `2e91a52742ac1143292db2edd9da32b7aa6f8006`, exact reviewed HEAD `835966221e0181fc968f9708075c855595d5f015`, DB-02 #136 PG17/18 SUCCESS, BE-00 #223 SUCCESS.

## Candidate slice

PR #42 — `backend: implement governed RetireHouseholdProduct mutation`

Branch: `backend/be-05-retire-household-product`

Base: `2e91a52742ac1143292db2edd9da32b7aa6f8006`

The candidate establishes:

- intent-specific `RetireHouseholdProduct`;
- stable caller `CommandId` and shared intent `RETIRE_HOUSEHOLD_PRODUCT`;
- current `HOUSEHOLD_CATALOG_ADMINISTER` reauthorization;
- current same-Household HOUSEHOLD Product only;
- dependency-aware retirement blocking ACTIVE/non-retired StockItem, ACTIVE/non-retired ProductIdentifier and ACTIVE non-ended compatibility mappings;
- historical references preserved with no cascade/downstream mutation;
- DB-level current Product reference guards on StockItem, ProductIdentifier and compatibility using Product KEY SHARE versus retirement FOR UPDATE serialization;
- committed replay before current target/dependency validation;
- non-restoring retry semantics;
- provider-neutral conflict/not-found/idempotency/authorization/dependency errors;
- least-privileged SECURITY DEFINER persistence.

## First executable gate evidence

Intermediate implementation HEAD `975ffa398d02df6a196e905ff773c59714cca494`:

- DB-02 #137: SUCCESS on PostgreSQL 17 and PostgreSQL 18;
- BE-00 #224: SUCCESS complete.

This evidence is intermediate because governance reconciliation moves the PR HEAD. Final acceptance must use the later exact final HEAD.

## Adversarial behavior proved

- retirement preserves Batch, retired StockItem, retired ProductIdentifier and expired compatibility history;
- current StockItem blocks retirement without cascade;
- current ProductIdentifier blocks retirement;
- non-ended compatibility mapping blocks retirement;
- replay remains non-restoring after later metadata changes;
- cross-intent CommandId reuse conflicts;
- foreign-Household private, GLOBAL, retired and missing Product targets collapse to NotFound;
- ordinary member without `HOUSEHOLD_CATALOG_ADMINISTER` is denied;
- retirement-first vs concurrent current StockItem creation serializes correctly: the writer waits, then fails `23514` after retirement commits.
