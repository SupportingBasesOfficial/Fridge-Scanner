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
9. A Product may have zero, one or many identifiers. Every ProductIdentifier must carry an explicit scheme/type and the issuer/namespace required by that scheme. Identifier uniqueness and resolution are scoped by `(scheme, issuer/namespace, normalized value)`, except where the scheme itself defines a single governed global namespace. Non-global identifiers from different issuers must not collide or resolve ambiguously.
10. Price is transaction/context-specific. Product must not hold a single authoritative current unit price. Every authoritative monetary amount must carry explicit currency and exact money semantics; binary floating point is not authoritative for money. Cross-currency comparison/conversion requires explicit rate/source and conversion time/context, and silent currency conversion is forbidden.
11. Quantities must have valid measurement semantics; every purchased, received, moved, consumed, counted, prepared-input, prepared-output, replenishment-policy, shopping or recipe quantity that participates in reconciliation/comparison must carry or resolve an explicit MeasurementUnit. Incompatible dimensions cannot be converted without an explicit product/ingredient-specific rule where required.

## Batch and stock identity

12. Batch identity and physical stock identity are distinct. Every StockItem identifies exactly one Product directly; Batch association is optional provenance and must never be required merely to obtain Product identity.
13. Multiple StockItems may originate from the same Batch while having different placements, package states, lifecycle events or effective expiry. If a StockItem references a Batch, that Batch must belong to the same Product as the StockItem.
14. Moving a StockItem must not mutate the manufacturing/commercial identity of its Batch, and absence of known manufacturer batch information must not be represented by fabricated batch identity. A source expiration observed for a concrete StockItem/package must remain representable independently of Batch identity.

## Inventory truth

15. Business-significant stock changes must be represented by durable inventory movement semantics. Any business operation that redistributes one conserved quantity across multiple movement effects must preserve Product identity and exact total quantity after valid dimension-safe conversion unless that operation is explicitly a transformation with separately modeled inputs and outputs.
16. A materialized/current balance may exist for performance, but it must be reconcilable with authoritative stock history.
17. Stock-changing commands must define atomic concurrency behavior so two valid concurrent actions cannot silently produce an invalid balance. Inventory reconciliation must use a captured physical-observation/ledger as-of point and concurrency semantics that preserve all movements committed after that cutoff rather than overwriting or double-accounting for them.
18. Retrying an idempotent stock-changing command with the same identity must not apply the quantity delta twice.
19. Committed historical movement records are immutable for business truth; corrections are represented by explicit compensating/adjustment semantics rather than rewriting committed history.
20. Physical inventory reconciliation must create an explicit adjustment or equivalent auditable outcome rather than silently overwriting history. Every InventoryCount records an authoritative physical observation time and a corresponding ledger cutoff/as-of point. Each InventoryCountItem must identify the counted Product, observed quantity and MeasurementUnit, plus placement when relevant to the count scope. It may reference an existing StockItem when matched, but unmatched newly discovered physical stock must remain representable without fabricating an existing StockItem. The adjustment must be computed against the captured as-of state, link back to the count line and its cutoff, and preserve intervening committed movements. If multiple state-distinct StockItems are compatible with an aggregate observation and the affected holding(s) cannot be determined, the discrepancy must remain unresolved/staged or be recounted at sufficient granularity; arbitrary allocation across batch, expiration, package/lifecycle or provenance-distinct holdings is forbidden. If the as-of state or deterministic allocation cannot be established safely, the system must block or escalate rather than guess.

## Purchase and receiving

21. A Purchase represents acquisition/commercial intent or transaction; Receipt represents physical entry into inventory.
22. A simple workflow may create Purchase and Receipt together, but purchased and received quantities must remain independently reconcilable at line level. Each PurchaseItem must identify its Product, quantity and MeasurementUnit and its monetary facts must preserve explicit currency. Each committed ReceiptItem must identify the received Product, quantity and MeasurementUnit, link to its source PurchaseItem when applicable, and retain traceable linkage to the inventory entry effect(s) that materialized the receipt. Every linked entry effect must represent that same Product, and the sum of committed linked entry quantities after valid dimension-safe conversion must equal exactly the ReceiptItem quantity. A legitimate ad-hoc Receipt may omit PurchaseItem provenance, but it must not omit inventory-entry provenance or quantity conservation.

## Recipes and preparation

23. A Recipe is a reusable definition and must not depend on a concrete physical Batch or StockItem.
24. A RecipeIngredient describes what is required; a PreparationInput records which concrete stock fulfilled that requirement. Each PreparationInput must identify its source StockItem, Product, consumed quantity and MeasurementUnit and retain traceable linkage to the authoritative preparation-input InventoryMovement decrement effect(s). Those effects must represent the same Product, resolve to the referenced StockItem or governed split lineage, and sum exactly to the PreparationInput quantity after valid dimension-safe conversion.
25. A Preparation is a concrete household-scoped execution.
26. Food produced by a Preparation must be representable as inventory output when it remains available for later storage, consumption, waste or further preparation. Each PreparationOutput must identify its Product, quantity and MeasurementUnit and retain traceable linkage to the authoritative preparation-output InventoryMovement effect(s) that materialized the output. Those effects must represent the same Product and sum exactly to the PreparationOutput quantity after valid dimension-safe conversion.
27. Preparation lineage must be preservable from output back to consumed inputs through durable provenance. Current StockItem balance alone is insufficient lineage when inputs/outputs are split, merged or later mutated by additional movements.

