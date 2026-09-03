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

DB-00: price is transaction-specific; category, identifiers and measurement semantics are explicit domain concepts; brand/manufacturer must not be accidentally conflated.

### Batch / lot
Earlier: `Lote` combined product batch, compartment, quantity, package state and expiration.

DB-00: Batch and StockItem are distinct concepts. Physical location and mutable lifecycle state belong to inventory holdings, not manufacturing batch identity.

### Stock quantity
Earlier: `quantidade_atual` was directly mutated by triggers/actions.

DB-00: durable inventory movement semantics are authoritative; current balance may be a projection/cache but must be reconcilable.

### Consumption / movement / disposal
Earlier: separate operational tables each mutated the current quantity.

DB-00: their stock effect is unified under inventory movement semantics while domain-specific detail may remain in dedicated records.

### Recipe ingredients
Earlier: RecipeIngredient referenced a concrete Batch.

DB-00: RecipeIngredient defines required ingredient/product; concrete stock is selected only during Preparation.

### Dynamic expiration
Earlier: absolute and relative expiration were represented as dates and Recipe contained a dynamic-expiration date.

DB-00: shelf-life rules, lifecycle triggers and concrete effective expiration are separate concepts.

### Household configuration JSON
Earlier: physical storage structure and active integrations could be duplicated inside JSON configuration.

DB-00: canonical structure remains relational. JSON may be used only for non-authoritative extensible metadata where justified.

### Automated expiration job
Earlier: expired lots could be moved automatically to disposal.

DB-00: expiration may be detected and alerted automatically, but disposal is a physical action and is not fabricated by time passage alone.

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

- ProductIdentifier for scanner/barcode/GTIN and future identification sources;
- MeasurementUnit and dimensional semantics;
- Receiving distinct from Purchase;
- StockItem distinct from Batch;
- InventoryMovement and reconcilable balances;
- InventoryCount and explicit reconciliation;
- FoodLifecycleEvent and ShelfLifeRule;
- Preparation, PreparationInput and PreparationOutput;
- food lineage/provenance;
- HouseholdProductPolicy and ShoppingList;
- idempotency, concurrency and cross-household isolation invariants;
- source/provenance and distinct occurrence/recording time;
- integration normalization/import lifecycle;
- Outbox as a possible durable async publication boundary.

## Status of earlier DDL

The earlier DDL is **superseded as a production schema**. It may be used as historical input only. No migration should be generated from it directly.
