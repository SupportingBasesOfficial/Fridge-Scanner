# BE-05 — RetireHouseholdProduct executable slice

## Status

Executable candidate only. Formal acceptance requires exact-final-HEAD DB-02 PostgreSQL 17/18 + BE-00 SUCCESS, CLEAN panoramic reviews, zero unresolved material findings and explicit owner-authorized squash merge.

## Accepted upstream

- BE-05 normative baseline: PR #38.
- Household catalog authority kernel: PR #39.
- CreateHouseholdProduct: PR #40.
- ChangeHouseholdProductMetadata: PR #41, squash `2e91a52742ac1143292db2edd9da32b7aa6f8006`.

## Intent

`RetireHouseholdProduct`

Required authority: current `HOUSEHOLD_CATALOG_ADMINISTER`.

Target: current ACTIVE `HOUSEHOLD` Product owned by the exact authoritative Household.

## Dependency policy

Retirement preserves historical references and performs no cascade, relocation or downstream mutation.

Retirement blocks when current dependencies cannot remain valid:

- ACTIVE/non-retired StockItem;
- ACTIVE/non-retired ProductIdentifier;
- ACTIVE compatibility mapping whose effective interval has not ended.

Historical Batch, retired StockItem, retired ProductIdentifier, expired compatibility and other committed historical facts remain intact.

A DB-level current Product reference guard serializes current StockItem/ProductIdentifier/compatibility writes against Product retirement using Product `FOR KEY SHARE` versus retirement `FOR UPDATE`. This closes absent-row races and establishes an upstream invariant future downstream writers must obey.

## Idempotency

- stable caller `CommandId`;
- shared Household catalog CommandId registry intent `RETIRE_HOUSEHOLD_PRODUCT`;
- actor + Product target form the semantic command facts;
- committed replay occurs before current target/dependency validation;
- replay returns the original ProductId without restoring lifecycle or metadata;
- cross-intent reuse conflicts.

## Non-goals

No destructive Product delete, no stock/inventory mutation, no identifier retirement, no compatibility retirement, no GLOBAL Product governance, no reads/HTTP delivery, no IngredientConcept work, no frontend or deployment change.
