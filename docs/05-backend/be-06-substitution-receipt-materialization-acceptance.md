# BE-06 — Substitution ReceiptItem Materialization Acceptance

## Status

Candidate executable slice built after ordinary receiving was accepted on canonical `main`.

This slice implements BE-06 step 8A: different-Product substitution receiving that remains within the PurchaseItem physical receiving allowance. Over-receipt exception acceptance/correction remains a separate step 8B.

## Business meaning

Substitution is not over-receipt.

A substitution exists when the Product physically received differs from the Product requested by the target PurchaseItem. When the exact substituted quantity still fits inside the shared PurchaseItem receiving pool, it is valid physical receiving and must be materialized atomically just like ordinary receiving.

For one eligible `ReceiptItemIntent`, this boundary commits in one database transaction:

1. `ReceiptItem` carrying the received Product and exact quantity/unit from the immutable intent;
2. `purchase_item_substitution_allocation` preserving:
   - requested Product from the PurchaseItem;
   - received Product from the ReceiptItemIntent;
   - exact substituted quantity/unit;
   - optional immutable conversion evidence;
   - mandatory reason;
   - provenance;
3. one new placed `StockItem` for the received Product;
4. one positive `RECEIPT_INGRESS` `InventoryMovement`;
5. one `receipt_item_inventory_effect`;
6. one immutable intent-to-substitution-materialization bridge.

No physical fact may commit without the others.

## Shared receiving pool

Ordinary and substitution allocations consume the same PurchaseItem allowance.

The boundary serializes on the PurchaseItem and evaluates existing ordinary plus substitution allocations through the accepted exact-conversion receiving pool.

If the proposed substitution would exceed purchased quantity after exact conversion, the command returns deterministic receiving conflict and commits no ReceiptItem, substitution allocation, StockItem, InventoryMovement or receipt effect.

The boundary does not:

- enlarge PurchaseItem quantity;
- truncate physical quantity;
- create hidden residual stock;
- silently convert excess into an unrelated receipt;
- automatically create `purchase_receiving_exception`.

The explicit over-receipt workflow is the next BE-06 slice.

## Different-Product invariant

The target PurchaseItem Product and ReceiptItemIntent Product must differ.

If they are equal, this boundary returns conflict because same-Product receiving belongs to the already-accepted ordinary materialization path.

The received Product must be current and visible under BE-05 rules. The requested Product identity comes from immutable PurchaseItem history; substitution does not mutate or repair catalog truth.

## Approval semantics

`purchase_item_substitution_allocation.approved_by_user_id` remains null in this slice.

B6-014 requires approval only when policy requires it, and no mandatory substitution approval policy has yet been accepted. This slice therefore does not invent an approver or treat procurement capability as implicit approval evidence.

A later policy slice may add explicit approval semantics without rewriting already-committed substitution history.

## Cross-kind ReceiptItemIntent exclusivity

Ordinary and substitution receiving now share `receipt_item_intent_physical_materialization` as the unique physical-consumption registry.

Accepted ordinary materializations are backfilled into this registry. Future inserts into both ordinary and substitution bridges claim the same Household + ReceiptItemIntent key through a database-owned trigger.

Consequences:

- one ReceiptItemIntent may become physical truth exactly once;
- ordinary then substitution rematerialization is impossible;
- substitution then ordinary rematerialization is impossible;
- concurrent cross-kind attempts cannot both commit;
- cross-kind collision is normalized to provider-neutral `Conflict`, not raw uniqueness failure.

## Quantity and conversion semantics

The substitution allocation is expressed in the received physical unit from the intent.

When the PurchaseItem uses a different unit, pinned `MeasurementConversionEvidence` converts the substitution quantity only for PurchaseItem receiving-pool reconciliation.

ReceiptItem-side reconciliation remains exact identity when the allocation unit already equals the received unit; purchase-side conversion evidence is not reapplied against the ReceiptItem target.

## Placement and inventory

The slice preserves the ordinary materialization placement policy:

- current same-Household `LOCATION`; or
- current same-Household `COMPARTMENT` whose parent StorageLocation is current.

Each successful substitution creates a new StockItem. No automatic stock merge, Batch fabrication, UNPLACED receiving or split ingress is introduced.

The received Product is used consistently by ReceiptItem, StockItem, InventoryMovement and receipt inventory effect.

## Authority and least privilege

Execution requires current `HOUSEHOLD_PROCUREMENT_ADMINISTER` through the accepted procurement administration transaction.

`fridge_app` receives only narrow EXECUTE on `fridge_internal.materialize_substitution_receipt_item(...)`.

It receives no direct DML on:

- physical materialization registry;
- substitution materialization bridge;
- substitution command ledger;
- ReceiptItem;
- substitution allocation;
- StockItem;
- InventoryMovement;
- receipt inventory effect.

The physical-claim trigger helper and conservation helpers remain private.

## Idempotency

Shared BE-06 CommandId intent:

`MATERIALIZE_SUBSTITUTION_RECEIPT_ITEM`

Semantic equality binds:

- actor;
- ReceiptItemIntent;
- PurchaseItem;
- optional conversion evidence;
- canonical substitution reason;
- exact placement identity;
- canonical provenance.

Generated physical identities remain result-only. Committed replay returns the original five identities.

## Required executable proofs

Acceptance requires at minimum:

- different-Product substitution commits requested/received Product evidence correctly;
- physical StockItem/InventoryMovement/effect use the received Product;
- substitution consumes the same PurchaseItem pool as ordinary receiving;
- deterministic over-receipt conflict leaves zero candidate physical artifacts;
- same-Product input conflicts;
- same CommandId replay returns original identities;
- one ReceiptItemIntent cannot be rematerialized through the other physical path;
- cross-kind physical claim helper remains private;
- no automatic `purchase_receiving_exception` creation;
- no direct runtime physical DML;
- exact-HEAD PostgreSQL 17/18 DB-02 and BE-00 evidence;
- zero unresolved material findings and panoramic/adversarial CLEAN.

## Explicit non-goals

This slice does not implement:

- over-receipt acceptance/correction workflow;
- substitution approval policy;
- standalone Receipt-without-Purchase ingress;
- Batch/source-expiration capture;
- split ingress;
- UNPLACED receiving;
- merge into existing StockItem;
- generic inventory mutation;
- HTTP/read delivery;
- frontend/deployment.
