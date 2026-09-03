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

A controlled compatibility relationship maps Products that may satisfy an IngredientConcept. Compatibility is governed, versioned domain data, not uncontrolled name matching. A recipe may impose an exact-product constraint when a specific commercial product is genuinely required.

### CompatibilityDecisionEvidence
Represents the exact compatibility decision used when a committed business fact treats a Product as satisfying an IngredientConcept. It preserves Product, IngredientConcept, compatibility mapping/rule identity and version, effective/evaluation time or context, relevant constraints, decision provenance and any approval required by policy.

Committed PreparationInputAllocation and ShoppingListFulfillment records that rely on IngredientConcept compatibility must retain or immutably reference the exact CompatibilityDecisionEvidence used at the decision point. Later changes to compatibility mappings affect future decisions or explicit correction workflows; they must not silently reinterpret historical allocations.

### Product
Canonical definition of a stockable food/product identity. A Product may represent a commercial packaged product, loose/unbranded food, a household-defined item, or a reusable identity for prepared food/output. Commercial metadata such as SKU, barcode, brand, manufacturer or Batch is optional and must not be required merely to create valid stock identity.

Every Product has explicit catalog governance. A globally governed/reusable Product has global catalog scope and no Household owner; ordinary Household members cannot mutate its canonical identity merely because their stock references it. A household-defined Product has Household catalog scope, belongs to exactly one owning Household, and its visibility/edit authority is constrained by that Household. A Household StockItem may reference a global Product or a Product owned by that same Household, but never a Product privately owned by another Household. Promotion, sharing, cloning or canonical merge between household-scoped and global catalog identities requires an explicit governed workflow and must preserve provenance rather than silently changing ownership or visibility.

Product identity is independent from purchase price, Household stock and physical location, but not from its catalog-governance scope. A Product may satisfy one or more IngredientConcepts according to controlled compatibility semantics. `Product` therefore does not mean “retail SKU”; it is the canonical stockable subject referenced directly by StockItem.

### ProductCategory
Classifies products and may form a hierarchy.

### ProductIdentifier
Maps a Product to one or more identifiers. Every identifier records an explicit scheme/type and the issuer/namespace required by that scheme. Globally governed schemes such as GTIN use their governed global namespace; non-global schemes such as retailer SKU, provider code, household/internal ID or locally scoped PLU must identify the issuing retailer/provider/Household or other governed namespace.

Identifier uniqueness is therefore evaluated within the canonical tuple `(scheme, issuer/namespace, normalized value)`, with issuer omitted only when the scheme itself defines a single global namespace. The same non-global value may legitimately exist under different issuers and must not resolve ambiguously across those namespaces.

### Brand / Manufacturer
Brand and manufacturer are distinct concepts and must not be conflated by the model, even if an initial physical implementation keeps one of them optional.

### MeasurementUnit
Defines units used by measurable quantities. Quantities must be dimensionally meaningful; mass, volume and count are not interchangeable without an explicit valid conversion rule.

### MeasurementConversionEvidence
Represents the exact conversion decision used when a committed business fact depends on a contextual, package-equivalence or cross-dimension conversion. It preserves source quantity/unit, target quantity/unit, the factor or formula inputs as exact rational values, the conversion profile/rule identity and version, its effective/evaluation context, and provenance sufficient to reproduce the result later. Authoritative quantities and committed conversion factors are finite exact rationals (a finite decimal is one valid encoding); a source estimate may retain uncertainty separately, but its committed operative value is still one explicit rational. The exact converted result is the rational product/quotient before presentation rounding.

All conservation, availability and reconciliation comparisons convert into a declared comparison unit and operate on those exact rational values. No implementation scale, binary floating point, rounded display value or per-allocation rounding may decide equality or create a residual. Persistence must retain a normalized numerator/denominator or an equivalent lossless representation capable of expressing a non-terminating decimal result such as one third. Rounding is permitted only for presentation or a separately governed non-conservation output; it never mutates the authoritative quantity. Therefore split allocations must sum exactly in rational arithmetic and any physical remainder remains an explicit quantity rather than a rounded-away residual.

A committed receipt, movement, reconciliation, preparation allocation, shopping fulfillment or other conserved/reconciled quantity must never be reinterpreted using whatever conversion profile happens to be current later. If its correctness depends on a contextual conversion, the committed fact retains or immutably references the exact MeasurementConversionEvidence used. Corrections to a conversion profile affect future decisions or explicit correction workflows; they do not silently rewrite historical conservation semantics.

