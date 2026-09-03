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

### Product
Canonical description of a food or packaged product. Product identity is independent from purchase price, household stock and physical location.

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
Represents what physically entered the household inventory. Purchase and receipt may occur atomically in simple flows, but they remain separate concepts because purchased quantity and received quantity can differ in time or amount.

## 5. Inventory

### Batch
Represents manufacturer/commercial batch identity and batch-level facts such as manufacturer lot code, production date and original expiration when known.

### StockItem
Represents a concrete inventory holding under a Household. It carries the state that may vary independently between items from the same Batch, such as storage position, package-open state and lifecycle timestamps.

A Batch must not be used as the physical-location record.

### InventoryMovement
Represents an immutable or append-oriented stock delta/event such as receipt, consumption, waste, transfer, adjustment, preparation input, preparation output, donation or return.

### InventoryBalance
Represents a projection/materialized balance when needed for efficient reads. It must be derivable or reconcilable from authoritative inventory history and must not silently contradict that history.

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
A computed or persisted projection for a concrete StockItem. It is derived from applicable source expiration and lifecycle rules. It must retain enough provenance to explain why the effective expiration was chosen.

Expiration is a state/condition. Disposal is a separate physical action and must not be inferred as having occurred merely because time passed.

## 7. Recipes and preparations

### Recipe
Reusable preparation definition. A Recipe is not tied to a physical stock batch or household storage location.

### RecipeIngredient
Defines required ingredient/product, quantity and unit for a Recipe.

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
                                ├──< Purchase ──< PurchaseItem
                                ├──< Receipt
                                ├──< StockItem >── Batch >── Product
                                │       │
                                │       ├──< InventoryMovement
                                │       ├──< FoodLifecycleEvent
                                │       └── EffectiveExpiration
                                ├──< InventoryCount ──< InventoryCountItem
                                ├──< Preparation ──< PreparationInput >── StockItem
                                │              └──< PreparationOutput ──> StockItem
                                ├──< ShoppingList ──< ShoppingListItem
                                └──< HouseholdProductPolicy >── Product

Product ──< ProductIdentifier
        ├──> ProductCategory
        └── measurement/catalog metadata

Recipe ──< RecipeIngredient >── Product/Ingredient concept
```

## 13. Explicitly rejected conflations from earlier drafts

The canonical model rejects these conflations:

- global `User.role` as household authority;
- Batch as both manufacturing lot and physical inventory position;
- Product as owner of a single current price;
- RecipeIngredient pointing to a physical Batch;
- Recipe pointing to one concrete destination StorageLocation;
- relative shelf life represented as a calendar date;
- expiration automatically meaning disposal;
- household physical structure duplicated inside JSON configuration;
- one mutable `quantity_current` value as the only source of inventory truth;
- audit log as a substitute for inventory/domain history.
