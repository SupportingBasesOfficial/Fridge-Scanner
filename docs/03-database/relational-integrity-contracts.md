# FridgeScanner — Relational Integrity Contracts

## Purpose

This document translates DB-00 invariants into minimum logical database integrity requirements. DB-02 may choose checks, composite keys, deferred constraints, triggers, procedures or other database mechanisms, but it must enforce equivalent semantics atomically under concurrency.

## 1. Scope, ownership and temporal context

### C-001 — Household parent/child equality

Whenever child and parent both carry Household scope, their `household_id` values are equal. Application filtering is not a substitute for relational tenant integrity.

### C-002 — Catalog scope XOR

Product, IngredientConcept, Recipe, ShelfLifeRule and scoped compatibility mapping obey:

- GLOBAL => owner Household absent;
- HOUSEHOLD => exactly one owner Household.

### C-003 — Cross-scope catalog references

GLOBAL consumers reference only globally visible catalog entities where DB-00 requires global visibility. Household consumers may reference GLOBAL or same-Household entities, never another Household's private data.

### C-004 — Stock Product visibility

StockItem references GLOBAL Product or Product owned by the same Household only.

### C-005 — Provider identity is not Household authority

Integration/provider/account/destination identifiers never replace explicit Household scope for Household-affecting facts.

### C-006 — Household timezone intervals

HouseholdTimezoneVersion effective intervals cannot overlap ambiguously for one Household. Historical facts that used Household timezone semantics retain the exact selected version.

## 2. Placement

### C-007 — StockItem placement XOR

Exactly one current placement mode exists: direct StorageLocation, Compartment, or explicit governed unplaced state.

### C-008 — Placement Household equality

Compartment and parent StorageLocation share Household; StockItem placement resolves to StockItem Household.

### C-009 — Historical placement immutability

Placement-sensitive movement/transfer effects retain occurrence-time placement snapshots. Current StockItem placement cannot rewrite history.

## 3. Product and identifiers

### C-010 — Batch Product agreement

If StockItem references Batch, both reference the same Product.

### C-011 — Global identifier restriction

Globally namespaced canonical ProductIdentifier references only GLOBAL Product.

### C-012 — Identifier uniqueness domain

Canonical ProductIdentifier uniqueness is governed by `(scheme, issuer_or_namespace, normalization_rule_version, normalized_value)`, omitting issuer only for a scheme that defines one global namespace.

### C-013 — Staged claims do not reserve canonical keys

StagedIdentifierClaim never participates in canonical global identifier uniqueness until governed resolution/promotion.

### C-014 — Normalization history is non-destructive

Normalization-rule changes create governed new versions/candidates; historical source/normalized values are not mutated in place.

## 4. Exact quantities, movements and money

### C-015 — Exact rational authority

Conserved/reconciled quantities and operative conversion factors use lossless rational semantics. Binary floating point, display rounding or implementation-specific scale cannot decide equality.

### C-016 — Quantity requires MeasurementUnit

Every measurable PurchaseItem, ReceiptItem, InventoryMovement, InventoryCountItem, PreparationInput, PreparationOutput, ShoppingListItem, Waste effect allocation and measurable HouseholdProductPolicy threshold carries/resolves a MeasurementUnit.

### C-017 — Conversion evidence

A committed contextual/package/cross-dimension conversion affecting conservation/reconciliation retains immutable MeasurementConversionEvidence.

### C-018 — Movement StockItem agreement

When InventoryMovement references StockItem, Household and Product match that StockItem.

### C-019 — Movement sign semantics

Committed InventoryMovement is non-zero and its sign agrees with movement kind. A non-quantity event belongs in another relation, not a zero-quantity ledger row.

### C-020 — Money role and currency

PurchaseMoneyFact and PurchaseItemMoneyFact carry explicit semantic role, exact amount and currency. Numerically equal values in different roles/currencies are not interchangeable.

### C-021 — Pricing-basis reconciliation

When PurchaseItem basis/unit price exists, authoritative line gross reconciles to exact purchased quantity/basis under preserved conversion and currency rounding policy or an explicit pricing discrepancy remains recorded.

## 5. Receiving

