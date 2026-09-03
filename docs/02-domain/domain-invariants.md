# FridgeScanner — Domain Invariants

## Status

DB-00 normative invariants. Later database, API, backend, frontend, jobs and integrations must preserve these rules.

## Identity and authorization

1. Household-scoped authority is granted through HouseholdMembership, not through a single global household role on User.
2. Every household-scoped operation must re-establish that the actor is authorized for the target Household.
3. A client-provided household identifier is context, never proof of authorization.
4. An entity owned by Household A must never be attached, moved or mutated through an entity owned by Household B unless a future explicit cross-household workflow defines both authorization and transfer semantics.

## Storage topology

5. Every Compartment belongs to exactly one StorageLocation; every StorageLocation belongs to exactly one Household.
6. Every stored StockItem has exactly one placement anchor: either one Compartment or one StorageLocation directly. If anchored to a Compartment, the parent StorageLocation is authoritative; competing direct location truth is forbidden. A StockItem may be temporarily unplaced only through an explicit governed state, and every resolved placement must belong to the same Household that owns the StockItem.
7. Occupancy labels such as full/almost-full/empty are projections or observations; they must not silently become a second authoritative inventory ledger.

## Product catalog and identifiers

8. Product identity is independent of household stock, purchase price and storage location.
9. A Product may have zero, one or many identifiers, and identifier type must be explicit.
10. Price is transaction/context-specific. Product must not hold a single authoritative current unit price.
11. Quantities must have valid measurement semantics; every purchased, received, moved, consumed, counted, prepared-output, shopping or recipe quantity that participates in reconciliation must carry or resolve an explicit MeasurementUnit. Incompatible dimensions cannot be converted without an explicit product/ingredient-specific rule where required.

## Batch and stock identity

12. Batch identity and physical stock identity are distinct. Every StockItem identifies exactly one Product directly; Batch association is optional provenance and must never be required merely to obtain Product identity.
13. Multiple StockItems may originate from the same Batch while having different placements, package states, lifecycle events or effective expiry. If a StockItem references a Batch, that Batch must belong to the same Product as the StockItem.
14. Moving a StockItem must not mutate the manufacturing/commercial identity of its Batch, and absence of known manufacturer batch information must not be represented by fabricated batch identity. A source expiration observed for a concrete StockItem/package must remain representable independently of Batch identity.

## Inventory truth

15. Business-significant stock changes must be represented by durable inventory movement semantics.
16. A materialized/current balance may exist for performance, but it must be reconcilable with authoritative stock history.
17. Stock-changing commands must define atomic concurrency behavior so two valid concurrent actions cannot silently produce an invalid balance.
18. Retrying an idempotent stock-changing command with the same identity must not apply the quantity delta twice.
19. Committed historical movement records are immutable for business truth; corrections are represented by explicit compensating/adjustment semantics rather than rewriting committed history.
20. Physical inventory reconciliation must create an explicit adjustment or equivalent auditable outcome rather than silently overwriting history. Each InventoryCountItem must identify the counted Product, observed quantity and MeasurementUnit, plus placement when relevant to the count scope. It may reference an existing StockItem when matched, but unmatched newly discovered physical stock must remain representable without fabricating an existing StockItem; the count line must still carry enough subject identity to produce a deterministic reconciliation outcome.

## Purchase and receiving

21. A Purchase represents acquisition/commercial intent or transaction; Receipt represents physical entry into inventory.
22. A simple workflow may create Purchase and Receipt together, but purchased and received quantities must remain independently reconcilable at line level. Each PurchaseItem must identify its Product, quantity and MeasurementUnit. Each committed ReceiptItem must identify the received Product, quantity and MeasurementUnit, link to its source PurchaseItem when applicable, and retain traceable linkage to the inventory entry effect(s) that materialized the receipt. A legitimate ad-hoc Receipt may omit PurchaseItem provenance, but it must not omit inventory-entry provenance.

## Recipes and preparation

23. A Recipe is a reusable definition and must not depend on a concrete physical Batch or StockItem.
24. A RecipeIngredient describes what is required; a PreparationInput records which concrete stock fulfilled that requirement.
25. A Preparation is a concrete household-scoped execution.
26. Food produced by a Preparation must be representable as inventory output when it remains available for later storage, consumption, waste or further preparation. Each PreparationOutput must identify its Product, quantity and MeasurementUnit and retain traceable linkage to the authoritative preparation-output InventoryMovement effect(s) that materialized the output.
27. Preparation lineage must be preservable from output back to consumed inputs through durable provenance. Current StockItem balance alone is insufficient lineage when outputs are split, merged or later mutated by additional movements.

## Shelf life and food lifecycle

28. Relative shelf life is a rule/duration triggered by an event; it is not stored as if it were an absolute calendar date. An authoritative source expiration may exist at StockItem/package level even when no Batch is known, and its original precision/semantics and provenance must be preserved.
29. Effective expiration of a concrete StockItem must be explainable from source expiration and applicable lifecycle/storage rules. Every ShelfLifeRule must have explicit governed applicability and version/effective-interval semantics, and rule selection must be deterministic: more specific scope outranks broader scope, then explicit priority resolves ordering. Version/effective-interval selection is evaluated as of the domain occurrence time of the fact that activates the rule: the triggering lifecycle event for event-driven rules, or the authoritative stock-entry occurrence time for stock-entry/default rules. Recalculation must reuse that same evaluation anchor rather than current/recalculation time. Equally specific conflicting rules with the same effective priority at that evaluation time must be rejected or surfaced for governance rather than chosen arbitrarily. EffectiveExpiration must retain provenance to its source expiration fact(s), evaluation anchor and selected ShelfLifeRule version(s).
30. Opening, freezing, thawing, preparing or other lifecycle changes may alter shelf-life semantics without changing Product identity.
31. Expiration does not prove physical disposal.
32. A scheduled job may detect/flag expiration and create alerts, but it must not assert that food was physically discarded without an explicit domain action or trusted external evidence.

## Audit, provenance and time

33. Domain occurrence time and system recording time are distinct where delayed/offline recording is possible.
34. Important external or automated mutations must retain source/provenance such as user action, barcode scan, vision result, import, automation or system process.
35. AuditEvent is not a replacement for inventory movement history, domain events, application logs or security telemetry.
36. Auditable actions must be attributable to an actor or trusted system principal and to the relevant Household/context when applicable.

## Configuration and integrations

37. Canonical relational household/storage structure must not be duplicated as an authoritative JSON configuration document.
38. Integration credentials and secrets must not be stored as arbitrary domain JSON or returned to clients.
39. External imports must pass through normalization/matching/reconciliation semantics before becoming canonical inventory state when duplication or ambiguity is possible.

## Deletion and lifecycle

40. Deletion/archival rules must preserve required financial, inventory, lineage and audit history. Referential history must not be destroyed merely to make an entity disappear from normal UI views.

## System-wide rule

41. No implementation convenience — ORM behavior, frontend state, trigger, scheduled job, cache, external integration or deployment topology — may override these invariants. If an implementation cannot preserve an invariant, the implementation must change or the invariant must be explicitly revisited through governance.

## Planning and replenishment corollary

A resolved ShoppingListItem must target exactly one canonical subject — Product or IngredientConcept — and carry requested quantity and MeasurementUnit. Free text may be retained as unresolved input/provenance but must not silently serve as canonical fulfillment identity. Fulfillment may link to one or more PurchaseItems so requested and acquired quantities remain traceable.
