# FridgeScanner — DB-01 Open Decisions

## Status

This file distinguishes genuine logical-model blockers from physical implementation choices that must not reopen DB-01 unnecessarily.

The first independent DB-01 red-team pass closed the initial structural ambiguities around receiving allocation, line-to-ledger provenance, Household timezone history, quantity-lineage granularity, count historical basis and referentially significant polymorphism. Those closures are recorded below.

No intentional DB-00 semantic ambiguity is accepted as an implementation shortcut.

## A. Remaining DB-01 review targets

### O-004 — Rule applicability to governed classification

ShelfLifeRule may target Product, IngredientConcept or a governed classification.

**Review question:** is ProductCategory sufficient as the only classification target in DB-01, or does the domain require a separate versioned classification taxonomy relation before physical schema?

**Default direction:** do not generalize prematurely. Introduce a new classification relation only if accepted DB-00 behavior cannot be represented by ProductCategory plus existing governed catalog semantics.

**Status:** OPEN — must be closed or explicitly proven non-blocking before DB-01 acceptance.

### O-005 — Global notification preferences

DB-00 permits genuinely user-global notification preferences that do not grant Household authority.

**Review question:** should DB-01 include a separate `user_notification_preference` relation now, or leave it outside the first database slice until notification behavior is specified further?

**Constraint regardless of answer:** preferences never substitute for Household AlertRule/Alert authorization.

**Status:** OPEN but likely non-core; review must decide whether omission changes the accepted durable logical model.

## B. Closed by the first DB-01 red-team pass

### O-001 — Polymorphic historical subject references — CLOSED

**Resolution:** referentially significant business relationships must use typed FKs/association relations; an unconstrained generic `entity_type/entity_id` pair cannot replace domain integrity. Generic stable target identity remains allowed only as evidentiary metadata such as AuditEvent target identity.

### O-002 — Quantity-lineage granularity — CLOSED

**Resolution:** `inventory_quantity_lineage` is an explicit conserved source-movement → destination-movement edge carrying optional endpoint StockItems, Product and exact quantity portion. `quantity_lineage_shelf_life_fact` attaches inherited expiration/lifecycle/rule evidence to that exact edge.

Product-transforming Preparation is explicitly excluded from same-Product lineage and uses its own input/output conservation boundary.

### O-003 — Count historical basis identity — CLOSED

**Resolution:** introduced immutable `inventory_ledger_basis`. Every InventoryCountItem references the exact historical cutoff/watermark/ordering context used for reconciliation. One basis can be shared across lines only under a genuinely atomic/frozen snapshot or equivalent authoritative token.

### O-006 — Receipt allocation and line-to-ledger provenance — CLOSED

**Resolution:** ReceiptItem no longer contains an implicit nullable PurchaseItem allocation. Ordinary same-Product receiving uses `purchase_item_receipt_allocation`; substitution uses a separate allocation relation; `receipt_item_inventory_effect` explicitly links each physically received quantity portion to the InventoryMovement effect that materialized it.

Both the ReceiptItem source quantity and PurchaseItem receiving pool now have independent conservation constraints.

### O-007 — Household timezone historical reproducibility — CLOSED

**Resolution:** introduced versioned `household_timezone_version` with non-ambiguous effective intervals. Historical expiration/source-rule evidence references the exact selected version when Household timezone semantics participate, preventing later configuration changes from reinterpreting history.

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
- whether generic polymorphic IDs may replace enforceable business FKs — no.

## Exit criterion

Before DB-01 can be accepted, every item in section A must either:

1. be proven adequately represented by the existing model; or
2. produce a concrete logical-model correction and corresponding decision update.

No section-C physical choice is required to close DB-01 unless review proves it actually changes logical semantics.