### Money / Currency
Monetary values carry an exact amount and explicit currency. Binary floating-point representation is not authoritative money semantics. Monetary facts also carry an explicit semantic role when the business meaning differs — for example pricing-basis amount, line gross, line discount, line tax/charge or line net — so two numerically equal amounts are not treated as interchangeable facts. Cross-currency comparison or aggregation requires an explicit conversion rate/source and conversion time/context; the system must never silently treat numerically equal amounts in different currencies as equivalent.

## 4. Procurement and receiving

### Purchase
Represents a commercial transaction or acquisition record and establishes the transaction currency/context used by its monetary lines unless a source transaction explicitly models multiple currencies with preserved conversion provenance. Purchase-level discounts, taxes, fees or charges may remain Purchase-level facts when the source transaction does not allocate them to individual lines.

### PurchaseItem
Represents an item purchased, including Product, transaction-specific quantity, MeasurementUnit and explicit monetary-role facts. The quantity is never unitless; reconciliation may convert only under the accepted dimension-safe conversion rules.

A generic unlabeled `price` amount is not canonical. When a unit/basis price exists, it identifies the pricing-basis quantity and MeasurementUnit to which the amount applies. A PurchaseItem may additionally preserve `line_gross`, `line_discount`, `line_tax` or other governed line charges, and `line_net`, each as an exact Money value with explicit semantic role and provenance indicating whether the value came from the source transaction or was derived by the platform.

For the ordinary line equation, `line_gross` is the pre-discount, pre-tax/charge extended amount. When a unit/basis price exists, its unrounded extension is `basis-price amount × (purchased quantity expressed in the pricing-basis unit ÷ pricing-basis quantity)` using exact-rational quantity conversion; the governed currency scale/rounding policy is then applied once at the line-gross boundary. An authoritative `line_gross` must equal that computed extension under the preserved policy. A source value that does not reconcile is retained only with an explicit pricing discrepancy/exception recording source and computed amounts, quantity/conversion evidence, policy, reason and resolution status; it must not silently become ordinary gross or unit cost. `line_discount` is the total discount allocated to the line; `line_tax`/governed line charges are the total taxes/charges allocated to the line; and `line_net = line_gross - line_discount + line_tax/line-charges` under the same governed currency scale/rounding policy. If source-provided and derived values coexist, they must reconcile under that policy or retain an explicit discrepancy. Purchase-level discounts, taxes, fees or charges that are not source-allocated to a line must not be silently folded into PurchaseItem unit price or historical unit cost. Any later analytical/accounting allocation of Purchase-level amounts preserves allocation method, basis, rounding and provenance as derived facts without rewriting source transaction amounts.

If the pricing basis differs from the purchased quantity/unit, the relationship is reconciled only through accepted measurement-conversion semantics and preserves MeasurementConversionEvidence whenever contextual conversion is required. If an imported/source line is denominated differently from the Purchase transaction currency, both the source amount/currency and any normalized amount must preserve the explicit conversion rate/source and conversion time/context; silent conversion is forbidden.

### Receipt / Receiving
Represents a physical receiving operation into a Household. Purchase and Receipt may occur atomically in simple flows, but they remain separate concepts because purchased and received quantities can differ in time or amount. A Receipt may also represent an acquisition with no prior Purchase record when the source workflow legitimately has no commercial order.

### ReceiptItem
Represents one received Product/quantity/MeasurementUnit line inside a Receipt. When receipt originates from a Purchase, the ReceiptItem links to the relevant PurchaseItem so partial and incremental receiving can be reconciled at line level.

When a ReceiptItem references a PurchaseItem, both lines must identify the same Product. A received substitution must not masquerade as ordinary provenance to a different purchased Product: substitution requires an explicit governed exception/allocation that records the requested Product, received Product, substituted quantity/MeasurementUnit, reason/approval and provenance before it can reconcile against the PurchaseItem.

