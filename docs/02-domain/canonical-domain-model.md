# FridgeScanner — Canonical Domain Model

## Status

DB-00 canonical conceptual model. This document defines concepts and relationships, not physical SQL tables.

## 1. Identity and household membership

### User
Represents a platform user profile. Authentication credentials are not part of the food-management domain.

### Household
Primary operational and authorization boundary. A household owns its storage topology, inventory, purchases, preparations, policies and operational history.

### HouseholdMembership
Associates a User with a Household and carries household-scoped authority and membership lifecycle.

The same User may have different roles in different Households. Therefore household roles must not be duplicated as a single global User role.

## 2. Storage topology

### StorageLocation
A physical storage location belonging to one Household, such as refrigerator, freezer, pantry, cabinet or cellar.

### Compartment
A physical subdivision of a StorageLocation, such as a shelf, drawer, door section or niche.

Physical occupancy indicators are projections derived from capacity and stock data when possible; they are not authoritative domain truth by default.

A stored StockItem has exactly one placement anchor: either a Compartment or a StorageLocation directly. A Compartment anchor resolves its StorageLocation through the compartment relationship and must not create a second conflicting location truth. A StockItem may be temporarily unplaced only through an explicit unplaced lifecycle/state, not through an ambiguous missing relationship.

## 3. Product catalog

### IngredientConcept
Recipe-facing semantic food/ingredient concept, such as "milk", "egg" or "rice". It is independent from a specific commercial SKU, barcode or household stock item.

A controlled compatibility relationship maps Products that may satisfy an IngredientConcept. Compatibility is domain data, not uncontrolled name matching. A recipe may impose an exact-product constraint when a specific commercial product is genuinely required.

### Product
Canonical definition of a stockable food/product identity. A Product may represent a commercial packaged product, loose/unbranded food, a household-defined item, or a reusable identity for prepared food/output. Commercial metadata such as SKU, barcode, brand, manufacturer or Batch is optional and must not be required merely to create valid stock identity.

Product identity is independent from purchase price, Household stock and physical location. A Product may satisfy one or more IngredientConcepts according to controlled compatibility semantics. `Product` therefore does not mean “retail SKU”; it is the canonical stockable subject referenced directly by StockItem.

### ProductCategory
Classifies products and may form a hierarchy.

### ProductIdentifier
Maps a Product to one or more identifiers. Every identifier records an explicit scheme/type and the issuer/namespace required by that scheme. Globally governed schemes such as GTIN use their governed global namespace; non-global schemes such as retailer SKU, provider code, household/internal ID or locally scoped PLU must identify the issuing retailer/provider/Household or other governed namespace.

Identifier uniqueness is therefore evaluated within the canonical tuple `(scheme, issuer/namespace, normalized value)`, with issuer omitted only when the scheme itself defines a single global namespace. The same non-global value may legitimately exist under different issuers and must not resolve ambiguously across those namespaces.

### Brand / Manufacturer
Brand and manufacturer are distinct concepts and must not be conflated by the model, even if an initial physical implementation keeps one of them optional.

### MeasurementUnit
Defines units used by measurable quantities. Quantities must be dimensionally meaningful; mass, volume and count are not interchangeable without an explicit valid conversion rule.

### Money / Currency
Monetary values carry an exact amount and explicit currency. Binary floating-point representation is not authoritative money semantics. Cross-currency comparison or aggregation requires an explicit conversion rate/source and conversion time/context; the system must never silently treat numerically equal amounts in different currencies as equivalent.

## 4. Procurement and receiving

### Purchase
Represents a commercial transaction or acquisition record and establishes the transaction currency/context used by its monetary lines unless a source transaction explicitly models multiple currencies with preserved conversion provenance.

### PurchaseItem
Represents an item purchased, including Product, transaction-specific quantity, MeasurementUnit and monetary price. The quantity is never unitless; reconciliation may convert only under the accepted dimension-safe conversion rules. Price/discount/tax values are transaction facts with explicit currency and exact monetary semantics rather than Product attributes.

