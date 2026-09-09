# BE-06 — Ordinary ReceiptItem Materialization Acceptance

## Status

Candidate executable slice built on canonical `main @ f27ee4c606fd5e35f830e73358635065094e75c4`.

This slice refines the original BE-06 steps 7 and 9 for the first physically committable receiving path. It does not reserve Purchase receiving allowance in a draft relation. Instead, one immutable `ReceiptItemIntent` becomes physical truth only when ordinary same-Product allocation and inventory ingress can commit atomically.

## Business meaning

`ReceiptItemIntent` remains operational intent. This boundary is the first transition that creates authoritative physical receiving truth.

For one eligible intent it commits, in one database transaction:

1. `ReceiptItem` with Product + exact quantity/unit copied from the immutable intent;
2. ordinary `purchase_item_receipt_allocation` against a PurchaseItem of the Receipt's linked Purchase;
3. one new `StockItem` for the received Product;
4. one positive `InventoryMovement` with movement kind `RECEIPT_INGRESS`;
5. one typed `receipt_item_inventory_effect` linking ReceiptItem to that ledger movement;
6. one immutable `receipt_item_intent_materialization` bridge preserving the intent-to-physical transition.

No one of these facts may commit without all the others.

## Scope decisions

### Same-Product ordinary receiving only

The intent Product must equal the target PurchaseItem Product. A different Product is a substitution and is rejected by this boundary. Substitution remains a separate governed workflow.

### Receipt must be linked to Purchase

This ordinary allocation slice requires the parent Receipt to carry a Purchase reference and the target PurchaseItem to belong to exactly that Purchase. Receipts without Purchase remain valid upstream history but require a later standalone physical materialization path rather than a fabricated Purchase allocation.

### Exact partial receiving

The boundary serializes on the PurchaseItem receiving pool and includes both existing ordinary and substitution allocations when deciding availability.

The proposed exact intent quantity is converted to the PurchaseItem unit using pinned `MeasurementConversionEvidence` when required. If existing physical receiving plus the proposed allocation would exceed purchased quantity, the command returns a deterministic receiving conflict and commits no physical artifacts.

No rounding, truncation or hidden enlargement of purchased quantity is permitted.

### Placement is mandatory in this first ingress slice

Only current same-Household BE-04 topology is accepted:

- `LOCATION`: current active StorageLocation; or
- `COMPARTMENT`: current active Compartment whose parent StorageLocation is also current and active.

The lock direction for compartment placement is parent StorageLocation before Compartment.

`UNPLACED` is deliberately unsupported because B6-029 requires a separately accepted canonical unplaced receiving policy before executable use.

### No automatic stock merge

Every successful materialization creates a new StockItem. It does not search for or merge into an existing StockItem.

This deliberately avoids inventing the identity-coherence/aggregation policy deferred by B6-045. A later accepted policy may add safe aggregation without rewriting this history.

### No Batch fabrication

Batch is null in this slice. Unknown lot provenance never causes synthetic Batch creation.

## Atomic physical invariant

The boundary calls the already-accepted DB-02 conservation assertions before returning:

- `assert_purchase_receiving_pool`;
- `assert_receipt_item_allocation_pool`;
- `assert_receipt_item_inventory_effects`.

Therefore the physical commit must satisfy:

```text
ReceiptItem exact quantity
  == ordinary allocation quantity attributed in this slice
  == positive RECEIPT_INGRESS movement quantity
  == linked receipt_item_inventory_effect quantity
```

for the one-effect/no-split case, while existing deferred constraints remain defense in depth.

Future split receiving may create multiple effects only under B6-027 exact conservation.

## Intent consumption

`receipt_item_intent_materialization` has one primary row per Household + ReceiptItemIntent and unique result identities.

Consequences:

- the same intent cannot be physically materialized twice under different CommandIds;
- replay of the same committed CommandId returns the original five result identities;
- another CommandId targeting an already-materialized intent receives conflict;
- the bridge is append-only and cannot be rewritten or deleted.

## Command identity

Shared BE-06 intent code:

`MATERIALIZE_ORDINARY_RECEIPT_ITEM`

Semantic equality binds:

- actor;
- ReceiptItemIntent;
- PurchaseItem;
- optional allocation conversion evidence;
- placement kind + exact topology identity;
- canonical materialization provenance.

Generated ReceiptItem/allocation/StockItem/movement/effect identities are result-only and excluded from semantic equality.

Committed replay is checked before current Product/unit/topology validation and is non-restoring.

## Lock order

Canonical direction:

1. current Household procurement authority;
2. Receipt parent;
3. ReceiptItemIntent materialization serialization;
4. PurchaseItem / shared physical receiving pool;
5. current visible Product;
6. current MeasurementUnit;
7. current topology — StorageLocation, then Compartment when applicable.

No generic inventory authority is opened.

## Least privilege

`fridge_app` receives EXECUTE only on the intent-specific materialization function.

It receives no direct insert/update/delete authority over:

- ReceiptItemIntent materialization bridge;
- command ledger;
- ReceiptItem;
- PurchaseItem allocation;
- StockItem;
- InventoryMovement;
- receipt inventory effect.

The receiving-availability helper remains private.

## Required executable proofs

Acceptance requires at minimum:

- exact same-Product physical materialization;
- `ReceiptItem` quantity equals linked inventory effect sum;
- positive `RECEIPT_INGRESS` movement points at a newly created placed StockItem;
- LOCATION placement;
- COMPARTMENT placement;
- partial receiving across multiple intents;
- deterministic over-receipt conflict with zero candidate physical artifacts;
- same CommandId replay returns original identities;
- Product mismatch conflicts;
- retired/invalid topology is rejected;
- missing procurement capability is unauthorized;
- shared CommandId cross-intent semantics remain intact;
- no direct runtime physical DML;
- PostgreSQL 17 and 18 DB-02 replay;
- BE-00 runtime/build/RLS/container proof on one exact HEAD;
- zero unresolved material findings and panoramic/adversarial CLEAN.

## Explicit non-goals

This slice does not implement:

- substitution allocation;
- over-receipt acceptance/exception resolution;
- standalone Receipt-without-Purchase physical materialization;
- Batch creation/selection;
- SourceExpirationFact capture;
- split ingress across multiple StockItems/effects;
- UNPLACED receiving;
- merge into existing StockItem;
- inventory transfer/consumption/waste/count/reconciliation;
- HTTP/read delivery;
- frontend/deployment.

Any later capability must preserve the immutable physical history accepted here.