A committed ReceiptItem must retain traceable linkage to the inventory entry effect(s) that materialize what physically entered stock, including resulting StockItem/Batch provenance as applicable. Every linked entry effect must represent the same Product as the ReceiptItem, and the sum of the linked committed entry quantities, after valid dimension-safe conversion into one comparison unit, must equal exactly the committed ReceiptItem quantity. One PurchaseItem may therefore be fulfilled by multiple ReceiptItems over time, and one ReceiptItem may produce multiple inventory entry effects when batch, placement or other identity-affecting state requires a split; splitting may redistribute quantity but must neither create nor destroy it.

PurchaseItem allocations are separated by semantic dimension. Physical receiving reconciliation has one receipt availability pool: after exact rational dimension-safe conversion, ordinary same-Product ReceiptItem allocations plus governed substitution allocations against the PurchaseItem must not exceed its purchased quantity as normal receiving fulfillment. Partial receiving is valid. Quantity beyond the purchased amount, ordinary or substituted, is an explicit over-receipt discrepancy/exception with governed acceptance or correction; substitution never creates a second receipt allowance.

ShoppingListFulfillment uses a distinct shopping-intent attribution pool over the same PurchaseItem quantity. A unit may be counted once in the receipt pool and once in the shopping-intent pool because these answer different questions — what physically arrived versus which shopping intent the purchase satisfies. Within each pool, however, the PurchaseItem quantity may be allocated at most once after exact rational conversion: receipt/substitution allocations cannot double-count one another, and ShoppingListFulfillment allocations across shopping lines cannot double-count one another. Neither pool changes the other pool's availability or substitutes for its evidence.

## 5. Inventory

### Batch
Represents optional manufacturer/commercial batch provenance and batch-level facts such as manufacturer lot code, production date and original expiration when known. A Batch belongs to exactly one Product. Absence of known batch information must not require fabrication of a synthetic manufacturer batch.

### StockItem
Represents a concrete inventory holding under a Household. It is the inventory unit of record and may aggregate measurable quantity only while identity-affecting state remains coherent.

Every StockItem identifies exactly one Product directly. A StockItem may additionally reference a Batch when batch provenance is known; if present, that Batch must belong to the same Product as the StockItem. Batch is therefore optional provenance, never the only path from inventory to Product identity.

A stored StockItem has exactly one placement anchor: either one Compartment or one StorageLocation directly. If the anchor is a Compartment, its parent StorageLocation is authoritative and must belong to the same Household. A StockItem may be temporarily unplaced only when that condition is represented explicitly. It must be splittable when part of its quantity acquires materially different placement, package state, shelf-life state or provenance requirements. Future reservation/hold behavior, if introduced, must define its own governed semantics before it can become an identity-affecting StockItem state.

A Batch must not be used as the physical-location record.

### SourceExpirationFact
Represents an authoritative expiration or best-before fact observed for a concrete StockItem/package, independent of whether manufacturer Batch identity is known. It records the source value with its original precision/semantics and provenance, such as package label, ReceiptItem/import, user observation or trusted external source. It also preserves the authoritative domain occurrence time at which the fact became authoritative for that concrete StockItem/package — normally the source observation, import or receipt occurrence time — plus any more specific governed temporal context supplied by the source.

A SourceExpirationFact may reference a Batch when the fact is genuinely batch-level, but Batch is not required. Stock must never fabricate a Batch merely to retain a printed expiration date.

### InventoryMovement
Represents an immutable committed stock delta/event such as receipt, consumption, waste, transfer, adjustment, preparation input, preparation output, donation or return. Corrections are additional compensating/adjustment movements rather than mutation of committed movement history.

An InventoryMovement whose domain occurrence time can differ from its recording/commit time preserves both. This distinction is authoritative for historical reconciliation: late recording does not change when the physical/domain stock change actually occurred. When a movement affects placement-sensitive history, the movement effect preserves the immutable placement anchor applicable to that effect rather than relying on the StockItem's later mutable placement.

### InventoryTransfer
Represents one atomic business transfer identity backed by linked source-decrement and destination-increment ledger effects. In the initial domain, both ends must resolve to the same Household. Both effects must represent the same Product and conserve exactly the transferred quantity after valid dimension-safe conversion.

The source-decrement effect preserves the immutable source placement anchor and the destination-increment effect preserves the immutable destination placement anchor. The transfer/effects preserve authoritative domain occurrence time independently from recording/commit time when those may differ. Historical reconstruction therefore resolves where the quantity existed from immutable transfer/movement facts, never from whatever placement the StockItem has now.