If an imported/source line is denominated differently from the Purchase transaction currency, both the source amount/currency and any normalized amount must preserve the explicit conversion rate/source and conversion time/context; silent conversion is forbidden.

### Receipt / Receiving
Represents a physical receiving operation into a Household. Purchase and Receipt may occur atomically in simple flows, but they remain separate concepts because purchased and received quantities can differ in time or amount. A Receipt may also represent an acquisition with no prior Purchase record when the source workflow legitimately has no commercial order.

### ReceiptItem
Represents one received Product/quantity/MeasurementUnit line inside a Receipt. When receipt originates from a Purchase, the ReceiptItem links to the relevant PurchaseItem so partial and incremental receiving can be reconciled at line level.

When a ReceiptItem references a PurchaseItem, both lines must identify the same Product. A received substitution must not masquerade as ordinary provenance to a different purchased Product: substitution requires an explicit governed exception/allocation that records the requested Product, received Product, substituted quantity/MeasurementUnit, reason/approval and provenance before it can reconcile against the PurchaseItem.

A committed ReceiptItem must retain traceable linkage to the inventory entry effect(s) that materialize what physically entered stock, including resulting StockItem/Batch provenance as applicable. Every linked entry effect must represent the same Product as the ReceiptItem, and the sum of the linked committed entry quantities, after valid dimension-safe conversion into one comparison unit, must equal exactly the committed ReceiptItem quantity. One PurchaseItem may therefore be fulfilled by multiple ReceiptItems over time, and one ReceiptItem may produce multiple inventory entry effects when batch, placement or other identity-affecting state requires a split; splitting may redistribute quantity but must neither create nor destroy it.

All allocations that consume a PurchaseItem's acquired quantity share one source availability pool. After valid dimension-safe conversion, the sum of ordinary same-Product receipt allocations plus governed substitution allocations against that PurchaseItem must not exceed its purchased quantity as normal fulfillment. Partial receiving is valid. Quantity beyond the purchased amount, regardless of whether it is ordinary or substituted, must remain an explicit over-receipt discrepancy/exception with governed acceptance or correction; substitution must never create an independent second quantity allowance for the same PurchaseItem.

## 5. Inventory

### Batch
Represents optional manufacturer/commercial batch provenance and batch-level facts such as manufacturer lot code, production date and original expiration when known. A Batch belongs to exactly one Product. Absence of known batch information must not require fabrication of a synthetic manufacturer batch.

### StockItem
Represents a concrete inventory holding under a Household. It is the inventory unit of record and may aggregate measurable quantity only while identity-affecting state remains coherent.

Every StockItem identifies exactly one Product directly. A StockItem may additionally reference a Batch when batch provenance is known; if present, that Batch must belong to the same Product as the StockItem. Batch is therefore optional provenance, never the only path from inventory to Product identity.

A stored StockItem has exactly one placement anchor: either one Compartment or one StorageLocation directly. If the anchor is a Compartment, its parent StorageLocation is authoritative and must belong to the same Household. A StockItem may be temporarily unplaced only when that condition is represented explicitly. It must be splittable when part of its quantity acquires materially different placement, package state, shelf-life state or provenance requirements. Future reservation/hold behavior, if introduced, must define its own governed semantics before it can become an identity-affecting StockItem state.

A Batch must not be used as the physical-location record.

### SourceExpirationFact
Represents an authoritative expiration or best-before fact observed for a concrete StockItem/package, independent of whether manufacturer Batch identity is known. It records the source value with its original precision/semantics and provenance, such as package label, ReceiptItem/import, user observation or trusted external source.

A SourceExpirationFact may reference a Batch when the fact is genuinely batch-level, but Batch is not required. Stock must never fabricate a Batch merely to retain a printed expiration date.

### InventoryMovement
Represents an immutable committed stock delta/event such as receipt, consumption, waste, transfer, adjustment, preparation input, preparation output, donation or return. Corrections are additional compensating/adjustment movements rather than mutation of committed movement history.

An InventoryMovement whose domain occurrence time can differ from its recording/commit time preserves both. This distinction is authoritative for historical reconciliation: late recording does not change when the physical/domain stock change actually occurred.