### C-022 — Receipt parent Purchase consistency

If Receipt identifies a Purchase, every receiving/substitution allocation under that Receipt targets a PurchaseItem of that Purchase.

### C-023 — Ordinary receiving Product equality

PurchaseItemReceiptAllocation requires PurchaseItem Product = ReceiptItem Product.

### C-024 — Substitution is explicit

Different-Product receiving consumes PurchaseItem allowance only through PurchaseItemSubstitutionAllocation. Requested Product = PurchaseItem Product and received Product = ReceiptItem Product.

### C-025 — ReceiptItem source allocation conservation

For one ReceiptItem, ordinary + substitution allocations cannot exceed physically received quantity. Unallocated remainder may remain ad-hoc/unattributed, but cannot be double-attributed.

### C-026 — PurchaseItem receiving pool conservation

For one PurchaseItem, ordinary + substitution allocations cannot exceed purchased quantity as normal fulfillment. Excess is explicit receiving exception state.

### C-027 — ReceiptItem ledger materialization

Every ReceiptItemInventoryEffect:

- belongs to same Household/Product as ReceiptItem;
- points to a positive inventory-entry InventoryMovement;
- has a quantity portion exactly reconciling to that movement after governed conversion.

Across all effects, portions sum exactly to ReceiptItem quantity.

### C-028 — Receipt entry movement single semantic ownership

An InventoryMovement used as ReceiptItem inventory-entry effect cannot simultaneously materialize another ReceiptItem.

### C-029 — Receiving vs shopping pools

Physical receiving/substitution and ShoppingListFulfillment are separate allocation dimensions. A purchased unit may participate once in each dimension; double-counting inside either pool is forbidden.

## 6. Inventory ledger, transfer and lineage

### C-030 — InventoryMovement immutability

Committed movement meaning, Product, quantity, occurrence/causal-order evidence and historical placement/provenance are append-only/correct-by-compensation.

### C-031 — Ledger authority

Current StockItem balance, if materialized, reconciles to InventoryMovement and is never independent authoritative quantity truth.

### C-032 — Transfer pair completeness

Each committed InventoryTransfer has exactly one source-decrement and one destination-increment movement through one InventoryTransferEffect; those movements fill that transfer role at most once.

### C-033 — Transfer conservation

Transfer effects share Household/Product, preserve source/destination placement snapshots, have correct signs and conserve exactly transferred quantity.

### C-034 — Lineage Product identity

Same-Product InventoryQuantityLineage edges share Product across source/destination endpoints and cannot silently transform Product identity.

### C-035 — Source-side lineage closure

For a movement/effect declared as a same-Product lineage-redistribution source, outgoing lineage edges for that operation sum **exactly** to the redistributed source quantity. A disappeared remainder is invalid; real consumption, waste or transformation is represented by its own explicit effect/domain operation.

### C-036 — Destination-side lineage closure

For every destination effect declared lineage-derived, incoming lineage edges sum exactly to destination quantity.

### C-037 — Preparation is not ordinary same-Product lineage

Product-transforming Preparation uses explicit Preparation input/output conservation; it cannot be represented as a same-Product InventoryQuantityLineage shortcut.

### C-038 — Shelf-life lineage propagation

All applicable SourceExpirationFact, FoodLifecycleEvent and ShelfLifeRuleActivation evidence for a conserved source portion propagates to destination portion through QuantityLineageShelfLifeFact.

## 7. Waste and disposal

### C-039 — Waste semantic/ledger separation

WasteRecord stores reason/classification/provenance. Authoritative stock reduction remains InventoryMovement.

### C-040 — Waste movement integrity

Every WasteRecordMovement:

- shares Household with WasteRecord;
- points to a stock-reducing waste/disposal InventoryMovement;
- carries a quantity portion exactly reconciling to that movement after governed conversion.

### C-041 — Waste movement single semantic ownership

One waste/disposal InventoryMovement cannot be reused as the quantity effect of unrelated WasteRecords.

## 8. Inventory count and reconciliation

### C-042 — Historical basis is first-class

Each InventoryCountItem references immutable InventoryLedgerBasis. Processing-time/current balance cannot substitute for captured cutoff/watermark/ordering context.

