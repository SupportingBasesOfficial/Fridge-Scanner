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
Represents an item purchased, including transaction-specific quantity and price.

### Receipt / Receiving
Represents a physical receiving operation into a Household. Purchase and Receipt may occur atomically in simple flows, but they remain separate concepts because purchased and received quantities can differ in time or amount. A Receipt may also represent an acquisition with no prior Purchase record when the source workflow legitimately has no commercial order.

### ReceiptItem
Represents one received product/quantity/unit line inside a Receipt. When receipt originates from a Purchase, the ReceiptItem links to the relevant PurchaseItem so partial and incremental receiving can be reconciled at line level.

A committed ReceiptItem must retain traceable linkage to the inventory entry effect(s) that materialize what physically entered stock, including resulting StockItem/Batch provenance as applicable. One PurchaseItem may therefore be fulfilled by multiple ReceiptItems over time, and one ReceiptItem may produce multiple inventory entry effects when batch, location or other identity-affecting state requires a split.

## 5. Inventory

### Batch
Represents manufacturer/commercial batch identity and batch-level facts such as manufacturer lot code, production date and original expiration when known.

### StockItem
Represents a concrete inventory holding under a Household. It is the inventory unit of record and may aggregate measurable quantity only while identity-affecting state remains coherent. It carries state that may vary independently between holdings from the same Batch, such as storage position, package-open state and lifecycle timestamps.

A StockItem must be splittable when part of its quantity acquires materially different location, package state, shelf-life state, reservation/hold state or provenance requirements. A Batch must not be used as the physical-location record.

### InventoryMovement
Represents an immutable or append-oriented stock delta/event such as receipt, consumption, waste, transfer, adjustment, preparation input, preparation output, donation or return.

### InventoryTransfer
Represents one atomic business transfer identity backed by linked source-decrement and destination-increment ledger effects. In the initial domain, both ends must resolve to the same Household.

### InventoryBalance
Represents a projection/materialized balance when needed for efficient reads. It must be derivable or reconcilable from authoritative inventory history and must not silently contradict that history. Committed authoritative inventory must not become negative under the accepted DB-00 policy.

### InventoryCount
Represents a physical inventory/counting session.

### InventoryCountItem
Compares observed physical quantity with system quantity and is the basis for explicit reconciliation adjustments.

## 6. Food lifecycle and shelf life

### ShelfLifeRule
Represents a rule such as "N days after opening", "N days after preparation", or a rule conditional on storage state. A relative shelf life is a duration/rule, not a calendar date.

### FoodLifecycleEvent
Represents meaningful state-changing facts such as opened, frozen, thawed, prepared or other conservation events that may influence effective shelf life.

### EffectiveExpiration
An explainable materialized projection for a concrete StockItem. Authoritative truth remains the applicable source expiration facts, lifecycle/storage facts and versioned shelf-life rules. The materialized value must be invalidatable and deterministically recomputable when authoritative inputs change, and it must retain enough provenance to explain why the effective expiration was chosen.

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
                                ├──< Purchase ──< PurchaseItem ──< ReceiptItem
                                ├──< Receipt ──< ReceiptItem ──< InventoryMovement
                                │                         └──────> StockItem / Batch provenance
                                ├──< StockItem >── Batch >── Product
                                │       │
                                │       ├──< InventoryMovement
                                │       ├──< FoodLifecycleEvent
                                │       └── EffectiveExpiration
                                ├──< InventoryTransfer
                                ├──< InventoryCount ──< InventoryCountItem
                                ├──< Preparation ──< PreparationInput >── StockItem
                                │              └──< PreparationOutput ──> StockItem
                                ├──< ShoppingList ──< ShoppingListItem
                                └──< HouseholdProductPolicy >── Product

IngredientConcept ──< RecipeIngredient >── Recipe
        │
        └──< controlled compatibility >── Product

Product ──< ProductIdentifier
        ├──> ProductCategory
        └── measurement/catalog metadata
```

## 13. Explicitly rejected conflations from earlier drafts

The canonical model rejects these conflations:

- global `User.role` as household authority;
- Batch as both manufacturing lot and physical inventory position;
- Product as owner of a single current price;
- Purchase as proof that stock physically entered inventory;
- Receipt without line-level received-quantity and inventory-entry provenance;
- RecipeIngredient pointing to a physical Batch or StockItem;
- RecipeIngredient being permanently tied to one commercial SKU when a semantic IngredientConcept is sufficient;
- Recipe pointing to one concrete destination StorageLocation;
- relative shelf life represented as a calendar date;
- expiration automatically meaning disposal;
- household physical structure duplicated inside JSON configuration;
- one mutable `quantity_current` value as the only source of inventory truth;
- audit log as a substitute for inventory/domain history.