### InventoryTransfer
Represents one atomic business transfer identity backed by linked source-decrement and destination-increment ledger effects. In the initial domain, both ends must resolve to the same Household. Both effects must represent the same Product and conserve exactly the transferred quantity after valid dimension-safe conversion. A transfer may change placement and may split or merge compatible holdings, but it must not silently transform one Product into another or create/destroy quantity. Transfer semantics preserve lineage between source and destination effects.

### InventoryBalance
Represents a projection/materialized balance when needed for efficient reads. It must be derivable or reconcilable from authoritative inventory history and must not silently contradict that history. Committed authoritative inventory must not become negative under the accepted DB-00 policy.

### InventoryCount
Represents a physical inventory/counting session scoped to one Household and optionally to a defined counting area such as a StorageLocation or Compartment. A session may carry common timing metadata, but a non-atomic count must not pretend that every line was observed against one instant merely because the lines belong to the same session.

Each InventoryCountItem records its authoritative physical observation time and the corresponding ledger as-of/cutoff used for that line's reconciliation. A session-level observation time/cutoff may be reused by all lines only when the workflow provides a genuinely atomic/frozen snapshot or equivalent snapshot token that guarantees all observations correspond to the same authoritative inventory state.

Reconciliation compares each observed line with system state as of that line's captured cutoff and observation time, not whatever balance happens to exist when processing occurs later. A movement recorded after the captured cutoff is classified by domain occurrence time, not merely by commit time. If its occurrence is after the physical observation, it is a genuinely intervening/post-observation movement and must be preserved outside the count adjustment. If its occurrence is at or before the physical observation, it changes the historical state that the observation should have been compared against: the prior reconciliation basis is invalidated/rebased and must be recomputed with that late fact included before an adjustment can remain or become committed. A late pre-observation movement must never be preserved on top of an adjustment that already compensated for its physical effect, because that would double-apply the change.

If a reconciliation adjustment was already committed when a newly recorded pre-observation fact becomes authoritative, the system must not mutate history. It must deterministically recompute the count outcome against the corrected historical state and emit an explicit compensating/reconciliation outcome when safe, or block/escalate when provenance, ordering or required history is insufficient. If the captured historical state can no longer be reconstructed safely, the outcome must be blocked/escalated rather than guessed.

### InventoryCountItem
Represents one observed count line. It must identify the counted Product, observed quantity and MeasurementUnit, plus the observed placement when placement is part of the counting context, and its own authoritative observation time plus ledger as-of/cutoff unless the session proves one common atomic snapshot as defined above. It may reference an existing StockItem when the observed stock can be matched unambiguously; that reference is optional because physical counting must also represent newly discovered stock that has no prior StockItem.

When an InventoryCountItem matches an existing StockItem, product and placement semantics must be compatible with that StockItem. When no existing StockItem matches, the count line still carries enough Product/placement/measurement identity to represent the observation, but this does not authorize arbitrary allocation across state-distinct holdings.

If more than one existing StockItem is compatible with the observed Product/placement while differing in batch, expiration, package/lifecycle state or other identity-affecting provenance, the discrepancy is ambiguous. The workflow must either capture sufficient count granularity to identify the affected holding(s), or retain the discrepancy in an explicit unresolved/staging state until a governed allocation decision is made. No adjustment may arbitrarily decrement or increment one candidate StockItem merely to force aggregate equality.

Every committed reconciliation outcome links back to the InventoryCount/InventoryCountItem, that line's authoritative observation/as-of point, the historical movement set/basis used, the deterministic allocation/match decision and the committed adjustment or compensating movement(s) it produced.

## 6. Food lifecycle and shelf life

### ShelfLifeRule
Represents a versioned rule such as "N days after opening", "N days after preparation", or a rule conditional on storage state. A relative shelf life is a duration/rule, not a calendar date.

