# BE-06 — Ordinary Over-receipt Acceptance

## Status

Executable acceptance contract for BE-06 step 8B-2A.

This slice accepts a previously `DETECTED` **same-Product** over-receipt into physical inventory. It does not implement substitution over-receipt, rejection/return, correction/supersession, PurchaseItem enlargement, stock merge, Batch creation or UNPLACED ingress.

## Historical truth is not rewritten

`purchase_receiving_exception` remains the immutable detection fact. Its historical `resolution_status = 'DETECTED'`, discrepancy, reason and detection provenance are not updated.

Acceptance appends a separate `purchase_receiving_exception_resolution` fact with:

- exact detected exception identity;
- exact ReceiptItemIntent identity;
- exact PurchaseItem identity;
- exact committed ReceiptItem identity;
- exact ordinary allocation identity;
- exact accepted excess portion;
- PurchaseItem comparison unit;
- `resolution_kind = 'ACCEPTED_ORDINARY_EXCESS'`;
- approving platform user;
- acceptance provenance;
- commit timestamp.

The resolution is append-only.

## Purchased truth never expands

Acceptance does **not** update `PurchaseItem.purchased_quantity_*`.

The PurchaseItem continues to answer “what was purchased”. The resolution answers “what additional physical quantity was explicitly accepted despite exceeding that purchase”.

The canonical receiving equation becomes allocation-local:

```text
covered_by_purchase(allocation)
=
converted_allocation_quantity
-
accepted_excess_for_that_exact_allocation
```

and globally:

```text
Σ ordinary covered_by_purchase
+ Σ substitution allocation
<= purchased quantity
```

This slice supports accepted excess only for ordinary same-Product allocations. Substitution allocations remain fully inside the purchased receiving pool until a separate substitution-over-receipt contract is accepted.

## Accepted excess is incremental, not copied from DETECTED

The discrepancy stored by detection is historical receiving state at detection time. Acceptance must revalidate current serialized receiving truth.

Therefore the accepted excess quantity is recalculated at acceptance time as the exact portion of the proposed allocation that falls outside the **current remaining purchased allowance after subtracting prior accepted ordinary excess portions**.

Example:

```text
Purchased: 1 EACH

First intent: 2 EACH
DETECTED discrepancy: 1 EACH
ACCEPTED excess:       1 EACH

Second intent: 1 EACH
Current total raw overage at detection: 2 EACH
DETECTED discrepancy:                2 EACH
ACCEPTED incremental excess:         1 EACH
```

The second resolution must not copy `2 EACH`; only the new allocation's exact uncovered portion is accepted.

## Cross-unit semantics

Physical receiving truth remains in the ReceiptItemIntent unit.

If an intent is `2 PACK`, the committed:

- ReceiptItem quantity;
- ordinary allocation quantity;
- InventoryMovement quantity;
- ReceiptItemInventoryEffect quantity

remain `2 PACK`.

When the PurchaseItem is in another unit, the exact pinned `MeasurementConversionEvidence` from detection is reused for receiving-pool comparison. The accepted excess is recorded in the PurchaseItem comparison unit.

Example:

```text
Purchased: 3 EACH
Intent:    2 PACK
Evidence:  2 PACK = 4 EACH

Physical truth: 2 PACK
Accepted excess: 1 EACH
```

No rounding or unit reinterpretation is permitted.

## Governed command

`AcceptOrdinaryOverReceipt` requires:

- stable `CommandId`;
- current actor Principal;
- Household;
- existing Household `purchase_receiving_exception` bound to an immutable ReceiptItemIntent detection bridge;
- `exception_kind = 'OVER_RECEIPT'`;
- historical `resolution_status = 'DETECTED'`;
- same-Product ReceiptItemIntent/PurchaseItem;
- valid pinned allocation conversion evidence when cross-unit;
- current active Product and measurement unit;
- explicit current LOCATION or COMPARTMENT placement;
- nonblank acceptance provenance.

The caller does not supply:

- ReceiptItemIntentId;
- PurchaseItemId;
- conversion evidence identity;
- accepted excess quantity.

Those are derived from the detected exception and current serialized receiving truth.

## Authority and lock order

Acceptance requires `HOUSEHOLD_PROCUREMENT_ADMINISTER`.

Canonical dependency order:

1. Household procurement authority;
2. shared BE-06 CommandId intent;
3. committed replay check;
4. detection bridge discovery;
5. Receipt parent lock;
6. ReceiptItemIntent serialization lock;
7. detected exception/resolution eligibility;
8. PurchaseItem receiving-pool serialization lock;
9. Product/unit current-state locks;
10. topology locks;
11. physical/resolution commit.

No reverse lock order is introduced relative to ordinary/substitution materialization or detection.

## DETECTED physical barrier

A detected over-receipt remains blocked by the shared physical-claim guard.

The guard permits materialization only when all of these are true:

- materialization kind is `ORDINARY`;
- an exact `household_accept_ordinary_over_receipt_command` exists in `PENDING` state;
- it references the same Household;
- the same detected exception;
- the same ReceiptItemIntent;
- the exact candidate ReceiptItem being claimed.

The command table has no direct runtime DML. Therefore ordinary/substitution materializers cannot manufacture this authority.

## Atomic physical acceptance

One successful transaction commits together:

1. PENDING acceptance command authority;
2. ReceiptItem copied from immutable intent;
3. full ordinary PurchaseItem allocation;
4. new placed StockItem;
5. positive `RECEIPT_INGRESS` InventoryMovement;
6. exact ReceiptItemInventoryEffect;
7. ordinary ReceiptItemIntent materialization bridge / physical claim;
8. append-only accepted-excess resolution;
9. PurchaseItem receiving conservation proof;
10. ReceiptItem allocation conservation proof;
11. ReceiptItem inventory-effect conservation proof;
12. ACCEPTED command result + shared CommandId registration.

Any failure rolls the entire transaction back. A PENDING command or partial physical artifact cannot survive alone.

## Idempotency

Semantic CommandId equality binds:

- actor;
- detected exception identity;
- placement kind and exact topology target;
- canonical acceptance provenance.

Generated resolution/ReceiptItem/allocation/StockItem/movement/effect identities are result-only.

Committed replay returns the original six identities plus original accepted excess quantity/unit before current-state revalidation. Replay does not create a second resolution or second physical receipt.

## Least privilege

`fridge_app` receives only EXECUTE on `fridge_internal.accept_ordinary_over_receipt(...)`.

Runtime roles do not receive direct DML on:

- acceptance command authority;
- resolution evidence;
- ReceiptItem;
- allocations;
- StockItem;
- InventoryMovement;
- inventory-effect provenance.

Private conservation and physical-claim helpers remain non-executable by runtime roles.

## Non-goals

This slice does not implement:

- substitution over-receipt acceptance;
- rejection / return-to-supplier;
- correction or supersession of a mistaken detection;
- destructive mutation of DETECTED history;
- PurchaseItem quantity enlargement;
- generic inventory adjustment authority;
- stock aggregation/merge;
- Batch/source-expiration capture;
- UNPLACED receiving;
- HTTP/read delivery;
- frontend/deployment.

## Gate

Acceptance requires one exact PR HEAD with:

- DB-02 PostgreSQL 17 + 18 SUCCESS;
- BE-00 SUCCESS;
- same-unit integration including repeated accepted excess;
- cross-unit integration;
- stable replay;
- normal receiving remaining blocked without explicit acceptance;
- zero unresolved material review threads;
- panoramic/adversarial CLEAN;
- branch 0 behind canonical `main`.

Squash merge requires explicit owner authorization. Source branch is preserved.