A transfer may change current placement and may split or merge compatible holdings, but it must not silently transform one Product into another or create/destroy quantity. Transfer semantics preserve lineage between source and destination effects.

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
Represents a versioned rule such as "N days after opening", "N days after preparation", or a rule conditional on storage state. A relative shelf life is a governed duration rule, not a calendar date.

Every ShelfLifeRule has an explicit applicability scope. Rules may target a specific Product, an IngredientConcept, or another governed classification introduced later; broader scopes must not override a more specific applicable rule accidentally. Applicability includes a semantic trigger/deadline group identifying which rules are alternatives competing to produce the same kind of deadline for the same authoritative activation fact, plus trigger/event type, storage condition/category and other explicit predicates required by the rule.

Precedence is evaluated only among applicable rules inside the same semantic trigger/deadline group. Within such a competing group, exact Product scope outranks broader IngredientConcept/classification scope; within the same specificity, explicit priority resolves ordering. Rules activated by independent semantic facts or trigger groups — for example a stock-entry/default deadline and a later opening deadline — do not suppress one another merely because one has a more specific catalog scope. Each independent applicable group may contribute its own expiration candidate, after which candidate-combination semantics choose the operational deadline.

Version/effective-interval selection is evaluated as of the domain occurrence time of the authoritative fact that activates that rule group. For an event-triggered rule this is the triggering FoodLifecycleEvent occurrence time; for a stock-entry/default rule it is the authoritative stock-entry occurrence time; for a placement/storage-change rule it is the occurrence time of the authoritative InventoryMovement/InventoryTransfer or other canonical placement-state change that activated the storage predicate; and for a rule triggered by a trusted storage/conservation observation it is that observation's occurrence time. Recomputing later must reuse the same original evaluation anchor rather than current/recalculation time. Conflicting equally specific rules with the same effective priority inside one competing group at that evaluation time must be rejected or surfaced for governance rather than selected arbitrarily.

Every relative rule also preserves the temporal arithmetic necessary to derive one deterministic deadline: duration amount/unit, temporal basis (`ELAPSED` or `LOCAL_CALENDAR`), endpoint semantics, and the governed timezone/version context required for calendar arithmetic. `ELAPSED` arithmetic operates on the instant timeline: seconds, minutes and hours are exact elapsed durations, an elapsed day is exactly 24 hours and an elapsed week is exactly seven elapsed days; month/year units are invalid in elapsed mode. `LOCAL_CALENDAR` arithmetic adds calendar days/weeks/months/years in the governed IANA timezone anchored to the activation fact unless the rule preserves a more specific governed timezone context. It preserves the activation local wall-clock time unless the rule declares another endpoint. For month/year units, the full duration amount is applied to the original anchored local date using proleptic-Gregorian year/month arithmetic; the original day-of-month is retained when valid and otherwise clamps to the final valid day of the target month (for example, January 31 plus one month becomes February 28 or 29, and February 29 plus one year becomes February 28). The calculation must not iterate through intermediate clamped dates, so equivalent full-amount evaluation cannot drift by library behavior. After calendar-date resolution, a resulting time in a DST gap resolves to the first valid instant after the gap; an ambiguous overlap resolves to the earlier occurrence. End-of-local-day is the exclusive start of the following local calendar day. A deadline expires at the boundary and is valid strictly before it. Rules missing the temporal semantics needed to derive one instant are invalid and must not be published/applied.

### FoodLifecycleEvent
Represents meaningful state-changing facts such as opened, frozen, thawed, prepared or other conservation events that may influence effective shelf life.

### EffectiveExpiration
An explainable materialized projection for a concrete StockItem. Authoritative truth remains SourceExpirationFact records, applicable Batch source facts, lifecycle/storage facts and versioned shelf-life rules.

Each applicable authoritative input or independent ShelfLifeRule semantic group produces zero or more expiration candidates with preserved source semantics/provenance. Unless a future explicitly governed rule defines a different composition for a specific semantic class, the operational EffectiveExpiration is the earliest applicable candidate: source/package expiration and lifecycle-derived deadlines act as limiting upper bounds, so a later candidate must never extend an earlier authoritative deadline.

