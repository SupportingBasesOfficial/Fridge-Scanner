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

A committed ReceiptItem must retain traceable linkage to the inventory entry effect(s) that materialize what physically entered stock, including resulting StockItem/Batch provenance as applicable. One PurchaseItem may therefore be fulfilled by multiple ReceiptItems over time, and one ReceiptItem may produce multiple inventory entry effects when batch, placement or other identity-affecting state requires a split.

## 5. Inventory

### Batch
Represents optional manufacturer/commercial batch provenance and batch-level facts such as manufacturer lot code, production date and original expiration when known. A Batch belongs to exactly one Product. Absence of known batch information must not require fabrication of a synthetic manufacturer batch.

### StockItem
Represents a concrete inventory holding under a Household. It is the inventory unit of record and may aggregate measurable quantity only while identity-affecting state remains coherent.

Every StockItem identifies exactly one Product directly. A StockItem may additionally reference a Batch when batch provenance is known; if present, that Batch must belong to the same Product as the StockItem. Batch is therefore optional provenance, never the only path from inventory to Product identity.

A stored StockItem has exactly one placement anchor: either one Compartment or one StorageLocation directly. If the anchor is a Compartment, its parent StorageLocation is authoritative and must belong to the same Household. A StockItem may be temporarily unplaced only when that condition is represented explicitly. It must be splittable when part of its quantity acquires materially different placement, package state, shelf-life state, reservation/hold state or provenance requirements.

A Batch must not be used as the physical-location record.

### InventoryMovement
Represents an immutable committed stock delta/event such as receipt, consumption, waste, transfer, adjustment, preparation input, preparation output, donation or return. Corrections are additional compensating/adjustment movements rather than mutation of committed movement history.

### InventoryTransfer
Represents one atomic business transfer identity backed by linked source-decrement and destination-increment ledger effects. In the initial domain, both ends must resolve to the same Household. Transfer semantics move quantity between placement-coherent StockItems and preserve lineage between source and destination effects.

### InventoryBalance
Represents a projection/materialized balance when needed for efficient reads. It must be derivable or reconcilable from authoritative inventory history and must not silently contradict that history. Committed authoritative inventory must not become negative under the accepted DB-00 policy.

### InventoryCount
Represents a physical inventory/counting session scoped to one Household and optionally to a defined counting area such as a StorageLocation or Compartment.

### InventoryCountItem
Represents one observed count line. It must identify the counted Product, observed quantity and MeasurementUnit, plus the observed placement when placement is part of the counting context. It may reference an existing StockItem when the observed stock can be matched unambiguously; that reference is optional because physical counting must also represent newly discovered stock that has no prior StockItem.

When an InventoryCountItem matches an existing StockItem, product and placement semantics must be compatible with that StockItem. When no existing StockItem matches, the count line still carries enough Product/placement/measurement identity to support an explicit reconciliation outcome that can create canonical inventory rather than silently mutating or inventing history.

## 6. Food lifecycle and shelf life

### ShelfLifeRule
Represents a versioned rule such as "N days after opening", "N days after preparation", or a rule conditional on storage state. A relative shelf life is a duration/rule, not a calendar date.

Every ShelfLifeRule has an explicit applicability scope. Rules may target a specific Product, an IngredientConcept, or another governed classification introduced later; broader scopes must not override a more specific applicable rule accidentally. Applicability may include trigger/event type, storage condition/category and other explicit predicates required by the rule.

When multiple rules are applicable, selection must be deterministic through governed precedence semantics: exact Product scope outranks broader IngredientConcept/classification scope; within the same specificity, an explicit priority and version/effective interval resolve ordering. Conflicting equally specific rules with the same effective priority must be rejected or surfaced for governance rather than selected arbitrarily.

### FoodLifecycleEvent
Represents meaningful state-changing facts such as opened, frozen, thawed, prepared or other conservation events that may influence effective shelf life.