Every ShelfLifeRule has an explicit applicability scope. Rules may target a specific Product, an IngredientConcept, or another governed classification introduced later; broader scopes must not override a more specific applicable rule accidentally. Applicability may include trigger/event type, storage condition/category and other explicit predicates required by the rule.

When multiple rules are applicable, selection must be deterministic through governed precedence semantics: exact Product scope outranks broader IngredientConcept/classification scope; within the same specificity, an explicit priority resolves ordering. Version/effective-interval selection is evaluated as of the domain occurrence time of the authoritative fact that activates the rule. For an event-triggered rule this is the triggering FoodLifecycleEvent occurrence time; for a stock-entry/default rule it is the authoritative stock-entry occurrence time; for a placement/storage-change rule it is the occurrence time of the authoritative InventoryMovement/InventoryTransfer or other canonical placement-state change that activated the storage predicate; and for a rule triggered by a trusted storage/conservation observation it is that observation's occurrence time. Recomputing later must reuse the same original evaluation anchor rather than current/recalculation time. Conflicting equally specific rules with the same effective priority at that evaluation time must be rejected or surfaced for governance rather than selected arbitrarily.

### FoodLifecycleEvent
Represents meaningful state-changing facts such as opened, frozen, thawed, prepared or other conservation events that may influence effective shelf life.

### EffectiveExpiration
An explainable materialized projection for a concrete StockItem. Authoritative truth remains SourceExpirationFact records, applicable Batch source facts, lifecycle/storage facts and versioned shelf-life rules.

Each applicable authoritative input produces zero or more expiration candidates with preserved source semantics/provenance. Unless a future explicitly governed rule defines a different composition for a specific semantic class, the operational EffectiveExpiration is the earliest applicable candidate: source/package expiration and lifecycle-derived deadlines act as limiting upper bounds, so a later candidate must never extend an earlier authoritative deadline.

For candidate ordering, a source expiration expressed only as a calendar date preserves its original date-only precision as authoritative source data but is interpreted operationally as the end of that local calendar day in the canonical Household timezone applicable to the StockItem. If the source itself supplies an explicit timezone/offset or a governed external context requires one, that source context is preserved and used instead. The Household timezone used for interpretation must itself be a governed, versioned/as-of context so later timezone-setting changes do not alter historical recomputation. Instant-valued candidates retain their exact instant. Comparisons normalize these operational instants without mutating or fabricating precision in the original source fact.

The materialized value must be invalidatable and deterministically recomputable when authoritative inputs change, and it must retain enough provenance to explain the candidate set, combination result, evaluation anchor, date-only interpretation timezone/context and ShelfLifeRule version(s) that participated in selection.

Expiration is a state/condition. Disposal is a separate physical action and must not be inferred as having occurred merely because time passed.

## 7. Recipes and preparations

### Recipe
Reusable preparation definition. A Recipe is not tied to a physical stock batch or household storage location.

### RecipeIngredient
Defines an `IngredientConcept`, quantity, unit and optional constraints for a Recipe. It does not reference concrete stock. An exact Product constraint is permitted only when the recipe genuinely requires a specific product.

### Preparation
Concrete execution of a Recipe or ad-hoc preparation inside a Household.

### PreparationInput
Represents one measurable stock input consumed by a Preparation. It identifies the concrete source StockItem, Product, consumed quantity and MeasurementUnit and must retain traceable linkage to the authoritative preparation-input InventoryMovement decrement effect(s).

Every linked input effect must represent the same Product as the PreparationInput and originate from the referenced StockItem or its governed split lineage. The sum of linked committed decrement quantities, after valid dimension-safe conversion, must equal exactly the PreparationInput quantity. A single input may therefore be materialized by multiple decrement effects only when lineage/state splitting requires it; splitting may redistribute the consumed quantity but must neither create nor destroy it.

### PreparationInputAllocation
For a Preparation that executes a Recipe, fulfillment of recipe requirements is represented explicitly by allocations from PreparationInput to RecipeIngredient. Each allocation identifies the exact RecipeIngredient line, allocated quantity and MeasurementUnit. The allocated Product must satisfy that line's IngredientConcept and any exact-Product or other governed constraints effective for the preparation.