### C-043 — Per-line observation basis

Non-atomic count sessions preserve observation time and basis per line. One basis may be shared only when a genuinely atomic/frozen snapshot or equivalent authoritative token applies to all lines.

### C-044 — Count subject identity

InventoryCountItem identifies Product, exact observed quantity/unit and placement when relevant; existing StockItem link is optional for newly discovered stock.

### C-045 — Ambiguous holding allocation

Aggregate discrepancy across state-distinct StockItems cannot be allocated arbitrarily. It remains unresolved/staged unless deterministic evidence permits InventoryCountAllocation.

### C-046 — Late-event ordering

Reconciliation classifies movements by authoritative domain occurrence/causal order, not recording time.

### C-047 — Equal-time ambiguity

Equal timestamps alone are not causal proof. Ordering requires trustworthy discriminator from the same ordering domain; otherwise case remains ambiguous.

### C-048 — Reconciliation adjustment provenance and uniqueness

Any count adjustment references exact InventoryCountItem, InventoryLedgerBasis and InventoryReconciliationOutcome. One adjustment InventoryMovement cannot serve unrelated reconciliation outcomes.

### C-049 — Late pre-observation correction

A later-recorded but proven pre-observation movement rebases/invalidates historical basis. Already committed history is corrected only through explicit compensating/reconciliation outcome when deterministic; otherwise block/escalate.

## 9. Recipes and preparation

### C-050 — RecipeVersion immutability

Recipe-based Preparation references immutable RecipeVersion/snapshot; later Recipe edits cannot reinterpret history.

### C-051 — Recipe catalog visibility

GLOBAL RecipeVersion references only GLOBAL catalog data. Household RecipeVersion may reference GLOBAL or same-Household data. Preparation executes only GLOBAL or same-Household version.

### C-052 — PreparationInput movement conservation

Each PreparationInputMovement:

- points to one decrement movement in same Household/Product/source lineage;
- carries a quantity portion exactly reconciling to that movement;
- uses an InventoryMovement unique within this semantic materialization role.

All linked portions sum exactly to PreparationInput quantity.

### C-053 — Preparation input source-side accounting

For recipe-based input: `sum(recipe allocations) + sum(explicit source deviations) = committed input quantity`. No unclassified remainder.

### C-054 — Recipe-line target accounting

Allocations into each RecipeIngredient reconcile to preserved scaled requirement. Allowed under/over/tolerance/substitution is explicit governed deviation.

### C-055 — Compatibility evidence

Concept-based PreparationInputAllocation retains immutable CompatibilityDecisionEvidence.

### C-056 — PreparationOutput movement conservation

Each PreparationOutputMovement:

- points to one increment movement in same Household/Product;
- carries a quantity portion exactly reconciling to that movement;
- uses an InventoryMovement unique within this semantic materialization role.

All linked portions sum exactly to PreparationOutput quantity.

## 10. Shelf life

### C-057 — Rule scope visibility

GLOBAL ShelfLifeRule references only global catalog targets. Household ShelfLifeRule references GLOBAL or same-Household targets and applies only inside its Household.

### C-058 — Current DB-01 applicability target is typed

Current DB-01 ShelfLifeRule target is Product XOR IngredientConcept. A future governed classification is invalid until a reviewed typed classification relation/version/reference contract is added. Generic classification IDs are forbidden.

### C-059 — Stable activation evidence

ShelfLifeRuleActivation preserves exact rule version, authoritative activation anchor, exact HouseholdTimezoneVersion when applicable, more-specific source temporal context and concept CompatibilityDecisionEvidence when applicable.

### C-060 — Group-local precedence

Precedence applies only inside the same semantic trigger/deadline group; independent groups may each contribute candidates.

### C-061 — Deterministic temporal arithmetic

Relative rules preserve amount/unit, elapsed-vs-calendar basis, endpoint, timezone/version and accepted DB-00 DST/month-end semantics. Library defaults cannot decide domain meaning.

### C-062 — EffectiveExpiration candidate XOR

Each EffectiveExpirationCandidate references exactly one SourceExpirationFact XOR ShelfLifeRuleActivation and must be applicable to same Household/StockItem lineage history.