For candidate ordering, a source expiration expressed only as a calendar date preserves its original date-only precision as authoritative source data but is interpreted operationally as the end of that local calendar day in the canonical Household timezone applicable to the StockItem. If the source itself supplies an explicit timezone/offset or a governed external context requires one, that source context is preserved and used instead. When Household timezone is used, its exact governed version is selected as of the preserved domain occurrence time at which the relevant SourceExpirationFact became authoritative for the concrete StockItem/package — normally that fact's source observation/import/receipt occurrence time — unless a more specific governed source temporal context applies. Initial calculation and every recomputation reuse this same timezone-selection anchor; later Household timezone changes cannot reinterpret the historical date-only fact. Instant-valued candidates retain their exact instant. Comparisons normalize these operational instants without mutating or fabricating precision in the original source fact.

The materialized value must be invalidatable and deterministically recomputable when authoritative inputs change, and it must retain enough provenance to explain the candidate set, semantic trigger/deadline groups, group-local precedence decisions, combination result, rule evaluation anchor, relative-duration amount/unit/basis/endpoint/timezone context, the SourceExpirationFact occurrence/source anchor used for date-only timezone selection, the selected timezone version/context and ShelfLifeRule version(s) that participated in selection.

Expiration is a state/condition. Disposal is a separate physical action and must not be inferred as having occurred merely because time passed.

## 7. Recipes and preparations

### Recipe
Reusable preparation definition with explicit catalog governance. A Recipe has exactly one scope: a globally governed/reusable Recipe has no Household owner and ordinary Household authority cannot mutate it; a household-scoped Recipe belongs to exactly one owning Household and its visibility/edit authority is constrained to that Household. A Recipe is not tied to a physical stock batch or household storage location. Promotion, sharing or cloning across scopes is an explicit governed workflow that preserves provenance and never silently changes ownership or visibility. Changes to a reusable Recipe create a new immutable RecipeVersion or equivalent immutable snapshot for future executions rather than rewriting the definition used by committed Preparations.

### RecipeVersion
Represents an immutable execution-time snapshot/version of a Recipe, including the exact RecipeIngredient lines, quantities, units, ordering/identity and governed constraints applicable to that version. A RecipeVersion inherits the Recipe's scope and owner; it cannot widen visibility, edit authority or reference permissions independently. Historical Preparations reference this immutable version/snapshot so later Recipe edits cannot change past execution semantics.

### RecipeIngredient
Defines an `IngredientConcept`, quantity, unit and optional constraints for a Recipe version. It does not reference concrete stock. An exact Product constraint is permitted only when the recipe genuinely requires a specific product and the Product is visible within the Recipe's catalog scope: a global Recipe may constrain only a global Product, while a household-scoped Recipe may constrain a global Product or a Product owned by that same Household, never another Household's private Product. The same boundary applies to any other recipe metadata that directly references household-scoped catalog data.

### Preparation
Concrete execution of a Recipe or ad-hoc preparation inside a Household. A recipe-based Preparation may execute a globally governed RecipeVersion or a RecipeVersion owned by that same Household; it must never execute or infer visibility of another Household's private RecipeVersion. It references exactly one immutable RecipeVersion/snapshot and preserves the scaling/yield inputs/context used to derive effective requirements for that execution. An ad-hoc Preparation may omit Recipe/RecipeVersion provenance.

### PreparationInput
Represents one measurable stock input consumed by a Preparation. It identifies the concrete source StockItem, Product, consumed quantity and MeasurementUnit and must retain traceable linkage to the authoritative preparation-input InventoryMovement decrement effect(s).

Every linked input effect must represent the same Product as the PreparationInput and originate from the referenced StockItem or its governed split lineage. The sum of linked committed decrement quantities, after valid dimension-safe conversion, must equal exactly the PreparationInput quantity. A single input may therefore be materialized by multiple decrement effects only when lineage/state splitting requires it; splitting may redistribute the consumed quantity but must neither create nor destroy it.

### PreparationInputAllocation
For a Preparation that executes a Recipe, fulfillment of recipe requirements is represented explicitly by allocations from PreparationInput to the exact RecipeIngredient line in the referenced immutable RecipeVersion/snapshot. Each allocation identifies that exact line, allocated quantity and MeasurementUnit.

The allocated Product must satisfy the line's IngredientConcept and any exact-Product or other governed constraints effective for the Preparation. When compatibility rather than exact Product identity is used, the allocation preserves or immutably references the exact CompatibilityDecisionEvidence used at commit time. Later compatibility edits cannot invalidate or retroactively validate the committed allocation.