Multiple PreparationInputs may fulfill one RecipeIngredient and one PreparationInput may be allocated across more than one compatible RecipeIngredient when quantities require it. Allocations must reconcile through dimension-safe conversion and preserve enough identity to distinguish repeated or otherwise similar recipe lines. Across all allocations sourced from one PreparationInput, the allocated total must not exceed that PreparationInput quantity.

For each RecipeIngredient, the preparation resolves the effective required quantity after applying the Preparation's governed recipe scaling/yield factor or other explicit quantity adjustment. The sum of compatible PreparationInputAllocation quantities targeting that exact RecipeIngredient must reconcile against that effective requirement after valid conversion. Normal exact fulfillment must not exceed or underfill the requirement silently. If the preparation intentionally permits an underage, overage, tolerance or substitution, the deviation must be explicit and preserve the expected quantity, actual allocated quantity, MeasurementUnit, reason/policy and provenance/approval where required. Recipe requirement fulfillment is derived from these explicit allocations rather than inferred from ingredient names or Product similarity. Ad-hoc Preparations with no Recipe have no RecipeIngredient allocation requirement.

### PreparationOutput
Represents one measurable food output produced by a Preparation. Each output identifies the resulting Product, quantity and MeasurementUnit and must retain traceable linkage to the authoritative preparation-output InventoryMovement effect(s) that materialize inventory.

Every linked output effect must represent the same Product as the PreparationOutput, and the sum of linked committed output quantities, after valid dimension-safe conversion, must equal exactly the PreparationOutput quantity. One PreparationOutput may create multiple movement effects/StockItems when placement, package, shelf-life or provenance state requires a split. Multiple preparation outputs may later contribute to compatible holdings, but lineage to each originating PreparationOutput must remain recoverable through immutable movement provenance rather than inferred from the current StockItem balance.

This separation creates the invariant: recipe = definition; preparation = execution.

## 8. Waste and disposal

### WasteRecord
Provides waste-specific semantics such as reason and classification when a stock-reducing movement represents waste/disposal.

The authoritative quantity change remains linked to inventory movement semantics so stock cannot have multiple unrelated truths.

## 9. Planning and replenishment

### HouseholdProductPolicy
Stores household/product-specific policy such as minimum desired stock or preferred storage defaults. Every measurable threshold, including minimum desired stock, carries or resolves an explicit MeasurementUnit and must be comparable with the relevant inventory balance only through the accepted dimension-safe conversion rules.

### ShoppingList
Represents future purchase intent and is distinct from Purchase, which represents an acquisition transaction.

### ShoppingListItem
Represents one measurable desired item and can originate from manual input, policy, recipe planning or future automation. A resolved line targets exactly one canonical subject: either a Product when a specific catalog item is desired or an IngredientConcept when any compatible Product can satisfy the intent. It carries requested quantity and MeasurementUnit.

Free text may be retained as unresolved user input/provenance, but unresolved text is not a canonical fulfillment identity.

### ShoppingListFulfillment
Represents an explicit quantity allocation from one PurchaseItem to one ShoppingListItem. For a Product-targeted list line, the PurchaseItem must reference that exact Product. For an IngredientConcept-targeted line, the purchased Product must satisfy that IngredientConcept through the governed compatibility relationship effective for the fulfillment decision.

Each fulfillment allocation records allocated quantity and MeasurementUnit. Allocated quantities are reconciled through the accepted dimension-safe conversion rules, may represent partial fulfillment, and must not exceed the quantity of the source PurchaseItem available for allocation after accounting for its other fulfillment allocations. A ShoppingListItem is fully fulfilled only when the sum of its compatible allocated quantities satisfies its requested quantity under an explicit fulfillment policy; over-fulfillment, substitution or tolerance must be represented explicitly rather than inferred. The same purchased quantity must not be double-counted across multiple list lines.

## 10. Automation, alerts and integrations

