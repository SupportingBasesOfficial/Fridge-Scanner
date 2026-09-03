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
Canonical description of a commercial or otherwise catalogued food product. Product identity is independent from purchase price, household stock and physical location. A Product may satisfy one or more IngredientConcepts according to controlled compatibility semantics.

### ProductCategory
Classifies products and may form a hierarchy.

### ProductIdentifier
Maps a Product to one or more identifiers. Identifier type is explicit so barcode/GTIN, PLU, SKU, QR, internal identifiers and future scanner identifiers can coexist.

### Brand / Manufacturer
Brand and manufacturer are distinct concepts and must not be conflated by the model, even if an initial physical implementation keeps one of them optional.

### MeasurementUnit
Defines units used by measurable quantities. Quantities must be dimensionally meaningful; mass, volume and count are not interchangeable without an explicit valid conversion rule.

## 4. Procurement and receiving

### Purchase
Represents a commercial transaction or acquisition record.

### PurchaseItem
Represents an item purchased, including Product, transaction-specific quantity, MeasurementUnit and price. The quantity is never unitless; reconciliation may convert only under the accepted dimension-safe conversion rules.

### Receipt / Receiving
Represents a physical receiving operation into a Household. Purchase and Receipt may occur atomically in simple flows, but they remain separate concepts because purchased and received quantities can differ in time or amount. A Receipt may also represent an acquisition with no prior Purchase record when the source workflow legitimately has no commercial order.

### ReceiptItem
Represents one received Product/quantity/MeasurementUnit line inside a Receipt. When receipt originates from a Purchase, the ReceiptItem links to the relevant PurchaseItem so partial and incremental receiving can be reconciled at line level.

A committed ReceiptItem must retain traceable linkage to the inventory entry effect(s) that materialize what physically entered stock, including resulting StockItem/Batch provenance as applicable. Every linked entry effect must represent the same Product as the ReceiptItem, and the sum of the linked committed entry quantities, after valid dimension-safe conversion into one comparison unit, must equal exactly the committed ReceiptItem quantity. One PurchaseItem may therefore be fulfilled by multiple ReceiptItems over time, and one ReceiptItem may produce multiple inventory entry effects when batch, placement or other identity-affecting state requires a split; splitting may redistribute quantity but must neither create nor destroy it.

## 5. Inventory

### Batch
Represents optional manufacturer/commercial batch provenance and batch-level facts such as manufacturer lot code, production date and original expiration when known. A Batch belongs to exactly one Product. Absence of known batch information must not require fabrication of a synthetic manufacturer batch.

### StockItem
Represents a concrete inventory holding under a Household. It is the inventory unit of record and may aggregate measurable quantity only while identity-affecting state remains coherent.

Every StockItem identifies exactly one Product directly. A StockItem may additionally reference a Batch when batch provenance is known; if present, that Batch must belong to the same Product as the StockItem. Batch is therefore optional provenance, never the only path from inventory to Product identity.

A stored StockItem has exactly one placement anchor: either one Compartment or one StorageLocation directly. If the anchor is a Compartment, its parent StorageLocation is authoritative and must belong to the same Household. A StockItem may be temporarily unplaced only when that condition is represented explicitly. It must be splittable when part of its quantity acquires materially different placement, package state, shelf-life state, reservation/hold state or provenance requirements.

A Batch must not be used as the physical-location record.

### SourceExpirationFact
Represents an authoritative expiration or best-before fact observed for a concrete StockItem/package, independent of whether manufacturer Batch identity is known. It records the source value with its original precision/semantics and provenance, such as package label, ReceiptItem/import, user observation or trusted external source.

A SourceExpirationFact may reference a Batch when the fact is genuinely batch-level, but Batch is not required. Stock must never fabricate a Batch merely to retain a printed expiration date.

### InventoryMovement
Represents an immutable committed stock delta/event such as receipt, consumption, waste, transfer, adjustment, preparation input, preparation output, donation or return. Corrections are additional compensating/adjustment movements rather than mutation of committed movement history.

