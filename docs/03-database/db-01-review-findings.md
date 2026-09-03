# FridgeScanner — DB-01 Independent Review Findings

## Purpose

This is a traceability log for independent DB-01 review findings discovered after the initial logical-model baseline. A finding is not considered closed merely because prose changed; the related logical model, integrity contract and decision/open-decision boundary must remain mutually consistent.

## Review baseline

Initial DB-01 HEAD: `73ce561c3e212a0083bc32a89f86054fd4763ce4`.

Codex code-review quota was exhausted, so these are independent repository/semantic review findings rather than Codex findings.

## Pass 1

### F-001 — Receipt-to-Purchase allocation quantity was implicit
**Severity:** material logical ambiguity.  
**Resolution:** introduced `purchase_item_receipt_allocation` carrying exact quantity/unit; substitutions remain distinct. ReceiptItem source quantity and PurchaseItem receiving availability now conserve independently.  
**Status:** CLOSED.

### F-002 — ReceiptItem had no explicit relational ledger-effect link
**Severity:** material provenance/conservation gap.  
**Resolution:** introduced `receipt_item_inventory_effect`, semantic-use uniqueness, effect-level reconciliation and exact total conservation to ReceiptItem quantity.  
**Status:** CLOSED.

### F-003 — Household timezone history lacked a durable logical relation
**Severity:** historical reproducibility gap.  
**Resolution:** introduced immutable/versioned `household_timezone_version` with non-ambiguous effective intervals and exact historical references.  
**Status:** CLOSED.

### F-004 — Quantity lineage was too vague for portion-level inheritance
**Severity:** material lineage ambiguity.  
**Resolution:** `inventory_quantity_lineage` is now one exact source-movement → destination-movement conserved edge; inherited shelf-life evidence attaches to that exact edge.  
**Status:** CLOSED.

### F-005 — Inventory count historical basis had no first-class identity
**Severity:** reconciliation reproducibility gap.  
**Resolution:** introduced immutable `inventory_ledger_basis`, referenced by every InventoryCountItem and ReconciliationOutcome.  
**Status:** CLOSED.

### F-006 — Referentially significant polymorphism could become unenforceable generic IDs
**Severity:** integrity risk.  
**Resolution:** typed FK/association relations are mandatory wherever business referential integrity matters; generic target identity remains allowed only as evidentiary metadata such as AuditEvent targets.  
**Status:** CLOSED.

## Pass 2

### F-007 — WasteRecord from DB-00 had no durable DB-01 home
**Severity:** DB-00 coverage gap.  
**Resolution:** introduced `waste_record` plus `waste_record_movement`; waste semantics remain separate from authoritative stock quantity.  
**Status:** CLOSED.

### F-008 — Source-side same-Product lineage permitted an unaccounted remainder
**Severity:** conservation gap.  
**Resolution:** outgoing lineage edges for a declared same-Product redistribution operation now sum exactly to redistributed source quantity; genuine terminal effects are explicit.  
**Status:** CLOSED.

### F-009 — Preparation movement effects could be reused across multiple inputs/outputs
**Severity:** double-accounting risk.  
**Resolution:** each linked InventoryMovement is unique within the respective preparation materialization role and all parts reconcile exactly.  
**Status:** CLOSED.

### F-010 — Future ShelfLifeRule classification extension was too generic
**Severity:** forward-schema ambiguity.  
**Resolution:** current applicability is Product XOR IngredientConcept; future classifications require reviewed typed schema evolution.  
**Status:** CLOSED.

### F-011 — Optional global notification preference could be mistaken for a missing required table
**Severity:** scope ambiguity, low but architectural.  
**Resolution:** explicitly deferred as optional future user-level data that cannot grant Household authority.  
**Status:** CLOSED.

## Pass 3

### F-012 — Preferred storage defaults were hidden in generic HouseholdProductPolicy metadata
**Severity:** material relational ambiguity.  
**Resolution:** introduced `household_product_storage_preference` as a ranked typed policy child targeting exactly one same-Household StorageLocation, same-Household Compartment or governed StorageLocation kind; it is not placement truth.  
**Status:** CLOSED.

### F-013 — AlertRule subject typing was deferred to DB-02
**Severity:** material logical/reference ambiguity.  
**Resolution:** introduced `alert_rule_subject` and immutable `alert_trigger_subject` with current governed typed subject kinds; future kinds require reviewed typed extension.  
**Status:** CLOSED.

## Pass 4

### F-014 — ExternalReference implied a generic canonical-target relationship not defined by DB-00

**Severity:** material forward-model ambiguity.

The DB-01 draft said an ExternalReference could have a “typed canonical target where resolved,” then deferred the actual association contract. DB-00 requires ExternalReference to preserve external import/reconciliation provenance and Household scope, but does not define one universal polymorphic relationship from every external reference to every canonical entity. Leaving that phrase would invite incompatible DB-02 `target_type/target_id` implementations.

**Resolution:** ExternalReference is now explicitly provider-side identity/provenance only, namespaced by Integration/provider/type/value and Household where operationally scoped. It carries no universal canonical target pointer. When a concrete canonical domain fact needs durable external provenance, that domain fact or a dedicated typed provenance relation defines the association/cardinality through reviewed schema evolution. Generic polymorphic canonical target IDs are forbidden.

**Status:** CLOSED.

## Current review state

All findings F-001 through F-014 recorded above are closed on the branch. This file does **not** itself declare the current HEAD CLEAN; after these changes the exact HEAD must be revalidated through the panoramic repository/semantic gate. Any new material finding reopens DB-01 and requires a new exact-HEAD gate.
