# FridgeScanner — DB-01 Independent Review Findings

## Purpose

This is a traceability log for independent DB-01 review findings discovered after the initial logical-model baseline. A finding is not considered closed merely because prose changed; the related logical model, integrity contract and decision/open-decision boundary must remain mutually consistent.

## Review baseline

Initial DB-01 HEAD: `73ce561c3e212a0083bc32a89f86054fd4763ce4`.

Codex code-review quota was exhausted, so these are independent repository/semantic review findings rather than Codex findings.

## Pass 1

### F-001 — Receipt-to-Purchase allocation quantity was implicit

**Severity:** material logical ambiguity.

Initial `receipt_item.purchase_item_id` could identify one PurchaseItem but did not represent a partial allocation quantity or cleanly support one physical ReceiptItem being attributable across multiple compatible purchase lines.

**Resolution:** introduced `purchase_item_receipt_allocation` carrying exact quantity/unit; substitutions remain a distinct explicit allocation relation. Both ReceiptItem source quantity and PurchaseItem receiving availability now have independent conservation rules.

**Status:** CLOSED.

### F-002 — ReceiptItem had no explicit relational ledger-effect link

**Severity:** material provenance/conservation gap.

The baseline said ReceiptItem links to InventoryMovement effects but did not define the actual relation/cardinality needed to enforce this.

**Resolution:** introduced `receipt_item_inventory_effect`, one semantic-use constraint for each linked movement, effect-level quantity reconciliation and exact total conservation to ReceiptItem quantity.

**Status:** CLOSED.

### F-003 — Household timezone history lacked a durable logical relation

**Severity:** historical reproducibility gap.

DB-00 requires exact governed Household timezone version selected at a preserved domain anchor, but the baseline had only a current Household timezone/configuration reference.

**Resolution:** introduced immutable/versioned `household_timezone_version` with non-ambiguous effective intervals and historical references from expiration/rule evidence where Household timezone participates.

**Status:** CLOSED.

### F-004 — Quantity lineage was too vague for portion-level inheritance

**Severity:** material lineage ambiguity.

A generic source/destination lineage relationship did not guarantee that shelf-life/provenance inheritance could be tied to an exact conserved portion.

**Resolution:** `inventory_quantity_lineage` is now one exact source-movement → destination-movement conserved edge with Product, optional endpoint StockItems and exact rational quantity. `quantity_lineage_shelf_life_fact` attaches inherited evidence to that exact edge.

**Status:** CLOSED.

### F-005 — Inventory count historical basis had no first-class identity

**Severity:** reconciliation reproducibility gap.

Observation/cutoff prose alone could permit processing-time/current balance or implementation-specific snapshot meaning to leak into reconciliation.

**Resolution:** introduced immutable `inventory_ledger_basis`, referenced by every InventoryCountItem and ReconciliationOutcome. Shared session basis is allowed only for genuinely atomic/frozen authoritative snapshots.

**Status:** CLOSED.

### F-006 — Referentially significant polymorphism could become unenforceable generic IDs

**Severity:** integrity risk.

Several subject references were described semantically but could have been physically implemented as unconstrained `entity_type/entity_id` pairs.

**Resolution:** typed FK/association relations are now mandatory wherever business referential integrity matters. Generic target identity remains allowed only as evidentiary metadata such as AuditEvent targets.

**Status:** CLOSED.

## Pass 2

### F-007 — WasteRecord from DB-00 had no durable DB-01 home

**Severity:** DB-00 coverage gap.

The initial DB-01 relation inventory omitted the accepted WasteRecord concept, so a physical schema could have reduced waste/disposal semantics to a generic movement and lost reason/classification provenance.

**Resolution:** introduced `waste_record` plus `waste_record_movement`. Waste semantics remain separate from authoritative stock quantity; linked stock-reducing InventoryMovement remains quantity truth and cannot be reused across unrelated WasteRecords.

**Status:** CLOSED.

### F-008 — Source-side same-Product lineage permitted an unaccounted remainder

**Severity:** conservation gap.

The hardened baseline initially required outgoing lineage to be no greater than the source quantity. For a movement declared as a redistribution source, this still allowed quantity to disappear from lineage without an explicit consumption/waste/transformation effect.

**Resolution:** outgoing lineage edges for a declared same-Product redistribution operation now sum exactly to the redistributed source quantity. Genuine terminal consumption, waste or Product transformation is represented by its own explicit domain effect rather than missing lineage.

**Status:** CLOSED.

### F-009 — Preparation movement effects could be reused across multiple inputs/outputs

**Severity:** double-accounting risk.

Without semantic-role uniqueness on PreparationInputMovement/PreparationOutputMovement, one InventoryMovement could theoretically satisfy multiple inputs or materialize multiple outputs while each local relation looked valid.

**Resolution:** each linked InventoryMovement is unique within the respective preparation materialization role; each relation portion reconciles to its movement effect, and aggregate portions reconcile exactly to the PreparationInput/PreparationOutput quantity.

**Status:** CLOSED.

### F-010 — Future ShelfLifeRule classification extension was too generic

**Severity:** forward-schema ambiguity.

DB-00 permits “another governed classification introduced later,” but that does not authorize an untyped generic classification reference in the current logical model.

**Resolution:** current DB-01 applicability is Product XOR IngredientConcept. A future classification target is valid only after a reviewed typed governed classification/version/reference contract is added. ProductCategory is not implicitly promoted into a universal shelf-life taxonomy.

**Status:** CLOSED.

### F-011 — Optional global notification preference could be mistaken for a missing required table

**Severity:** scope ambiguity, low but architectural.

DB-00 says a user-global preference *may* exist but only without granting Household authority.

**Resolution:** DB-01 explicitly treats it as an optional future user-level feature, not a current acceptance requirement. Household AlertRule/Alert ownership remains mandatory and independent.

**Status:** CLOSED.

## Current review state

All findings recorded above are closed on the branch. This file does **not** itself declare the current HEAD CLEAN; the next step is a panoramic cross-document/delta review on the exact latest HEAD. Any new material finding reopens DB-01 and requires a new exact-HEAD gate.