### InventoryTransfer
Represents one atomic business transfer identity backed by linked source-decrement and destination-increment ledger effects. In the initial domain, both ends must resolve to the same Household. Both effects must represent the same Product and conserve exactly the transferred quantity after valid dimension-safe conversion. A transfer may change placement and may split or merge compatible holdings, but it must not silently transform one Product into another or create/destroy quantity. Transfer semantics preserve lineage between source and destination effects.

### InventoryBalance
Represents a projection/materialized balance when needed for efficient reads. It must be derivable or reconcilable from authoritative inventory history and must not silently contradict that history. Committed authoritative inventory must not become negative under the accepted DB-00 policy.

### InventoryCount
Represents a physical inventory/counting session scoped to one Household and optionally to a defined counting area such as a StorageLocation or Compartment. The session records an authoritative physical observation time and a corresponding ledger as-of/cutoff point used for reconciliation.

Reconciliation must compare observed quantities with the system state as of that captured cutoff, not whatever balance happens to exist when processing occurs later. If committed movements occur after the cutoff, reconciliation must preserve them: the adjustment is computed against the captured as-of state and committed with concurrency semantics that prevent overwriting or double-accounting for intervening movements. If the captured cutoff can no longer be reconciled safely because required history is unavailable or conflicting, the outcome must be blocked/escalated rather than guessed.

### InventoryCountItem
Represents one observed count line. It must identify the counted Product, observed quantity and MeasurementUnit, plus the observed placement when placement is part of the counting context. It may reference an existing StockItem when the observed stock can be matched unambiguously; that reference is optional because physical counting must also represent newly discovered stock that has no prior StockItem.

When an InventoryCountItem matches an existing StockItem, product and placement semantics must be compatible with that StockItem. When no existing StockItem matches, the count line still carries enough Product/placement/measurement identity to support an explicit reconciliation outcome that can create canonical inventory rather than silently mutating or inventing history. Every reconciliation outcome links back to the InventoryCount/InventoryCountItem, the captured as-of point and the committed adjustment movement(s) it produced.

## 6. Food lifecycle and shelf life

### ShelfLifeRule
Represents a versioned rule such as "N days after opening", "N days after preparation", or a rule conditional on storage state. A relative shelf life is a duration/rule, not a calendar date.

Every ShelfLifeRule has an explicit applicability scope. Rules may target a specific Product, an IngredientConcept, or another governed classification introduced later; broader scopes must not override a more specific applicable rule accidentally. Applicability may include trigger/event type, storage condition/category and other explicit predicates required by the rule.

When multiple rules are applicable, selection must be deterministic through governed precedence semantics: exact Product scope outranks broader IngredientConcept/classification scope; within the same specificity, an explicit priority resolves ordering. Version/effective-interval selection is evaluated as of the domain occurrence time of the fact that activates the rule. For an event-triggered rule this is the triggering FoodLifecycleEvent occurrence time; for a stock-entry/default rule it is the authoritative stock-entry occurrence time. Recomputing later must reuse that same evaluation anchor rather than current/recalculation time. Conflicting equally specific rules with the same effective priority at that evaluation time must be rejected or surfaced for governance rather than selected arbitrarily.

### FoodLifecycleEvent
Represents meaningful state-changing facts such as opened, frozen, thawed, prepared or other conservation events that may influence effective shelf life.

### EffectiveExpiration
An explainable materialized projection for a concrete StockItem. Authoritative truth remains SourceExpirationFact records, applicable Batch source facts, lifecycle/storage facts and versioned shelf-life rules.

Each applicable authoritative input produces zero or more expiration candidates with preserved source semantics/provenance. Unless a future explicitly governed rule defines a different composition for a specific semantic class, the operational EffectiveExpiration is the earliest applicable candidate: source/package expiration and lifecycle-derived deadlines act as limiting upper bounds, so a later candidate must never extend an earlier authoritative deadline. Candidate comparison must use an explicit precision/timezone policy when source values are date-only or otherwise not directly comparable; the system must not silently invent precision.

