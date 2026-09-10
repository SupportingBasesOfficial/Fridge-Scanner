# BE-06 — Substitution Over-receipt Acceptance

## Status

Executable acceptance contract for BE-06 step 8B-2B.

This slice accepts a previously `DETECTED` **different-Product** over-receipt into physical inventory. It extends the accepted-excess resolution/conservation model introduced by ordinary over-receipt acceptance without rewriting historical detection or PurchaseItem purchased quantity.

## Distinct truths remain distinct

The system preserves three independent facts:

1. `PurchaseItem` — what Product/quantity was purchased;
2. `ReceiptItemIntent` / physical materialization — what Product/quantity physically arrived;
3. `purchase_receiving_exception_resolution` — what exact portion outside purchased allowance was explicitly accepted.

Substitution acceptance never changes the requested Product or purchased quantity.

## Resolution model

`purchase_receiving_exception_resolution` is the single append-only accepted-over-receipt fact for both ordinary and substitution receiving.

Exactly one allocation identity is present:

```text
ACCEPTED_ORDINARY_EXCESS
  -> ordinary_allocation_id       NOT NULL
  -> substitution_allocation_id   NULL

ACCEPTED_SUBSTITUTION_EXCESS
  -> ordinary_allocation_id       NULL
  -> substitution_allocation_id   NOT NULL
```

For substitution acceptance, the resolution is structurally bound to:

- the detected exception;
- the exact detected `ReceiptItemIntent`;
- the exact committed `ReceiptItem`;
- the exact `purchase_item_substitution_allocation`;
- the exact physical substitution materialization bridge.

A resolution cannot be attached to another intent/allocation merely because it belongs to the same PurchaseItem.

## Shared receiving conservation

Ordinary and substitution allocations share one PurchaseItem receiving allowance.

For every allocation:

```text
covered_by_purchase(allocation)
=
converted allocation quantity
-
accepted excess for that exact allocation
```

The invariant remains:

```text
Σ covered ordinary allocations
+ Σ covered substitution allocations
<= purchased quantity
```

Accepted excess is allocation-local evidence, not a reusable credit and not a second allowance.

## Incremental acceptance

The historical discrepancy on `DETECTED` is not copied blindly into the resolution.

At acceptance time, the PurchaseItem is serialized and current receiving truth is recalculated after subtracting all previously accepted ordinary and substitution excess portions.

Only the exact incremental portion of the proposed substitution allocation outside the remaining purchased allowance is accepted.

## Different-Product requirement

Substitution acceptance requires:

```text
PurchaseItem.product_id <> ReceiptItemIntent.product_id
```

The allocation preserves:

- `requested_product_id = PurchaseItem.product_id`;
- `received_product_id = ReceiptItemIntent.product_id`;
- exact substituted quantity/unit;
- pinned conversion evidence when required;
- nonblank substitution `reason`;
- acceptance provenance.

Same-Product over-receipt must use the ordinary acceptance path.

## Reason and approval semantics

The over-receipt detection reason explains why an exception was recorded.

The substitution acceptance `reason` explains why the different received Product is being attributed to the PurchaseItem. It is a separate semantic command field and participates in idempotency equality.

`purchase_item_substitution_allocation.approved_by_user_id` remains optional under the existing substitution contract. This slice does not invent a new policy requiring approval of every substitution.

The over-receipt resolution itself records `approved_by_user_id = current authorized actor`, proving who accepted the excess.

## Cross-unit semantics

Physical receiving truth remains in the received unit.

Example:

```text
Purchased:          3 EACH of Product A
Received intent:    2 PACK of Product B
Pinned evidence:    2 PACK = 4 EACH

ReceiptItem:        2 PACK Product B
Substitution alloc: 2 PACK Product B attributed to Product A
Inventory ingress:  2 PACK Product B
Accepted excess:    1 EACH
```

The accepted excess is stored in the PurchaseItem comparison unit. No rounding or physical-unit rewriting is permitted.

## Governed command

`AcceptSubstitutionOverReceipt` requires:

- stable `CommandId`;
- current platform actor;
- Household;
- existing `OVER_RECEIPT / DETECTED` exception;
- immutable detection bridge;
- nonblank substitution reason;
- explicit current LOCATION or COMPARTMENT placement;
- nonblank acceptance provenance;
- `HOUSEHOLD_PROCUREMENT_ADMINISTER`.

The caller does not supply:

- ReceiptItemIntentId;
- PurchaseItemId;
- requested/received Product IDs;
- conversion evidence identity;
- accepted excess quantity.

Those are derived from durable detection evidence and current serialized receiving truth.

## DETECTED physical barrier

The shared physical claim remains closed by default.

A DETECTED intent may pass as `SUBSTITUTION` only when an exact same-transaction `household_accept_substitution_over_receipt_command` exists in `PENDING` state and matches:

- Household;
- detected exception;
- ReceiptItemIntent;
- exact candidate ReceiptItem.

Ordinary acceptance uses its own PENDING authority. The two authorities are not interchangeable.

Runtime roles cannot directly insert/update/delete either authority table.

## Atomic commit

One successful transaction commits together:

1. PENDING substitution acceptance authority;
2. different-Product ReceiptItem;
3. substitution allocation preserving requested/received Products + reason;
4. new placed StockItem of received Product;
5. positive `RECEIPT_INGRESS` movement of received Product;
6. exact ReceiptItem inventory effect;
7. substitution materialization bridge / physical claim;
8. `ACCEPTED_SUBSTITUTION_EXCESS` resolution;
9. PurchaseItem receiving conservation proof;
10. ReceiptItem allocation conservation proof;
11. ReceiptItem inventory-effect conservation proof;
12. ACCEPTED command result + shared CommandId registration.

Any failure rolls back the entire transaction.

## Idempotency

Semantic equality binds:

- actor;
- detected exception;
- substitution reason;
- placement kind/exact target;
- canonical acceptance provenance.

Generated resolution/ReceiptItem/allocation/StockItem/movement/effect identities are result-only.

Committed replay returns the original result without restoring current state or creating duplicate physical truth.

## Least privilege

`fridge_app` receives only EXECUTE on the dedicated substitution acceptance boundary.

No runtime role receives direct DML on:

- acceptance command authority;
- accepted-excess resolution;
- ReceiptItem;
- substitution allocation;
- StockItem;
- InventoryMovement;
- ReceiptItemInventoryEffect;
- materialization bridges.

Private accepted-excess and conservation helpers remain non-executable by runtime roles.

## Non-goals

This slice does not implement:

- rejection / return-to-supplier;
- correction or supersession of a mistaken detection;
- destructive mutation of DETECTED history;
- PurchaseItem quantity enlargement;
- mandatory substitution approval policy;
- generic inventory adjustment;
- stock merge;
- Batch/source-expiration capture;
- UNPLACED receiving;
- HTTP/read delivery;
- frontend/deployment.

## Gate

Acceptance requires one exact PR HEAD with:

- DB-02 PostgreSQL 17 + 18 SUCCESS;
- BE-00 SUCCESS;
- same-unit substitution over-receipt integration;
- cross-unit substitution over-receipt integration;
- stable replay and idempotency conflict proof;
- zero unresolved material review threads;
- panoramic/adversarial CLEAN;
- branch 0 behind canonical `main`.

Squash merge requires explicit owner authorization. Source branch is preserved.
