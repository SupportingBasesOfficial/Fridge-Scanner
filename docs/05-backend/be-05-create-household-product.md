# BE-05 — CreateHouseholdProduct executable slice

## Status

Implementation candidate only. This document does not claim acceptance before exact-HEAD gates, review and owner-authorized squash merge.

## Intent

`CreateHouseholdProduct` creates a new current Product owned by exactly one Household.

## Contract

Input:

- stable caller `CommandId`;
- authenticated `PrincipalId`;
- authoritative `HouseholdId`;
- exact nonblank `canonicalName`.

Output:

- committed `ProductId`.

The server generates the candidate ProductId internally. The candidate identity is not part of the semantic request fingerprint; an identical retry may generate a different proposal but must return the first committed ProductId.

## Persistence semantics

New execution must:

1. require server-set Household context;
2. reacquire current `HOUSEHOLD_CATALOG_ADMINISTER` authority;
3. serialize through the Household catalog authority kernel;
4. reserve/assert the Household-scoped CommandId for `CREATE_HOUSEHOLD_PRODUCT`;
5. check committed replay before applying new state;
6. bind the command to actor + exact canonical name;
7. sample creation time only after authority serialization;
8. insert exactly one `fridge.product` with `catalog_scope='HOUSEHOLD'`, `owner_household_id` equal to the authoritative Household, `brand_id/manufacturer_id/product_category_id = null`, `lifecycle_status='ACTIVE'`;
9. register the committed intent in the shared BE-05 Household catalog command registry;
10. return the committed ProductId.

## Replay / idempotency

- same Household + same CommandId + same actor + same canonical name => first committed ProductId, without reapplying;
- divergent facts => `IDEMPOTENCY_CONFLICT`;
- CommandId reserved by another BE-05 Household catalog intent => provider-neutral idempotency conflict;
- committed replay never rewrites later metadata or lifecycle.

## Non-goals

This slice does not create GLOBAL Product, attach Brand/Manufacturer/ProductCategory, create ProductIdentifier/StagedIdentifierClaim, create IngredientConcept/compatibility, mutate inventory/procurement, or expose HTTP delivery.
