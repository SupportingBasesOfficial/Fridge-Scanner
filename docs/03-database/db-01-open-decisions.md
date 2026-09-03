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

Referentially significant business relationships use typed FKs/association relations. Generic stable target identity remains allowed only as evidentiary metadata such as AuditEvent target identity.

### O-002 — Quantity-lineage granularity — CLOSED

`inventory_quantity_lineage` is an exact conserved source-movement → destination-movement edge with Product/quantity; shelf-life evidence attaches to that edge. Product-transforming Preparation is excluded from same-Product lineage.

### O-003 — Count historical basis identity — CLOSED

Introduced immutable `inventory_ledger_basis`; each CountItem references exact historical cutoff/watermark/ordering context. Shared basis requires genuinely atomic/frozen authoritative snapshot.

### O-004 — Rule applicability to governed classification — CLOSED

Current ShelfLifeRule has Product XOR IngredientConcept targets. Future governed classification requires reviewed typed schema evolution; ProductCategory is not silently promoted to a universal taxonomy.

### O-005 — Global notification preferences — CLOSED / DEFERRED FEATURE

No global preference relation is required now. A future preference affects delivery only and cannot replace Household AlertRule/Alert authorization.

### O-006 — Receipt allocation and line-to-ledger provenance — CLOSED

Ordinary receiving uses `purchase_item_receipt_allocation`; substitutions are separate; `receipt_item_inventory_effect` links physical received portions to ledger effects. Source and receiving-pool conservation are independent.

### O-007 — Household timezone historical reproducibility — CLOSED

Introduced versioned `household_timezone_version` with non-ambiguous intervals and exact historical references when Household timezone participates.

### O-008 — HouseholdProductPolicy preferred-storage semantics — CLOSED

Preferred storage defaults use ranked typed `household_product_storage_preference`: same-Household StorageLocation XOR Compartment XOR governed StorageLocation kind. It is policy, not placement truth.

### O-009 — Alert subject/scope relational representation — CLOSED

Every Household AlertRule has typed primary `alert_rule_subject`; committed Alert retains typed `alert_trigger_subject`. Future subject kinds require reviewed typed extension.

### O-010 — ExternalReference canonical-target semantics — CLOSED

DB-00 defines ExternalReference as external import/reconciliation provenance, not a universal polymorphic canonical-target relation. DB-01 therefore removes any generic canonical target pointer. A canonical domain fact that must retain external provenance uses its own typed FK/provenance association (or a dedicated typed relation) with reviewed cardinality. Future import target classes are schema evolution, not metadata.

## C. Explicitly deferred to DB-02 — not DB-01 blockers

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

Already closed and must not be reopened for implementation convenience:

- StockItem as sole mutable quantity truth — no;
- Household roles globally on User — no;
- Batch mandatory for stock identity — no;
- private Products owning global GTIN-like keys — no;
- implicit ReceiptItem↔PurchaseItem allocation quantity — no;
- ReceiptItem materialization without explicit ledger-effect provenance — no;
- arbitrary count allocation — no;
- processing-time/current balance as count basis — no;
- one shared receipt/shopping allocation pool — no;
- current conversion/compatibility/timezone rules reinterpreting history — no;
- transfer represented only by changing current placement — no;
- vague many-to-many lineage for quantity inheritance — no;
- Product-transforming Preparation as ordinary same-Product lineage — no;
- Recipe edits reinterpreting committed Preparation — no;
- floating point/display rounding deciding conservation — no;
- provider identity implying Household authority — no;
- globally unscoped idempotency key — no;
- generic polymorphic IDs replacing enforceable business FKs — no;
- ProductCategory assumed as universal future shelf taxonomy — no;
- global notification preference granting Household authority — no;
- preferred storage defaults remaining opaque policy metadata — no;
- AlertRule/Alert subject identity deferred to generic DB-02 IDs — no;
- ExternalReference acting as a universal polymorphic canonical-target pointer — no.

## Exit criterion

DB-01 can be accepted only when the exact current HEAD has no unresolved material logical findings after panoramic review. A new finding reopens this register even when all previously known items are closed.

No section-C physical choice is required to close DB-01 unless review proves it actually changes logical semantics.