### AlertRule
Defines a condition or preference that may create an alert. A rule that reads or evaluates Household-scoped operational data belongs to exactly one Household and records the governed subject/scope it evaluates, such as a Product, StockItem, StorageLocation, expiration condition or other explicit Household-owned target. Household ownership is part of the rule's authorization boundary, not an inferred UI filter.

A genuinely user-global notification preference may exist outside a Household only when it does not itself grant access to Household operational data or act as a cross-household alert rule. Applying a global preference to a Household alert still requires the underlying AlertRule/Alert to remain Household-scoped and independently authorized.

### Alert
Represents a detected actionable condition and retains the AlertRule, target Household, triggering subject/context and detection occurrence/recording provenance needed to explain the condition. An Alert must not be attached to a Household or subject different from the rule/evidence that produced it.

### NotificationDelivery
Represents one delivery attempt for an Alert through a channel. It links to exactly one Alert and preserves the intended recipient/destination, channel, delivery state and attempt provenance. Alert state and delivery state are separate.

For Household-derived alerts, the delivery decision must be based on a recipient/destination that is authorized or explicitly configured for that Household at the governed decision point. A NotificationDelivery cannot be reassigned across Households, and knowledge of an email address, device token, webhook destination or provider account is not by itself Household authorization.

### Integration
Represents an external-provider connection and lifecycle. Credentials/secrets are referenced through secure infrastructure and are not stored as arbitrary JSON in the domain model.

An Integration that is authorized to read or affect Household-scoped operational data must carry an explicit governed Household scope/binding. Provider account identity, connection ownership or possession of provider credentials is not proof of authorization for an arbitrary Household. A platform/global Integration is permitted only for capabilities that do not implicitly grant inventory authority across households; household-affecting use must resolve through an explicit Household binding.

### ImportRun / ExternalReference
Tracks external imports and their provenance so third-party data does not write directly into canonical inventory without normalization and reconciliation semantics. Every inventory-affecting ImportRun identifies exactly one target Household. Every ExternalReference used to reconcile or materialize Household-owned inventory also retains that Household scope, directly or through an unambiguous parent ImportRun/binding.

All canonical entities and inventory effects produced from an import must remain inside the same target Household boundary. Cross-household reuse of provider identifiers may exist as provider metadata, but it must not authorize or accidentally attach imported operational data to another Household.

## 11. Governance and platform records

### AuditEvent
Records who/what performed an auditable action, in which Household/context, against which entity, and when.

Audit history is distinct from application logs, security telemetry, domain events and inventory ledger history.

### IdempotencyRecord
Supports safe retry of mutations where duplicate execution could corrupt business state.

### OutboxRecord
Provides a durable publication boundary for asynchronous side effects when a database mutation and event/message publication must be coordinated.

## 12. Core relationship map

```text
User ──< HouseholdMembership >── Household
                                │
                                ├──< StorageLocation ──< Compartment
                                │          ▲                ▲
                                │          └──── placement ─┤
                                │                           │
                                ├──< Purchase ──< PurchaseItem ──< ReceiptItem
                                ├──< Receipt ──< ReceiptItem ──< InventoryMovement
                                │                         └──────> StockItem / Batch provenance
                                ├──< StockItem >──────────────> Product
                                │       ├──── optional ───────> Batch ─────> Product
                                │       ├──< SourceExpirationFact ── optional provenance ─> Batch/ReceiptItem
                                │       ├── placement ────────> StorageLocation XOR Compartment
                                │       ├──< InventoryMovement
                                │       ├──< FoodLifecycleEvent
                                │       └── EffectiveExpiration
                                ├──< InventoryTransfer ── paired conserved effects ──> InventoryMovement
                                ├──< InventoryCount ──< InventoryCountItem ──> Product
                                │       └── per-line observation/as-of ──> reconciliation adjustment InventoryMovement
                                │                              ├── optional ──> StockItem
                                │                              └── placement ─> StorageLocation/Compartment
                                ├──< Preparation ──< PreparationInput ──< InventoryMovement >── StockItem
                                │              │          └──< PreparationInputAllocation >── RecipeIngredient
                                │              └──< PreparationOutput ──< InventoryMovement ──> StockItem
                                ├──< ShoppingList ──< ShoppingListItem ──> Product XOR IngredientConcept
                                │                              └──< ShoppingListFulfillment >── PurchaseItem
                                ├──< AlertRule ──< Alert ──< NotificationDelivery
                                ├──< Integration / Household binding
                                │       └──< ImportRun ──< ExternalReference
                                └──< HouseholdProductPolicy >── Product

IngredientConcept ──< RecipeIngredient >── Recipe
        │
        ├──< ShelfLifeRule
        └──< controlled compatibility >── Product

Product ──< ProductIdentifier ── scoped by scheme + issuer/namespace
        ├──< ShelfLifeRule
        ├──> ProductCategory
        └── measurement/catalog metadata

ShelfLifeRule ── scoped applicability / deterministic activation-time selection ──> Product | IngredientConcept | governed classification
StockItem ──< EffectiveExpiration ── provenance ──> SourceExpirationFact / ShelfLifeRule version(s)
```

