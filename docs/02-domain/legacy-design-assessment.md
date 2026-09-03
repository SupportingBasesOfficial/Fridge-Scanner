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

DB-00: Product is the canonical stockable food identity and is not synonymous with a retail SKU. It may represent commercial, loose, household-defined or prepared food. Catalog governance is explicit: global Products are globally governed/reusable and are not editable through ordinary Household authority; household-defined Products belong to exactly one Household and are visible/editable only through that Household boundary. A Household may reference global Products or its own private catalog entries, never another Household's private Product. Price is transaction-specific monetary data with explicit currency and semantic role; category, namespaced identifiers and measurement semantics are explicit domain concepts; brand/manufacturer must not be accidentally conflated.

### Product / IngredientConcept compatibility
Earlier: semantic compatibility could be inferred from current catalog data or names.

DB-00: Product-to-IngredientConcept compatibility is governed, versioned reference data. A committed preparation or shopping allocation that relies on compatibility preserves immutable CompatibilityDecisionEvidence with Product, IngredientConcept, mapping/rule identity and version, effective/evaluation context, relevant constraints and provenance. Later compatibility edits affect future decisions or explicit correction workflows; they do not reinterpret historical allocations.

### Batch / lot
Earlier: `Lote` combined product batch, compartment, quantity, package state and expiration.

DB-00: Batch and StockItem are distinct concepts. Physical location and mutable lifecycle state belong to inventory holdings, not manufacturing batch identity. Batch is optional provenance and must not be fabricated merely to provide Product identity or retain a printed expiration.

### Stock quantity
Earlier: `quantidade_atual` was directly mutated by triggers/actions.

DB-00: durable InventoryMovement semantics are authoritative; current balance may be a projection/cache but must be reconcilable. InventoryMovement preserves domain occurrence time separately from recording/commit time where delayed/offline capture is possible. Placement-changing movements also preserve immutable placement facts needed for historical reconstruction instead of relying on current StockItem placement.

### Measurement conversion
Earlier: unit/package conversion could be interpreted as current configuration.

DB-00: same-dimension conversion remains governed by canonical unit semantics, while contextual, package-equivalence and cross-dimension conversion requires explicit product/ingredient evidence. When such a conversion participates in a committed receipt, movement, reconciliation or allocation, the exact source/target units, factor/formula inputs, conversion profile/rule identity and version, evaluation context and provenance are retained so later profile changes cannot reinterpret historical quantities.

### Consumption / movement / disposal
Earlier: separate operational tables each mutated the current quantity.

DB-00: their stock effect is unified under InventoryMovement semantics while domain-specific detail may remain in dedicated records. Conserved redistribution operations must preserve Product identity and quantity.

### Transfer
Earlier: movement semantics could rely on the current location of the affected stock row.

DB-00: InventoryTransfer is one domain operation backed by paired conserved effects. The source decrement preserves immutable source placement, the destination increment preserves immutable destination placement, and occurrence time is retained independently from later recording when required. Historical per-placement balances and counts therefore remain reconstructible after the StockItem moves again.

### Purchase / receiving
Earlier: a Purchase record could imply that goods entered stock, and line monetary fields could be read as generic price/value scalars.

DB-00: Purchase and Receipt are separate concepts. PurchaseItem money is explicit by semantic role: any unit/basis price identifies its pricing quantity/unit, while line gross, discount, tax/governed charges and net are distinct exact-money facts reconciled under an explicit rounding policy. Purchase-level discounts/taxes/fees remain Purchase-level unless an explicit derived allocation records method, basis, rounding and provenance; they are never silently folded into line unit cost. ReceiptItem carries received Product/quantity/unit, optional same-Product PurchaseItem provenance and authoritative inventory-entry linkage with quantity conservation. Substitution and over-receipt are explicit governed exceptions rather than silent ordinary fulfillment, and ordinary receipts plus substitutions consume one shared purchased-quantity availability pool per PurchaseItem.

### Recipe ingredients
Earlier: RecipeIngredient referenced a concrete Batch.

DB-00: RecipeIngredient targets IngredientConcept, which expresses the semantic food requirement independently of commercial SKU or physical stock. Concrete StockItems are selected only during Preparation.

### Preparation execution
Earlier: recipe definition and execution/stock effects were not cleanly separated.

DB-00: reusable Recipe evolution is versioned. A committed recipe-based Preparation points to an immutable RecipeVersion or equivalent snapshot containing the exact RecipeIngredient lines, quantities, units and constraints used. PreparationInput and PreparationOutput carry measurable quantities and link to authoritative InventoryMovement effects, preserving exact lineage and conservation. PreparationInputAllocation maps measurable input quantity to the exact immutable RecipeIngredient line it fulfills, preserves the effective scaled requirement and scaling context, and retains compatibility-decision evidence where concept compatibility is used. Every consumed recipe-based PreparationInput is fully accounted: RecipeIngredient allocations plus explicit non-recipe additions, process loss, waste or other governed deviations must sum exactly to the committed input quantity after valid conversion; an unallocated remainder is invalid. Later Recipe or compatibility edits cannot reinterpret historical execution validity.

