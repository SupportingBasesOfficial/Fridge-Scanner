# FridgeScanner — DB-00 Decisions

## Status

Proposed canonical decisions for DB-00. These decisions close the conceptual ambiguities required before DB-01 logical modeling. They remain subject to exact-HEAD review before merge.

## D-001 — StockItem uses state-coherent aggregate identity

**Decision:** a StockItem is the inventory unit of record, not necessarily one physical package. It may represent an aggregate measurable quantity only while all identity-affecting state is coherent.

A StockItem must be split when part of its quantity acquires materially different state, including location, package/open state, shelf-life trigger/effective expiry, reservation/hold state, provenance requirements or other lifecycle facts that must be tracked independently.

Two StockItems may be merged only when their merge cannot erase required lineage/audit meaning and all attributes that affect lifecycle, ownership, measurement and storage semantics are compatible.

This avoids one-row-per-grain over-modeling while preserving physical truth whenever state diverges.

## D-002 — RecipeIngredient targets IngredientConcept, not commercial stock

**Decision:** introduce `IngredientConcept` as the recipe-facing abstraction. `RecipeIngredient` references an IngredientConcept plus quantity/unit and optional constraints.

`Product` remains the catalog/SKU-facing concept. A controlled compatibility mapping determines which Products can satisfy an IngredientConcept. A recipe may optionally impose an exact-product constraint when the recipe genuinely requires it.

This prevents generic recipes such as "milk" from being tied to one barcode/SKU while avoiding uncontrolled free-text ingredient matching.

## D-003 — Measurement conversion is dimension-safe and context-aware

**Decision:** MeasurementUnit belongs to an explicit dimension such as MASS, VOLUME or COUNT. Conversions inside the same dimension use canonical unit conversion rules.

Cross-dimension conversion is forbidden unless an explicit product/ingredient conversion profile provides the necessary context, for example density or package-equivalence semantics.

Package-to-quantity relationships such as "1 package = 500 g" are product/package facts, not universal unit conversions. Any measurable operational or policy quantity that is compared, reconciled or conserved must carry or resolve a MeasurementUnit.

## D-004 — Effective expiration is a materialized, explainable projection

**Decision:** authoritative shelf-life truth consists of source expiration facts, lifecycle events, storage facts and versioned shelf-life rules. A concrete `effective_expiration_at` may be materialized for efficient queries/alerts.

Source expiration must be representable at the concrete StockItem/package level even when no manufacturer Batch is known. Rule-version selection is anchored to the domain occurrence time of the fact that activates the rule, and recomputation must reuse that same anchor rather than current time.

Applicable source expirations and rule-derived deadlines form an explicit candidate set. Unless a future governed semantic-class rule defines a different composition, the effective operational expiration is the earliest applicable candidate: a later candidate may not extend an earlier authoritative deadline. Date-only or unequal-precision candidates must be compared under an explicit precision/timezone policy rather than by silently inventing precision.

The materialized value must be recomputable and must retain provenance sufficient to explain the candidate set, selected rule versions, evaluation anchor and final combination result. Changing an authoritative input must invalidate/recalculate the projection deterministically.

The projection must never become an unexplained second source of truth.

## D-005 — Authoritative inventory cannot become negative

**Decision:** committed authoritative inventory balances must not become negative through ordinary operations or reconciliation.

Physical discrepancies are represented through InventoryCount plus explicit adjustment semantics. Imports or integrations with incomplete/contradictory data remain in staging/reconciliation state until they can be committed without fabricating negative stock.

If a future business case truly requires negative inventory, it requires an explicit domain decision rather than an accidental relaxation of constraints.

## D-006 — Transfer is one domain operation backed by paired ledger movements

**Decision:** a stock transfer is represented as one atomic `InventoryTransfer` domain operation with one transfer identity and two linked ledger effects: source decrement and destination increment.

Both effects commit atomically, represent the same Product, and conserve exactly the transferred quantity after valid dimension-safe conversion. A transfer may change placement and may split or merge compatible holdings, but it cannot silently transform Product identity or create/destroy quantity. Within the initial domain, source and destination must resolve to the same Household. A future cross-household transfer would be a distinct workflow requiring explicit authorization, ownership-transfer and receiving semantics.

This representation keeps balances easy to reconcile while preserving one business-level transfer identity and conservation law.

## D-007 — `Household` is canonical code/domain vocabulary

**Decision:** `Household` is the canonical architecture and code term for the primary domestic operational boundary. User interfaces may localize the label as `Casa` or another product-language term.

The domain term must not imply that physical street address is mandatory or that all future household-like scopes require a residential address.

## Consequence for DB-01

DB-01 may now model the relational entities and cardinalities using these decisions as constraints. It must not reopen these choices implicitly through table shape; any conflict must be raised explicitly as a governed decision.