`StorageLocation XOR Compartment` means one stored StockItem has one placement anchor, not two competing placement truths. Explicitly unplaced StockItems are the governed exception.

## 13. Explicitly rejected conflations from earlier drafts

The canonical model rejects these conflations:

- global `User.role` as household authority;
- Product as synonymous with retail SKU or commercial packaging;
- Batch as both manufacturing lot and physical inventory position;
- Batch as a mandatory bridge between StockItem and Product or source expiration;
- ProductIdentifier uniqueness without scheme/issuer namespace semantics;
- Product as owner of a single current price;
- monetary amount without explicit currency or silent cross-currency conversion;
- unitless purchased, counted, prepared-input, prepared-output, replenishment-policy or shopping quantities;
- Purchase as proof that stock physically entered inventory;
- ReceiptItem linked to a different-Product PurchaseItem without explicit substitution semantics;
- Receipt without line-level received-quantity, inventory-entry provenance and quantity conservation;
- ordinary receipts and substitutions consuming separate quantity allowances from the same PurchaseItem;
- silent over-receipt treated as ordinary PurchaseItem fulfillment;
- InventoryCountItem without explicit counted-subject identity or its own observation/as-of semantics when the session is not atomic;
- inventory reconciliation that classifies late-recorded movements only by commit time instead of domain occurrence time;
- a late pre-observation movement applied on top of a count adjustment that already compensated for the same physical effect;
- ambiguous aggregate count allocated arbitrarily across state-distinct StockItems;
- InventoryTransfer without same-Product and quantity-conservation semantics;
- PreparationInput without authoritative decrement provenance and quantity conservation;
- recipe-based PreparationInput fulfillment inferred without explicit RecipeIngredient allocation;
- recipe allocations capped only by source input while silently over/under-fulfilling the target RecipeIngredient requirement;
- PreparationOutput without explicit quantity/unit, authoritative movement provenance and quantity conservation;
- ShoppingListItem fulfillment without subject compatibility, quantity allocation and anti-double-counting semantics;
- AlertRule/Alert/NotificationDelivery without explicit Household, subject and recipient/destination ownership chain for Household-derived conditions;
- inventory-affecting Integration/ImportRun without explicit Household scope;
- provider identity, credentials or notification destination treated as Household authorization;
- ambiguous StockItem placement with conflicting location/compartment truths;
- undeclared reservation/hold semantics treated as if already canonical StockItem state;
- ShelfLifeRule without explicit applicability, deterministic precedence and an activation-class-specific stable evaluation anchor;
- EffectiveExpiration without deterministic candidate-combination and date-only comparison semantics;
- RecipeIngredient pointing to a physical Batch or StockItem;
- RecipeIngredient being permanently tied to one commercial SKU when a semantic IngredientConcept is sufficient;
- Recipe pointing to one concrete destination StorageLocation;
- relative shelf life represented as a calendar date;
- expiration automatically meaning disposal;
- household physical structure duplicated inside JSON configuration;
- one mutable `quantity_current` value as the only source of inventory truth;
- audit log as a substitute for inventory/domain history.