### EffectiveExpiration
An explainable materialized projection for a concrete StockItem. Authoritative truth remains the applicable source expiration facts, lifecycle/storage facts and versioned shelf-life rules. The materialized value must be invalidatable and deterministically recomputable when authoritative inputs change, and it must retain enough provenance to explain why the effective expiration was chosen, including which ShelfLifeRule version(s) participated in selection.

Expiration is a state/condition. Disposal is a separate physical action and must not be inferred as having occurred merely because time passed.

## 7. Recipes and preparations

### Recipe
Reusable preparation definition. A Recipe is not tied to a physical stock batch or household storage location.

### RecipeIngredient
Defines an `IngredientConcept`, quantity, unit and optional constraints for a Recipe. It does not reference concrete stock. An exact Product constraint is permitted only when the recipe genuinely requires a specific product.

### Preparation
Concrete execution of a Recipe or ad-hoc preparation inside a Household.

### PreparationInput
References the concrete StockItem(s) and quantities consumed by a Preparation.

### PreparationOutput
Represents food produced by a Preparation and links that output to resulting inventory so lineage is retained.

This separation creates the invariant: recipe = definition; preparation = execution.

## 8. Waste and disposal

### WasteRecord
Provides waste-specific semantics such as reason and classification when a stock-reducing movement represents waste/disposal.

The authoritative quantity change remains linked to inventory movement semantics so stock cannot have multiple unrelated truths.

## 9. Planning and replenishment

### HouseholdProductPolicy
Stores household/product-specific policy such as minimum desired stock or preferred storage defaults.

### ShoppingList
Represents future purchase intent and is distinct from Purchase, which represents an acquisition transaction.

### ShoppingListItem
Represents desired items and can originate from manual input, policy, recipe planning or future automation.

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
                                │       ├── placement ────────> StorageLocation XOR Compartment
                                │       ├──< InventoryMovement
                                │       ├──< FoodLifecycleEvent
                                │       └── EffectiveExpiration
                                ├──< InventoryTransfer
                                ├──< InventoryCount ──< InventoryCountItem ──> Product
                                │                              ├── optional ──> StockItem
                                │                              └── placement ─> StorageLocation/Compartment
                                ├──< Preparation ──< PreparationInput >── StockItem
                                │              └──< PreparationOutput ──> StockItem
                                ├──< ShoppingList ──< ShoppingListItem
                                └──< HouseholdProductPolicy >── Product

IngredientConcept ──< RecipeIngredient >── Recipe
        │
        ├──< ShelfLifeRule
        └──< controlled compatibility >── Product

Product ──< ProductIdentifier
        ├──< ShelfLifeRule
        ├──> ProductCategory
        └── measurement/catalog metadata

ShelfLifeRule ── scoped applicability / precedence ──> Product | IngredientConcept | governed classification
StockItem ──< EffectiveExpiration ── provenance ──> ShelfLifeRule version(s)
```

`StorageLocation XOR Compartment` means one stored StockItem has one placement anchor, not two competing placement truths. Explicitly unplaced StockItems are the governed exception.

## 13. Explicitly rejected conflations from earlier drafts

The canonical model rejects these conflations:

- global `User.role` as household authority;
- Batch as both manufacturing lot and physical inventory position;
- Batch as a mandatory bridge between StockItem and Product;
- Product as owner of a single current price;
- unitless purchased or counted quantities;
- Purchase as proof that stock physically entered inventory;
- Receipt without line-level received-quantity and inventory-entry provenance;
- InventoryCountItem without explicit counted-subject identity;
- ambiguous StockItem placement with conflicting location/compartment truths;
- ShelfLifeRule without explicit applicability and deterministic precedence;
- RecipeIngredient pointing to a physical Batch or StockItem;
- RecipeIngredient being permanently tied to one commercial SKU when a semantic IngredientConcept is sufficient;
- Recipe pointing to one concrete destination StorageLocation;
- relative shelf life represented as a calendar date;
- expiration automatically meaning disposal;
- household physical structure duplicated inside JSON configuration;
- one mutable `quantity_current` value as the only source of inventory truth;
- audit log as a substitute for inventory/domain history.