### Dynamic expiration
Earlier: absolute and relative expiration were represented as dates and Recipe contained a dynamic-expiration date.

DB-00: SourceExpirationFact, ShelfLifeRule, lifecycle/storage facts and EffectiveExpiration are separate concepts. Source expiration may exist independently of Batch. ShelfLifeRule precedence is evaluated only within rules competing for the same semantic trigger/deadline group; independent lifecycle groups remain candidates rather than suppressing one another. Rule version selection, activation-time anchors, candidate combination and date-only comparison are deterministic and provenance-preserving. Relative rules also preserve duration amount/unit, elapsed-vs-local-calendar arithmetic, endpoint semantics and governed timezone/version context when calendar arithmetic is used. DST gaps/overlaps and end-of-day boundaries have one canonical resolution, so an `N days after opening` rule cannot mean `N × 24h` in one implementation and `N local calendar days` in another. When a date-only source fact uses the Household timezone, the exact timezone version is selected from the preserved domain occurrence/source temporal anchor at which that SourceExpirationFact became authoritative, and the same anchor/version is reused for recomputation so later Household timezone changes cannot reinterpret history.

### Inventory count
Earlier: reconciliation semantics were not sufficient for delayed/offline observation or ambiguous allocation.

DB-00: each non-atomic InventoryCountItem preserves its own physical observation time and ledger as-of/cutoff; a shared session cutoff is allowed only for a genuinely atomic/frozen snapshot. Reconciliation classifies late-recorded movements by domain occurrence time: pre-observation facts rebase/invalidate the historical reconciliation basis, while genuinely post-observation movements are preserved. Already committed adjustments are corrected through explicit compensating/reconciliation outcomes rather than history mutation. Ambiguous discrepancies remain staged/blocked rather than being arbitrarily allocated across state-distinct StockItems. Historical placement reconstruction uses immutable movement/transfer placement evidence rather than current stock location.

### Shopping / replenishment
Earlier: shopping intent and purchase fulfillment were underspecified.

DB-00: HouseholdProductPolicy thresholds have measurement semantics; ShoppingListItem has a canonical Product-or-IngredientConcept subject and measurable requested amount; ShoppingListFulfillment explicitly allocates compatible PurchaseItem quantities without double counting. IngredientConcept-targeted fulfillment retains the exact compatibility mapping/version/context that justified the allocation.

### Alerts / notifications
Earlier: alert configuration and delivery were described functionally but without a durable ownership/subject chain.

DB-00: Household-derived AlertRule belongs to one Household and records the governed subject/scope it evaluates. Alert retains its originating rule, target Household and triggering subject/context. NotificationDelivery links to one Alert and preserves recipient/destination, channel and delivery provenance; a destination or provider identity is never itself proof of Household authorization. Truly user-global preferences may influence delivery behavior but cannot become cross-household operational alert authority.

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

- IngredientConcept and versioned controlled Product compatibility for recipe/planning semantics;
- immutable CompatibilityDecisionEvidence for committed concept-based allocations;
- Product as a stockable identity broader than retail SKU, with explicit global-vs-Household catalog governance;
- ProductIdentifier with scheme plus issuer/namespace scoping;
- MeasurementUnit and dimensional semantics;
- versioned MeasurementConversionEvidence for committed contextual/package/cross-dimension conversions;
- exact Money/Currency semantics plus explicit PurchaseItem pricing basis, line gross/discount/tax-or-charge/net roles and governed rounding/reconciliation;
- Receiving distinct from Purchase and ReceiptItem for line-level receiving;
- shared PurchaseItem allocation semantics across ordinary receipts and substitutions;
- StockItem distinct from Batch;
- SourceExpirationFact independent of Batch, with a preserved domain/source temporal anchor for deterministic date-only timezone selection;
- InventoryMovement with occurrence/recording time, immutable placement evidence, conservation rules and reconcilable balances;
- InventoryTransfer as one business transfer backed by paired conserved effects with immutable source/destination placement;
- InventoryCount with per-line observation/as-of semantics for non-atomic counts, historical rebase rules and ambiguity staging;
- FoodLifecycleEvent, ShelfLifeRule semantic trigger/deadline groups, explicit relative-duration arithmetic and deterministic EffectiveExpiration;
- immutable RecipeVersion/snapshot for committed recipe execution;
- Preparation, PreparationInput, PreparationInputAllocation and PreparationOutput with durable lineage, scaled RecipeIngredient reconciliation, preserved compatibility evidence and exhaustive consumed-input accounting;
- HouseholdProductPolicy, ShoppingList, ShoppingListItem and ShoppingListFulfillment;
- Household-scoped AlertRule, Alert and NotificationDelivery ownership/subject chain;
- idempotency, concurrency and cross-household isolation invariants;
- source/provenance and distinct occurrence/recording time;
- scanner/vision/import evidence governance;
- Household-scoped integration/import normalization lifecycle;
- Outbox as a possible durable async publication boundary.

## Status of earlier DDL

The earlier DDL is **superseded as a production schema**. It may be used as historical input only. No migration should be generated from it directly.
