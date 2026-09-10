# BE-06 — Over-receipt Exception Detection Acceptance

## Status

Executable acceptance contract for BE-06 step 8B-1.

This slice governs **detection only**. It does not accept, reject, return, donate, discard, allocate or physically materialize excess goods.

## Semantic boundary

An over-receipt exists when the exact proposed `ReceiptItemIntent` quantity, added to the already committed ordinary + substitution receiving allocations for one `PurchaseItem`, exceeds the exact purchased quantity after valid evidence-backed conversion into the PurchaseItem comparison unit.

The discrepancy is **derived by the database** from current serialized receiving truth. A caller cannot supply or override the discrepant quantity.

```text
existing ordinary allocations
+ existing substitution allocations
+ proposed ReceiptItemIntent quantity
- purchased quantity
= exact positive over-receipt discrepancy
```

If the result is not positive, `RegisterOverReceiptException` conflicts because there is no over-receipt exception to record.

## Governed command

`RegisterOverReceiptException` requires:

- stable `CommandId`;
- current actor Principal;
- Household;
- unmaterialized `ReceiptItemIntent`;
- PurchaseItem belonging to the Receipt's linked Purchase;
- optional exact `MeasurementConversionEvidence` when the intent unit differs from the purchased unit;
- nonblank reason;
- nonblank detection provenance.

The candidate `PurchaseReceivingExceptionId` is result-only and excluded from semantic CommandId equality.

## Authority and lock order

The command requires current `HOUSEHOLD_PROCUREMENT_ADMINISTER` after Household serialization.

Canonical dependency order:

1. Household procurement authority;
2. Receipt parent discovery/lock;
3. `ReceiptItemIntent` serialization lock;
4. `PurchaseItem` receiving-pool serialization lock;
5. exact conversion evidence as consumed by the accepted conversion helper.

The intent lock is the same serialization class used by ordinary/substitution materialization. Detection therefore cannot race a physical materialization of the same intent into contradictory truth.

## Persisted truth

Successful detection appends:

- one `purchase_receiving_exception` with:
  - `exception_kind = 'OVER_RECEIPT'`;
  - `resolution_status = 'DETECTED'`;
  - exact positive discrepancy in the PurchaseItem comparison unit;
  - reason;
  - no approver;
  - no correction provenance;
- one immutable `receipt_item_intent_over_receipt_exception` bridge preserving:
  - Household;
  - ReceiptItemIntent;
  - PurchaseItem;
  - exception identity;
  - conversion evidence identity when required;
  - detection provenance;
- one durable idempotency command result.

`DETECTED` is immutable evidence that the discrepancy existed under the serialized receiving state at detection time. It is **not** a reservation and is **not** itself acceptance authority.

## Detected-intent materialization barrier

Once a `ReceiptItemIntent` has a detected over-receipt bridge, that intent is not eligible for ordinary or substitution physical materialization.

Both physical paths must pass through the shared `receipt_item_intent_physical_materialization` claim guard. The guard rejects a detected intent before physical commitment can become durable, regardless of whether a caller later presents the same intent against a different PurchaseItem with otherwise sufficient receiving allowance.

The rejection must roll back every candidate physical effect from the attempted transaction, including `ReceiptItem`, receiving allocation, `StockItem`, `InventoryMovement` and `receipt_item_inventory_effect`.

A future governed acceptance/correction workflow may change materialization eligibility only through a new explicit contract and evidence model. Detection itself never grants that authority.

## No reservation semantics

Detection does not reserve PurchaseItem allowance and does not freeze the rest of the receiving pool.

A later acceptance/correction workflow must revalidate current receiving truth. It must not blindly trust that the originally detected discrepancy is still the current discrepancy.

## Physical non-effects

Successful detection creates exactly zero:

- `ReceiptItem`;
- `purchase_item_receipt_allocation`;
- `purchase_item_substitution_allocation`;
- `StockItem`;
- `Batch`;
- `InventoryMovement`;
- `receipt_item_inventory_effect`.

Therefore:

```text
OverReceipt DETECTED != physical receipt
OverReceipt DETECTED != allowance reservation
OverReceipt DETECTED != acceptance
```

## Physical-history exclusion

A `ReceiptItemIntent` already present in `receipt_item_intent_physical_materialization` cannot enter this pre-materialization detection workflow. Historical physical correction requires a separate explicit correction/compensation contract.

One ReceiptItemIntent may have at most one detection bridge in this slice. A second different command attempting to register the same intent conflicts; replay of the same semantic CommandId returns the original exception identity and exact discrepancy.

## Append-only discipline

`purchase_receiving_exception`, its ReceiptItemIntent bridge, and committed command result are history-bearing. This slice does not mutate `resolution_status` after creation.

Later resolution must append explicit governed resolution evidence instead of rewriting the detected exception.

## Least privilege

`fridge_app` receives only EXECUTE on `fridge_internal.register_over_receipt_exception(...)`.

It receives no direct DML on exception/bridge/command tables and no direct EXECUTE on `fridge_internal.receiving_pool_overage(...)`.

Worker and readonly roles receive no mutation authority.

## Idempotency

Semantic equality binds:

- actor;
- ReceiptItemIntent;
- PurchaseItem;
- allocation conversion evidence identity;
- canonical reason;
- canonical detection provenance.

Committed replay returns the original:

- `PurchaseReceivingExceptionId`;
- discrepancy numerator/denominator;
- discrepancy unit.

Cross-intent reuse of the same shared procurement `CommandId` is an idempotency conflict.

## Non-goals

This slice does not implement:

- acceptance of excess into inventory;
- rejection/return-to-supplier workflow;
- correction or supersession workflow;
- PurchaseItem quantity enlargement;
- physical partial allocation plus excess splitting;
- substitution approval policy;
- stock merge;
- Batch/source-expiration capture;
- UNPLACED ingress;
- HTTP/read delivery;
- frontend or deployment.

## Gate

Acceptance requires exact-HEAD:

- DB-02 PostgreSQL 17 + 18 SUCCESS;
- BE-00 SUCCESS;
- zero unresolved material review threads;
- panoramic/adversarial CLEAN;
- branch 0 behind canonical `main`.

Squash merge requires explicit owner authorization. Source branch is preserved.
