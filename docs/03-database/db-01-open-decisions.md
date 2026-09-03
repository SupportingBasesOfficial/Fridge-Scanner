# FridgeScanner — DB-01 Open Decisions

## Status

This file distinguishes genuine logical-model blockers from physical implementation choices that must not reopen DB-01 unnecessarily.

After independent DB-01 red-team passes and closure against the accepted DB-00 contract, **there are currently no intentionally open logical-model decisions**.

This does not declare DB-01 review-complete. Further review may create new findings. It means the baseline is not knowingly carrying a material logical ambiguity forward.

No intentional DB-00 semantic ambiguity is accepted as an implementation shortcut.

## A. Current DB-01 logical blockers

**None known at this HEAD.**

Any new reviewer finding that can produce materially different relational models or weaken a DB-00 invariant reopens this section until corrected and reviewed on the new exact HEAD.

## B. Closed by DB-01 review

### O-001 — Polymorphic historical subject references — CLOSED

**Resolution:** referentially significant business relationships use typed FKs/association relations; unconstrained generic `entity_type/entity_id` cannot replace domain integrity. Generic stable target identity remains allowed only as evidentiary metadata such as AuditEvent target identity.

### O-002 — Quantity-lineage granularity — CLOSED

**Resolution:** `inventory_quantity_lineage` is an explicit conserved source-movement → destination-movement edge carrying optional endpoint StockItems, Product and exact quantity portion. `quantity_lineage_shelf_life_fact` attaches inherited expiration/lifecycle/rule evidence to that exact edge. Product-transforming Preparation is excluded from same-Product lineage.

### O-003 — Count historical basis identity — CLOSED

**Resolution:** introduced immutable `inventory_ledger_basis`. Every InventoryCountItem references the exact historical cutoff/watermark/ordering context used for reconciliation. One basis can be shared across lines only under a genuinely atomic/frozen snapshot or equivalent authoritative token.

### O-004 — Rule applicability to governed classification — CLOSED

**Resolution:** current DB-01 has concrete referential targets Product XOR IngredientConcept. DB-00's “another governed classification introduced later” is a future extension point, not permission for a generic/untyped classification target. ProductCategory is not silently promoted into a universal ShelfLifeRule taxonomy.

### O-005 — Global notification preferences — CLOSED / DEFERRED FEATURE

**Resolution:** no `user_notification_preference` relation is required for DB-01 acceptance. If introduced later, it is separate user-level preference data affecting delivery behavior only and cannot replace Household AlertRule/Alert authorization.

### O-006 — Receipt allocation and line-to-ledger provenance — CLOSED

**Resolution:** ordinary same-Product receiving uses `purchase_item_receipt_allocation`; substitution uses a separate allocation relation; `receipt_item_inventory_effect` links each physically received quantity portion to the InventoryMovement effect that materialized it. ReceiptItem source quantity and PurchaseItem receiving pool have independent conservation constraints.

### O-007 — Household timezone historical reproducibility — CLOSED

**Resolution:** introduced versioned `household_timezone_version` with non-ambiguous effective intervals. Historical expiration/source-rule evidence references the exact selected version when Household timezone semantics participate.

### O-008 — HouseholdProductPolicy preferred-storage semantics — CLOSED

**Resolution:** preferred storage defaults are no longer generic policy metadata. `household_product_storage_preference` is a ranked typed child targeting exactly one same-Household StorageLocation, same-Household Compartment or governed StorageLocation kind. The preference is explicitly not StockItem placement truth and cannot itself move stock.

### O-009 — Alert subject/scope relational representation — CLOSED

**Resolution:** every Household AlertRule has one typed primary `alert_rule_subject`; every committed Alert retains typed `alert_trigger_subject` evidence. Current subject kinds are Household, Product, StockItem, StorageLocation, Compartment and HouseholdProductPolicy. Future subject kinds require reviewed typed schema evolution.

## C. Explicitly deferred to DB-02 — not DB-01 blockers

The following choices must be made during physical-schema design and must conform to DB-01; they do not justify weakening or delaying the logical contracts:

- concrete primary-key type and UUID version;
- exact SQL encoding of rational numbers;
- exact SQL encoding/scale policy for money;
- PostgreSQL/domain/enum/check representation choices;
- partial/functional/exclusion index syntax;
- RLS implementation and policy syntax;
- whether composite foreign keys duplicate Household scope for direct database enforcement;
- CHECK versus trigger versus deferred constraint versus stored procedure for cross-row invariants;
- immutable-row protection mechanism;
- materialized current-balance implementation;
- EffectiveExpiration materialization strategy;
- partitioning of high-volume ledger/audit/outbox tables;
- JSON versus normalized child relations for truly opaque external-provider metadata;
- outbox payload encoding;
- migration framework and naming conventions;
- ORM mapping strategy.

## D. Rejected “open decisions”

These are already closed by DB-00/DB-01 and must not be reopened as implementation convenience:

- whether StockItem can be the sole mutable quantity truth — no;
- whether Household roles belong globally on User — no;
- whether Batch is mandatory for stock identity — no;
- whether private Products can own global GTIN-like keys — no;
- whether ReceiptItem↔PurchaseItem allocation quantity may remain implicit — no;
- whether ReceiptItem may materialize inventory without explicit ledger-effect provenance — no;
- whether ambiguous count discrepancies may be auto-allocated — no;
- whether reconciliation may use current/processing-time balance instead of a captured historical basis — no;
- whether receipt and shopping allocations share one pool — no;
- whether current conversion/compatibility/timezone rules may reinterpret committed history — no;
- whether InventoryTransfer can be represented only by changing current placement — no;
- whether vague many-to-many lineage is sufficient for quantity-portion inheritance — no;
- whether Product-transforming Preparation is ordinary same-Product quantity lineage — no;
- whether Recipe edits may reinterpret committed Preparation — no;
- whether exact conservation may rely on floating point/display rounding — no;
- whether provider identity can imply Household authority — no;
- whether an idempotency key is globally unique without scope/fingerprint — no;
- whether generic polymorphic IDs may replace enforceable business FKs — no;
- whether ProductCategory may be assumed to be the universal future classification taxonomy — no;
- whether optional global notification preferences grant or imply Household authority — no;
- whether preferred storage defaults may remain opaque policy metadata — no;
- whether AlertRule scope or Alert trigger subject may be deferred to generic DB-02 IDs — no.

## Exit criterion

DB-01 can be accepted only when the exact current HEAD has no unresolved material logical findings after panoramic review. A new finding reopens this register even when all previously known items are closed.

No section-C physical choice is required to close DB-01 unless review proves it actually changes logical semantics.