Multiple PreparationInputs may fulfill one RecipeIngredient and one PreparationInput may be allocated across more than one compatible RecipeIngredient when quantities require it. Allocations must reconcile through dimension-safe conversion and preserve enough identity to distinguish repeated or otherwise similar recipe lines.

For every recipe-based PreparationInput, source-side accounting must be exhaustive. After valid dimension-safe conversion into a comparison unit, the sum of all RecipeIngredient allocations sourced from that PreparationInput plus any explicitly classified non-recipe addition, process loss, waste or other governed deviation must equal exactly the committed PreparationInput quantity. An unallocated remainder is forbidden. A non-recipe classification preserves quantity, MeasurementUnit, reason/type and provenance/approval where policy requires it; it must not masquerade as fulfillment of a RecipeIngredient.

For each RecipeIngredient snapshot line, the Preparation preserves the effective required quantity after applying its governed recipe scaling/yield factor or other explicit quantity adjustment, including the scaling inputs/context used. The sum of compatible PreparationInputAllocation quantities targeting that exact immutable line must reconcile against the preserved effective requirement after valid conversion. Normal exact fulfillment must not exceed or underfill the requirement silently. If the preparation intentionally permits an underage, overage, tolerance or substitution, the deviation must be explicit and preserve the expected quantity, actual allocated quantity, MeasurementUnit, reason/policy and provenance/approval where required. Recipe requirement fulfillment is derived from these explicit historical allocations rather than inferred from current Recipe contents, ingredient names or current Product compatibility. Ad-hoc Preparations with no Recipe have no RecipeIngredient allocation requirement, but their PreparationInput quantities remain exactly conserved against their authoritative decrement effects.

### PreparationOutput
Represents one measurable food output produced by a Preparation. Each output identifies the resulting Product, quantity and MeasurementUnit and must retain traceable linkage to the authoritative preparation-output InventoryMovement effect(s) that materialize inventory.

Every linked output effect must represent the same Product as the PreparationOutput, and the sum of linked committed output quantities, after valid dimension-safe conversion, must equal exactly the PreparationOutput quantity. One PreparationOutput may create multiple movement effects/StockItems when placement, package, shelf-life or provenance state requires a split. Multiple preparation outputs may later contribute to compatible holdings, but lineage to each originating PreparationOutput must remain recoverable through immutable movement provenance rather than inferred from the current StockItem balance.

This separation creates the invariant: recipe = reusable definition; recipe version = immutable execution contract; preparation = concrete execution.

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

When IngredientConcept compatibility is used, the committed fulfillment preserves or immutably references the exact CompatibilityDecisionEvidence used at the decision point. Later compatibility changes must not silently reinterpret historical fulfillment validity.

Each fulfillment allocation records allocated quantity and MeasurementUnit. Allocated quantities are reconciled through the accepted exact-rational dimension-safe conversion rules, may represent partial fulfillment, and must not exceed the PurchaseItem quantity available within the distinct shopping-intent attribution pool after accounting for its other ShoppingListFulfillment allocations. Receipt/substitution allocations belong to the independent physical-receiving pool and neither consume nor replenish shopping-intent availability. A ShoppingListItem is fully fulfilled only when the sum of its compatible allocated quantities satisfies its requested quantity under an explicit fulfillment policy; over-fulfillment, substitution or tolerance must be represented explicitly rather than inferred. The same purchased quantity must not be double-counted across multiple list lines.

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
Supports safe retry of mutations where duplicate execution could corrupt business state. Its canonical identity is scoped at least by target Household (or an explicit global/system scope for a genuinely non-Household operation), authenticated actor/trusted principal, operation/command identity and client idempotency key. A key is never globally unique by itself and possession of a key grants no authority.

The record preserves a canonical request fingerprint computed from the complete normalized semantic mutation payload, including target entity/scope and command version, plus execution state and the committed response/result reference. A retry with the same scoped identity and matching fingerprint returns/reuses the original in-progress or committed outcome without executing the mutation again. Reuse of that scoped identity with a different fingerprint, target, operation or command version is rejected as an idempotency conflict and cannot overwrite, replay or reinterpret the original record. Authorization is re-established for every retry before any stored result is disclosed. Retention/expiry may permit later key reuse only through an explicit governed policy that cannot overlap a still-replayable mutation outcome.