The materialized value must be invalidatable and deterministically recomputable when authoritative inputs change, and it must retain enough provenance to explain the candidate set, combination result, evaluation anchor and ShelfLifeRule version(s) that participated in selection.

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

Free text may be retained as unresolved user input/provenance, but unresolved text is not a canonical fulfillment identity. Once fulfilled or matched, a ShoppingListItem may link to one or more PurchaseItems so requested and acquired quantities remain traceable without conflating shopping intent with the purchase transaction.

## 10. Automation, alerts and integrations

### AlertRule
Defines a condition or preference that may create an alert.

### Alert
Represents a detected actionable condition.

### NotificationDelivery
Represents a delivery attempt through a channel. Alert state and delivery state are separate.

### Integration
Represents an external-provider connection and lifecycle. Credentials/secrets are referenced through secure infrastructure and are not stored as arbitrary JSON in the domain model.

### ImportRun / ExternalReference
Tracks external imports and their provenance so third-party data does not write directly into canonical inventory without normalization and reconciliation semantics.

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
                                │       └── as-of/cutoff ──> reconciliation adjustment InventoryMovement
                                │                              ├── optional ──> StockItem
                                │                              └── placement ─> StorageLocation/Compartment
                                ├──< Preparation ──< PreparationInput ──< InventoryMovement >── StockItem
                                │              └──< PreparationOutput ──< InventoryMovement ──> StockItem
                                ├──< ShoppingList ──< ShoppingListItem ──> Product XOR IngredientConcept
                                │                              └──< fulfillment >── PurchaseItem
                                └──< HouseholdProductPolicy >── Product

IngredientConcept ──< RecipeIngredient >── Recipe
        │
        ├──< ShelfLifeRule
        └──< controlled compatibility >── Product

Product ──< ProductIdentifier
        ├──< ShelfLifeRule
        ├──> ProductCategory
        └── measurement/catalog metadata

ShelfLifeRule ── scoped applicability / deterministic as-of selection ──> Product | IngredientConcept | governed classification
StockItem ──< EffectiveExpiration ── provenance ──> SourceExpirationFact / ShelfLifeRule version(s)
```

`StorageLocation XOR Compartment` means one stored StockItem has one placement anchor, not two competing placement truths. Explicitly unplaced StockItems are the governed exception.

## 13. Explicitly rejected conflations from earlier drafts

The canonical model rejects these conflations:

- global `User.role` as household authority;
- Batch as both manufacturing lot and physical inventory position;
- Batch as a mandatory bridge between StockItem and Product or source expiration;
- Product as owner of a single current price;
- unitless purchased, counted, prepared-input, prepared-output, replenishment-policy or shopping quantities;
- Purchase as proof that stock physically entered inventory;
- Receipt without line-level received-quantity, inventory-entry provenance and quantity conservation;
- InventoryCountItem without explicit counted-subject identity;
- inventory reconciliation without a captured physical-count as-of/ledger cutoff;
- InventoryTransfer without same-Product and quantity-conservation semantics;
- PreparationInput without authoritative decrement provenance and quantity conservation;
- PreparationOutput without explicit quantity/unit, authoritative movement provenance and quantity conservation;
- ShoppingListItem without a canonical subject and measurable requested amount;
- ambiguous StockItem placement with conflicting location/compartment truths;
- ShelfLifeRule without explicit applicability, deterministic precedence and a stable as-of evaluation anchor;
- EffectiveExpiration without deterministic candidate-combination semantics;
- RecipeIngredient pointing to a physical Batch or StockItem;
- RecipeIngredient being permanently tied to one commercial SKU when a semantic IngredientConcept is sufficient;
- Recipe pointing to one concrete destination StorageLocation;
- relative shelf life represented as a calendar date;
- expiration automatically meaning disposal;
- household physical structure duplicated inside JSON configuration;
- one mutable `quantity_current` value as the only source of inventory truth;
- audit log as a substitute for inventory/domain history.
