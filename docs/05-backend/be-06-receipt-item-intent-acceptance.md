# FridgeScanner — BE-06 ReceiptItem Intent Acceptance

## Status

Candidate executable slice **BE-06 6B — ReceiptItem intent**, based on canonical `main @ 1955d19b08068cf9c68d223d419c81925a1d467d` after accepted governed Receipt creation.

This slice refines the BE-06 overview step "governed Receipt creation and ReceiptItem intent" without weakening B6-023/B6-024.

## Why a separate intent exists

`fridge.receipt_item` is canonical physical receiving truth. B6-023 and B6-024 require that a committed ReceiptItem and its exact inventory-entry effects exist atomically. Therefore a workflow cannot safely persist a `receipt_item` merely to remember what an operator/scanner intends to receive before inventory ingress is executable.

BE-06 6B introduces `fridge.receipt_item_intent` as a distinct operational fact:

- it states that an authorized Household workflow intends to materialize one Product, exact quantity and MeasurementUnit inside one existing Receipt;
- it is not a ReceiptItem;
- it is not inventory;
- it consumes no PurchaseItem receiving allowance;
- it creates no ordinary/substitution allocation;
- it creates no StockItem, Batch, InventoryMovement or `receipt_item_inventory_effect`;
- it cannot be interpreted as proof that the Product physically entered inventory.

This is **not a draft ReceiptItem**. It is a different semantic type with a different identity. Future physical materialization must use an explicit governed transition/link and atomically satisfy B6-023/B6-024.

## Application contract

`CreateReceiptItemIntentUseCase` requires:

- stable `CommandId`;
- authenticated platform `PrincipalId`;
- authoritative `HouseholdId`;
- existing same-Household `ReceiptId`;
- currently visible `ProductId` under BE-05 rules;
- positive canonical `ExactRational` quantity;
- current `MeasurementUnitId`;
- nonblank provenance.

The application boundary rejects blank provenance and non-positive/noncanonical rational quantity before procurement authority acquisition.

## Authority and reference validation

Mutation requires current `HOUSEHOLD_PROCUREMENT_ADMINISTER` through the accepted BE-06 administration transaction.

For a first execution, PostgreSQL locks and validates in this direction:

```text
Household procurement authority
  -> Receipt
  -> Product
  -> MeasurementUnit
```

Product is accepted only when current GLOBAL or current same-Household private. Foreign private/missing/retired Product, foreign/missing Receipt and missing/retired MeasurementUnit collapse to provider-neutral `NotFound` behavior.

## Idempotency

The shared BE-06 registry gains intent code:

`CREATE_RECEIPT_ITEM_INTENT`

The durable command fingerprint binds:

- actor;
- Receipt;
- Product;
- exact quantity numerator/denominator;
- MeasurementUnit;
- canonical provenance.

Generated `ReceiptItemIntentId` is result-only and excluded from semantic equality.

Same-command replay returns the original result identity. Semantic divergence produces `IdempotencyConflict`. Cross-intent CommandId reuse conflicts through the shared procurement registry.

Committed replay is resolved before current Receipt/Product/unit revalidation and never recreates or restores later state.

## Persistence semantics

`fridge.receipt_item_intent` is Household-scoped, RLS-enabled and append-only.

It stores:

- `ReceiptItemIntentId`;
- Household;
- Receipt;
- Product;
- exact intended quantity numerator/denominator;
- intended MeasurementUnit;
- provenance;
- recording time.

No mutable lifecycle field is introduced in this slice. Corrections/withdrawal/replacement/materialization require future explicit governed facts rather than destructive rewrite.

## Physical non-effect invariant

Successful `CreateReceiptItemIntent` must leave all of the following untouched:

- `fridge.receipt_item`;
- `fridge.purchase_item_receipt_allocation`;
- `fridge.purchase_item_substitution_allocation`;
- `fridge.purchase_receiving_exception`;
- StockItem / Batch state;
- `fridge.inventory_movement`;
- `fridge.receipt_item_inventory_effect`.

In particular:

```text
ReceiptItemIntent != ReceiptItem
ReceiptItemIntent quantity != received inventory quantity
ReceiptItemIntent creation => zero inventory ingress
```

## Least privilege

`fridge_app` receives only EXECUTE on the intent-specific function. `fridge_worker` and `fridge_readonly` do not receive it. Runtime roles receive no direct INSERT/UPDATE/DELETE on `receipt_item_intent` or its command ledger.

## Proof obligations

Acceptance requires exact-HEAD proof that:

- DB migrations/integrity tests pass on PostgreSQL 17 and PostgreSQL 18;
- TypeScript/application unit tests pass;
- governed database integration creates exact intent through `fridge_app`;
- successful intent creation creates zero ReceiptItem/allocation/inventory effects;
- replay returns original result identity;
- semantic and cross-intent CommandId divergence conflict;
- foreign Receipt/Product and retired unit do not leak as alternate outcomes;
- missing procurement capability is unauthorized;
- intent history rejects UPDATE/DELETE;
- no runtime direct DML is granted;
- panoramic/adversarial review has zero unresolved material findings.

## Non-goals

This slice does not implement:

- physical ReceiptItem commitment;
- PurchaseItem↔ReceiptItem allocation;
- partial receiving-pool consumption;
- substitution;
- over-receipt acceptance/correction;
- placement;
- StockItem/Batch creation or merge;
- InventoryMovement entry effects;
- ReceiptItem-to-inventory-effect reconciliation;
- source expiration;
- HTTP/read delivery;
- generic inventory mutation.

## Immediate next boundary

After 6B is accepted, the next work must design the transition from an immutable ReceiptItemIntent into the physical receiving path. That transition cannot be accepted as committed ReceiptItem truth until the atomic inventory-ingress seam required by B6-023/B6-024 is executable in the same business transaction.