### C-063 — EffectiveExpiration reproducibility

EffectiveExpiration is derived/materializable and reproducible from authoritative facts plus preserved rule/compatibility/timezone evidence.

## 11. Shopping

### C-064 — Shopping subject XOR

Resolved ShoppingListItem targets Product XOR IngredientConcept. Free text is provenance only.

### C-065 — Product-target fulfillment

Product-targeted ShoppingListItem is fulfilled only by exact Product PurchaseItem.

### C-066 — Concept-target fulfillment

IngredientConcept-targeted ShoppingListItem requires immutable CompatibilityDecisionEvidence for purchased Product.

### C-067 — Shopping pool conservation

ShoppingListFulfillment allocations from one PurchaseItem cannot exceed purchased quantity within the shopping-intent pool after exact conversion.

## 12. Alerts, integrations and imports

### C-068 — Alert ownership chain

Household AlertRule, Alert and NotificationDelivery share Household; Alert preserves originating rule/trigger and delivery preserves one Alert/recipient attempt.

### C-069 — Typed operational subjects

Referentially significant operational target links use typed FKs/associations. Generic type/id pairs cannot replace domain referential integrity.

### C-070 — Global notification preference boundary

A future user-global preference may influence delivery behavior only. It cannot grant Household authority and is not required by current DB-01.

### C-071 — Import Household binding

Every inventory-affecting ImportRun has exactly one target Household; ExternalReference and produced operational facts remain within that boundary.

### C-072 — External reference namespace

ExternalReference resolution/uniqueness is scoped by provider/integration namespace, type/value and Household when operationally Household-scoped.

### C-073 — Secret separation

Integration secrets are secure references, not arbitrary domain JSON secret payloads.

## 13. Idempotency, audit and outbox

### C-074 — Scoped idempotency identity

Idempotency uniqueness includes target scope/Household identity when applicable, principal, operation/command and client key. Client key alone is never cross-tenant identity.

### C-075 — Idempotency fingerprint conflict

Same scoped identity with different semantic request fingerprint, target or command version is conflict, never overwrite/re-execution.

### C-076 — Authorization before idempotent replay

Current authorization is re-established before stored idempotent result is disclosed.

### C-077 — Mutation/outbox atomicity

Required OutboxRecord commits in the same durable database transaction as authoritative business mutation; external publication follows that boundary.

### C-078 — Audit is not ledger

AuditEvent cannot substitute for InventoryMovement or domain history. Generic audit target identity is evidentiary metadata only.

## 14. Transaction-boundary contracts

One atomic logical database transaction or equivalent serializable single-winner contract is required for at least:

- ReceiptItem materialization with ReceiptItemInventoryEffect and entry movements;
- ordinary/substitution receiving allocations against both ReceiptItem source and PurchaseItem receiving pools;
- InventoryTransfer paired effects and required lineage;
- same-Product redistribution lineage closure;
- WasteRecord plus committed waste movements when created as one operation;
- InventoryCount adjustment/reconciliation against captured InventoryLedgerBasis;
- Preparation inputs/outputs, movement links, allocations/deviations and conservation;
- ShoppingListFulfillment allocation;
- Idempotency winner creation/observation;
- business mutation + OutboxRecord.

Check-then-write application sequences that allow concurrent over-allocation, duplicate movement reuse, idempotent duplication or Household mismatch are non-compliant.

## 15. Delete/update semantics

DB-02 explicitly chooses physical delete behavior under these logical defaults:

- authoritative/history-bearing facts: ordinary deletion restricted or identity tombstoned;
- transient uncommitted staging: governed cascade may be allowed;
- catalog/rule/evidence/timezone records referenced by history: retire/version/tombstone, not destructive deletion;
- Household deletion: explicit retention/lifecycle workflow, never uncontrolled cascade through ledger/audit/history.

## 16. Gate rule

A physical schema is DB-01 compliant only if these contracts remain enforceable under concurrency, retries, delayed/offline facts, historical rule/timezone changes and DB-00 reconciliation edge cases. Existence of similarly named tables alone is insufficient.