### OutboxRecord
Provides a durable publication boundary for asynchronous side effects when a database mutation and event/message publication must be coordinated.

## 12. Core relationship map

```text
User ──< HouseholdMembership >── Household
                                │
                                ├──< Household-scoped Product (private catalog ownership)
                                ├──< StorageLocation ──< Compartment
                                │          ▲                ▲
                                │          └──── placement ─┤
                                │                           │
                                ├──< Purchase ──< PurchaseItem ──< ReceiptItem
                                ├──< Receipt ──< ReceiptItem ──< InventoryMovement
                                │                         └──────> StockItem / Batch provenance
                                ├──< StockItem >──────────────> Product [GLOBAL or same-Household]
                                │       ├──── optional ───────> Batch ─────> Product
                                │       ├──< SourceExpirationFact ── optional provenance ─> Batch/ReceiptItem
                                │       ├── placement ────────> StorageLocation XOR Compartment
                                │       ├──< InventoryMovement
                                │       ├──< FoodLifecycleEvent
                                │       └── EffectiveExpiration
                                ├──< InventoryTransfer ── source/destination placement snapshots ──> InventoryMovement
                                ├──< InventoryCount ──< InventoryCountItem ──> Product
                                │       └── per-line observation/as-of ──> reconciliation adjustment InventoryMovement
                                │                              ├── optional ──> StockItem
                                │                              └── placement ─> StorageLocation/Compartment
                                ├──< Household-scoped Recipe ──< RecipeVersion
                                ├──< Preparation ──> RecipeVersion [GLOBAL or same-Household] ──> Recipe
                                │              ├──< PreparationInput ──< InventoryMovement >── StockItem
                                │              │          ├──< PreparationInputAllocation >── RecipeIngredient snapshot
                                │              │          │              └── CompatibilityDecisionEvidence
                                │              │          └── explicit non-recipe/loss/waste deviation accounting
                                │              └──< PreparationOutput ──< InventoryMovement ──> StockItem
                                ├──< ShoppingList ──< ShoppingListItem ──> Product XOR IngredientConcept
                                │                              └──< ShoppingListFulfillment >── PurchaseItem
                                │                                             └── CompatibilityDecisionEvidence when concept-targeted
                                ├──< AlertRule ──< Alert ──< NotificationDelivery
                                ├──< Integration / Household binding
                                │       └──< ImportRun ──< ExternalReference
                                └──< HouseholdProductPolicy >── Product

GLOBAL catalog ──< Product
              └──< Recipe ──< RecipeVersion
IngredientConcept ──< RecipeIngredient >── RecipeVersion ──> Recipe
        │
        ├──< ShelfLifeRule
        └──< versioned controlled compatibility >── Product

Product ──< ProductIdentifier ── scoped by scheme + issuer/namespace
        ├──< ShelfLifeRule
        ├──> ProductCategory
        └── measurement/catalog metadata

MeasurementConversionEvidence ── exact version/factor/context ──> committed reconciled/conserved quantities
CompatibilityDecisionEvidence ── exact mapping/version/context ──> committed concept-based allocations
ShelfLifeRule ── group-local precedence / activation-time selection / explicit temporal arithmetic ──> Product | IngredientConcept | governed classification
StockItem ──< EffectiveExpiration ── provenance ──> SourceExpirationFact / ShelfLifeRule version(s)
```

`StorageLocation XOR Compartment` means one stored StockItem has one placement anchor, not two competing placement truths. Explicitly unplaced StockItems are the governed exception.

## 13. Explicitly rejected conflations from earlier drafts

The canonical model rejects these conflations:

- global `User.role` as household authority;
- Product as synonymous with retail SKU or commercial packaging;
- household-defined Product without explicit Household ownership/visibility/edit authority;
- a Household silently mutating a globally governed Product or referencing another Household's private Product;
- Batch as both manufacturing lot and physical inventory position;
- Batch as a mandatory bridge between StockItem and Product or source expiration;
- ProductIdentifier uniqueness without scheme/issuer namespace semantics;
- Product as owner of a single current price;
- PurchaseItem with an unlabeled monetary `price` whose unit-vs-line-total meaning is ambiguous;
- unit/basis price and purchased quantity producing a line gross that is accepted without governed extension/rounding reconciliation or an explicit pricing discrepancy;
- purchase line totals, discounts, taxes or charges without explicit gross/net roles and governed reconciliation/rounding semantics;
- Purchase-level charges silently folded into line unit cost without explicit allocation provenance;
- monetary amount without explicit currency or silent cross-currency conversion;
- unitless purchased, counted, prepared-input, prepared-output, replenishment-policy or shopping quantities;
- committed contextual/cross-dimension conversion that later resolves against the current profile instead of preserving the exact version/factor/context used;
- conservation or reconciliation equality decided by implementation-specific decimal scale, binary floating point or rounded converted quantities rather than exact rational arithmetic;
- committed IngredientConcept compatibility that later resolves against the current mapping instead of preserving the exact mapping/version/context used;
- Purchase as proof that stock physically entered inventory;
- ReceiptItem linked to a different-Product PurchaseItem without explicit substitution semantics;
- Receipt without line-level received-quantity, inventory-entry provenance and quantity conservation;
- receipt and substitution allocations consuming separate physical-receiving allowances from the same PurchaseItem;
- physical receipt allocations and ShoppingListFulfillment allocations incorrectly competing in one shared pool instead of independently enforcing anti-double-counting within their distinct semantic dimensions;
- silent over-receipt treated as ordinary PurchaseItem fulfillment;
- InventoryCountItem without explicit counted-subject identity or its own observation/as-of semantics when the session is not atomic;
- inventory reconciliation that classifies late-recorded movements only by commit time instead of domain occurrence time;
- a late pre-observation movement applied on top of a count adjustment that already compensated for the same physical effect;
- ambiguous aggregate count allocated arbitrarily across state-distinct StockItems;
- InventoryTransfer without same-Product, quantity-conservation and immutable source/destination placement semantics;
- historical transfer reconstruction from current StockItem placement;
- PreparationInput without authoritative decrement provenance and quantity conservation;
- recipe-based Preparation without immutable RecipeVersion/snapshot and preserved scaling/constraint context;
- recipe-based PreparationInput fulfillment inferred without explicit RecipeIngredient allocation;
- recipe-based PreparationInput with an unallocated consumed remainder that is neither recipe fulfillment nor an explicit governed deviation;
- recipe allocations capped only by source input while silently over/under-fulfilling the target RecipeIngredient requirement;
- PreparationOutput without explicit quantity/unit, authoritative movement provenance and quantity conservation;
- ShoppingListItem fulfillment without subject compatibility, quantity allocation and anti-double-counting semantics;
- AlertRule/Alert/NotificationDelivery without explicit Household, subject and recipient/destination ownership chain for Household-derived conditions;
- inventory-affecting Integration/ImportRun without explicit Household scope;
- provider identity, credentials or notification destination treated as Household authorization;
- ambiguous StockItem placement with conflicting location/compartment truths;
- undeclared reservation/hold semantics treated as if already canonical StockItem state;
- ShelfLifeRule precedence applied globally across independent semantic trigger/deadline groups;
- ShelfLifeRule without explicit applicability, deterministic group-local precedence and an activation-class-specific stable evaluation anchor;
- relative ShelfLifeRule arithmetic that leaves elapsed-vs-calendar basis, month/year invalid-date rollover, timezone/DST handling or endpoint semantics implicit;
- EffectiveExpiration date-only interpretation whose timezone version is selected from calculation time instead of the preserved SourceExpirationFact domain/source anchor;
- EffectiveExpiration without deterministic candidate-combination and date-only comparison semantics;
- Recipe/RecipeVersion without explicit global-or-Household governance scope, ownership, visibility and edit authority;
- a global Recipe referencing a private Household Product, or a Household Recipe/Preparation referencing another Household's private Recipe/Product;
- RecipeIngredient pointing to a physical Batch or StockItem;
- RecipeIngredient being permanently tied to one commercial SKU when a semantic IngredientConcept is sufficient;
- Recipe pointing to one concrete destination StorageLocation;
- relative shelf life represented as a calendar date;
- expiration automatically meaning disposal;
- household physical structure duplicated inside JSON configuration;
- idempotency keyed only by an unscoped client value, without Household/principal/operation identity and a canonical request fingerprint;
- reuse of an idempotency identity with a different request payload or disclosure of a stored result before retry authorization is re-established;
- one mutable `quantity_current` value as the only source of inventory truth;
- audit log as a substitute for inventory/domain history.