## Shelf life and food lifecycle

28. Relative shelf life is a rule/duration triggered by an event; it is not stored as if it were an absolute calendar date. An authoritative source expiration may exist at StockItem/package level even when no Batch is known, and its original precision/semantics and provenance must be preserved.
29. Effective expiration of a concrete StockItem must be explainable from source expiration and applicable lifecycle/storage rules. Every ShelfLifeRule must have explicit governed applicability and version/effective-interval semantics, and rule selection must be deterministic: more specific scope outranks broader scope, then explicit priority resolves ordering. Version/effective-interval selection is evaluated as of the domain occurrence time of the fact that activates the rule: the triggering lifecycle event for event-driven rules, or the authoritative stock-entry occurrence time for stock-entry/default rules. Recalculation must reuse that same evaluation anchor rather than current/recalculation time. Equally specific conflicting rules with the same effective priority at that evaluation time must be rejected or surfaced for governance rather than chosen arbitrarily. Applicable source and rule-derived deadlines form a candidate set; unless a future explicitly governed semantic-class rule defines otherwise, the effective operational expiration is the earliest applicable candidate, so no later candidate may extend an earlier authoritative deadline. Date-only or unequal-precision candidates require an explicit comparison/timezone policy; precision must not be silently invented. Any storage/conservation fact allowed to influence shelf-life must come from canonical placement/state or a trusted observation with occurrence time and provenance; uncertain sensor/heuristic evidence must not silently rewrite authoritative shelf-life inputs. EffectiveExpiration must retain provenance to the candidate set, source expiration fact(s), evaluation anchor, selected ShelfLifeRule version(s), storage/conservation inputs and combination result.
30. Opening, freezing, thawing, preparing or other lifecycle changes may alter shelf-life semantics without changing Product identity.
31. Expiration does not prove physical disposal.
32. A scheduled job may detect/flag expiration and create alerts, but it must not assert that food was physically discarded without an explicit domain action or trusted external evidence.

## Audit, provenance and time

33. Domain occurrence time and system recording time are distinct where delayed/offline recording is possible. Physical inventory counts and any other delayed reconciliation workflow must preserve the domain occurrence/as-of point required to evaluate historical state correctly.
34. Important external or automated observations/mutations must retain source/provenance such as user action, barcode scan, vision result, import, automation or system process. Heuristic or untrusted identification output — including vision/scanner candidates — is evidence/proposal, not canonical Product, StockItem or inventory truth by itself; canonicalization requires governed matching/review/reconciliation appropriate to confidence and ambiguity.
35. AuditEvent is not a replacement for inventory movement history, domain events, application logs or security telemetry.
36. Auditable actions must be attributable to an actor or trusted system principal and to the relevant Household/context when applicable.

## Configuration and integrations

37. Canonical relational household/storage structure must not be duplicated as an authoritative JSON configuration document.
38. Integration credentials and secrets must not be stored as arbitrary domain JSON or returned to clients.
39. External imports must pass through normalization/matching/reconciliation semantics before becoming canonical inventory state when duplication or ambiguity is possible. Imported identifiers and monetary values must preserve their source namespace/issuer and currency/conversion provenance rather than being normalized into ambiguous values.

## Deletion and lifecycle

40. Deletion/archival rules must preserve required financial, inventory, lineage and audit history. Referential history must not be destroyed merely to make an entity disappear from normal UI views.

## System-wide rule

41. No implementation convenience — ORM behavior, frontend state, trigger, scheduled job, cache, external integration or deployment topology — may override these invariants. If an implementation cannot preserve an invariant, the implementation must change or the invariant must be explicitly revisited through governance.

## Planning and replenishment corollary

A measurable HouseholdProductPolicy threshold, including minimum desired stock, must carry or resolve a MeasurementUnit and may be compared with inventory only through accepted dimension-safe conversion semantics. A resolved ShoppingListItem must target exactly one canonical subject — Product or IngredientConcept — and carry requested quantity and MeasurementUnit. Free text may be retained as unresolved input/provenance but must not silently serve as canonical fulfillment identity.

Fulfillment must be represented as explicit quantity allocation from PurchaseItem to ShoppingListItem. Product-targeted intent accepts only the exact Product; IngredientConcept-targeted intent accepts only Products satisfying the governed compatibility relationship. Allocated quantities must reconcile under accepted unit conversion, must not exceed the source PurchaseItem quantity available after its other allocations, and must not be double-counted across shopping lines. Partial, full, over-fulfillment, substitution and tolerance semantics must be explicit; a line must not be marked fully fulfilled merely because a related PurchaseItem exists.