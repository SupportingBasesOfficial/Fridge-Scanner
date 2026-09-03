# FridgeScanner — Legacy Design Assessment

## Purpose

Earlier FridgeScanner notes are valuable design inputs, but they are not canonical implementation contracts. This document records which concepts survive DB-00, which need redesign, and which are deferred.

## Accepted concepts

The following concepts remain part of the target domain:

- multi-user and multi-household operation;
- household membership with household-scoped permissions;
- storage locations and physical compartments;
- product catalog;
- purchases and purchase items;
- food consumption, transfer and disposal semantics;
- recipes;
- dynamic shelf-life behavior;
- configurable alerts and reports;
- auditability;
- external integrations;
- dynamic visualization of storage topology.

## Accepted but redesigned

### User / roles
Earlier: `Usuario.perfil` plus `Usuario_Casa.permissao`.

DB-00: household authority belongs to HouseholdMembership. A platform-level role, if ever needed, is a separate concern.

### Product
Earlier: category/manufacturer/value were scalar attributes.

DB-00: Product is the canonical stockable food identity and is not synonymous with a retail SKU. It may represent commercial, loose, household-defined or prepared food. Price is transaction-specific monetary data with explicit currency; category, namespaced identifiers and measurement semantics are explicit domain concepts; brand/manufacturer must not be accidentally conflated.

### Batch / lot
Earlier: `Lote` combined product batch, compartment, quantity, package state and expiration.

DB-00: Batch and StockItem are distinct concepts. Physical location and mutable lifecycle state belong to inventory holdings, not manufacturing batch identity. Batch is optional provenance and must not be fabricated merely to provide Product identity or retain a printed expiration.

### Stock quantity
Earlier: `quantidade_atual` was directly mutated by triggers/actions.

DB-00: durable InventoryMovement semantics are authoritative; current balance may be a projection/cache but must be reconcilable. InventoryMovement preserves domain occurrence time separately from recording/commit time where delayed/offline capture is possible.

### Consumption / movement / disposal
Earlier: separate operational tables each mutated the current quantity.

DB-00: their stock effect is unified under InventoryMovement semantics while domain-specific detail may remain in dedicated records. Conserved redistribution operations must preserve Product identity and quantity.

### Purchase / receiving
Earlier: a Purchase record could imply that goods entered stock.

DB-00: Purchase and Receipt are separate concepts. ReceiptItem carries received Product/quantity/unit, optional same-Product PurchaseItem provenance and authoritative inventory-entry linkage with quantity conservation. Substitution and over-receipt are explicit governed exceptions rather than silent ordinary fulfillment.

### Recipe ingredients
Earlier: RecipeIngredient referenced a concrete Batch.

DB-00: RecipeIngredient targets IngredientConcept, which expresses the semantic food requirement independently of commercial SKU or physical stock. Concrete StockItems are selected only during Preparation.

### Preparation execution
Earlier: recipe definition and execution/stock effects were not cleanly separated.

DB-00: PreparationInput and PreparationOutput carry measurable quantities and link to authoritative InventoryMovement effects, preserving exact lineage and conservation across stock changes. For recipe-based execution, PreparationInputAllocation maps measurable input quantity to the exact RecipeIngredient line it fulfills, preserving repeated-line identity, compatibility constraints and partial/multiple-source fulfillment.

### Dynamic expiration
Earlier: absolute and relative expiration were represented as dates and Recipe contained a dynamic-expiration date.

DB-00: SourceExpirationFact, ShelfLifeRule, lifecycle/storage facts and EffectiveExpiration are separate concepts. Source expiration may exist independently of Batch; rule version selection, activation-time anchors, candidate combination and date-only comparison are deterministic and provenance-preserving.

### Inventory count
Earlier: reconciliation semantics were not sufficient for delayed/offline observation or ambiguous allocation.

DB-00: each non-atomic InventoryCountItem preserves its own physical observation time and ledger as-of/cutoff; a shared session cutoff is allowed only for a genuinely atomic/frozen snapshot. Reconciliation classifies late-recorded movements by domain occurrence time: pre-observation facts rebase/invalidate the historical reconciliation basis, while genuinely post-observation movements are preserved. Already committed adjustments are corrected through explicit compensating/reconciliation outcomes rather than history mutation. Ambiguous discrepancies remain staged/blocked rather than being arbitrarily allocated across state-distinct StockItems.

### Shopping / replenishment
Earlier: shopping intent and purchase fulfillment were underspecified.

DB-00: HouseholdProductPolicy thresholds have measurement semantics; ShoppingListItem has a canonical Product-or-IngredientConcept subject and measurable requested amount; ShoppingListFulfillment explicitly allocates compatible PurchaseItem quantities without double counting.

### Household configuration JSON
Earlier: physical storage structure and active integrations could be duplicated inside JSON configuration.

DB-00: canonical structure remains relational. JSON may be used only for non-authoritative extensible metadata where justified.

### Automated expiration job
Earlier: expired lots could be moved automatically to disposal.

DB-00: expiration may be detected and alerted automatically, but disposal is a physical action and is not fabricated by time passage alone.

### Scanner / vision / imports
Earlier: identification/integration outputs could be treated too directly as canonical state.

DB-00: scanner, vision and imported identification results are evidence/proposals with source/provenance. Ambiguous or heuristic output must pass governed matching/review/reconciliation before becoming canonical Product, StockItem or inventory truth. Any integration or import that reads or affects Household-scoped operational data must resolve through an explicit authorized Household scope; every inventory-affecting ImportRun has one target Household, and resulting entities/effects remain inside that boundary.

## Rejected as architecture decisions

The following are option lists, not accepted architecture decisions:

- Node.js/NestJS/Express/.NET as interchangeable backend choices;
- PostgreSQL/MySQL as interchangeable database targets;
- React/Angular and React Native/Flutter as simultaneous frontend commitments;
- REST/GraphQL as simultaneous public contracts;
- Kubernetes, sharding or replication as proof of scalability.

They remain open until later phases select technology based on accepted requirements and invariants.

## Missing concepts now introduced

DB-00 introduces or makes explicit:

- IngredientConcept and controlled Product compatibility for recipe/planning semantics;
- Product as a stockable identity broader than retail SKU;
- ProductIdentifier with scheme plus issuer/namespace scoping;
- MeasurementUnit and dimensional semantics;
- exact Money/Currency semantics for transaction values;
- Receiving distinct from Purchase and ReceiptItem for line-level receiving;
- StockItem distinct from Batch;
- SourceExpirationFact independent of Batch;
- InventoryMovement with occurrence/recording time, conservation rules and reconcilable balances;
- InventoryTransfer as one business transfer backed by paired conserved effects;
- InventoryCount with per-line observation/as-of semantics for non-atomic counts, historical rebase rules and ambiguity staging;
- FoodLifecycleEvent, ShelfLifeRule and deterministic EffectiveExpiration;
- Preparation, PreparationInput, PreparationInputAllocation and PreparationOutput with durable lineage;
- HouseholdProductPolicy, ShoppingList, ShoppingListItem and ShoppingListFulfillment;
- idempotency, concurrency and cross-household isolation invariants;
- source/provenance and distinct occurrence/recording time;
- scanner/vision/import evidence governance;
- Household-scoped integration/import normalization lifecycle;
- Outbox as a possible durable async publication boundary.

## Status of earlier DDL

The earlier DDL is **superseded as a production schema**. It may be used as historical input only. No migration should be generated from it directly.