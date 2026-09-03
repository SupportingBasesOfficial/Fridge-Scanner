# FridgeScanner — DB-00 Decisions

## Status

Proposed canonical decisions for DB-00. These decisions close the conceptual ambiguities required before DB-01 logical modeling. They remain subject to exact-HEAD review before merge.

## D-001 — StockItem uses state-coherent aggregate identity

**Decision:** a StockItem is the inventory unit of record, not necessarily one physical package. It may represent an aggregate measurable quantity only while all identity-affecting state is coherent.

A StockItem must be split when part of its quantity acquires materially different state, including location, package/open state, shelf-life trigger/effective expiry, provenance requirements or other lifecycle facts that must be tracked independently. Future reservation/hold semantics are not part of DB-00 and must not be treated as canonical StockItem state unless introduced through an explicit governed decision.

Two StockItems may be merged only when their merge cannot erase required lineage/audit meaning and all attributes that affect lifecycle, ownership, measurement and storage semantics are compatible.

This avoids one-row-per-grain over-modeling while preserving physical truth whenever state diverges.

## D-002 — RecipeIngredient targets IngredientConcept, not concrete stock

**Decision:** introduce `IngredientConcept` as the recipe-facing abstraction. `RecipeIngredient` references an IngredientConcept plus quantity/unit and optional constraints.

`Product` is the canonical stockable food/product identity referenced by StockItem. It may represent a commercial packaged product, loose/unbranded food, a household-defined item, or a reusable identity for prepared food/output; commercial identifiers and manufacturer metadata are optional. Product catalog governance is explicit: global Products are globally governed/reusable and are not editable through ordinary Household authority, while household-defined Products belong to exactly one Household and are visible/editable only through that Household's authorization boundary. A Household StockItem may reference a global Product or a Product owned by the same Household, never another Household's private Product. Promotion/sharing/merge across catalog scopes is an explicit governed workflow with provenance, not an implicit visibility change.

A controlled, versioned compatibility mapping determines which Products can satisfy an IngredientConcept. Compatibility decisions are time/context-sensitive governed reference data: a committed allocation must preserve or immutably reference the exact mapping/rule identity and version, effective/evaluation time or context, Product, IngredientConcept and relevant constraint evidence used when the decision was made. Later compatibility edits affect future decisions only unless an explicit correction workflow is recorded.

A recipe may optionally impose an exact-Product constraint when the recipe genuinely requires it. Recipe evolution is also versioned. A committed recipe-based Preparation references an immutable `RecipeVersion` or equivalent immutable recipe snapshot containing the exact RecipeIngredient lines, quantities, units and constraints used for that execution.

When a concrete Preparation executes a Recipe, fulfillment of recipe requirements is not inferred from Product names or stock usage alone. `PreparationInputAllocation` explicitly allocates measurable quantity from PreparationInput to the exact immutable RecipeIngredient version/snapshot line it fulfills. This supports repeated ingredient concepts, partial fulfillment and multiple stock sources while preserving line identity and compatibility constraints. For each RecipeIngredient snapshot line, the Preparation preserves the effective required quantity after its governed recipe scaling/yield adjustment together with the scaling inputs/context used. Compatible allocations into that exact line reconcile against that preserved requirement. Normal fulfillment cannot silently over- or under-allocate the line, and any allowed underage, overage, tolerance or substitution is an explicit governed deviation with expected/actual quantity, unit and provenance. Ad-hoc Preparations without a Recipe do not require RecipeIngredient allocations.

This prevents generic recipes such as "milk" from being tied to one barcode/SKU while ensuring prepared, loose and non-commercial food can still have valid stock identity without fabricated commercial metadata, and it keeps recipe definition traceable and historically reproducible after later Recipe or compatibility changes.

## D-003 — Measurement conversion is dimension-safe and context-aware

**Decision:** MeasurementUnit belongs to an explicit dimension such as MASS, VOLUME or COUNT. Conversions inside the same dimension use canonical unit conversion rules.

Cross-dimension conversion is forbidden unless an explicit product/ingredient conversion profile provides the necessary context, for example density or package-equivalence semantics.

Package-to-quantity relationships such as "1 package = 500 g" are product/package facts, not universal unit conversions. Any measurable operational or policy quantity that is compared, reconciled or conserved must carry or resolve a MeasurementUnit.

When a committed business fact depends on a contextual, package-equivalence or cross-dimension conversion, the exact conversion decision becomes part of historical provenance. The committed fact must preserve or immutably reference source/target quantity and unit, the actual factor or formula inputs, conversion profile/rule identity and version, effective/evaluation context and provenance sufficient to reproduce the result. A later correction from, for example, `1 package = 500 g` to `1 package = 450 g` affects future decisions or explicit correction workflows; it must not silently reinterpret already committed receipt, movement, reconciliation or allocation quantities.

## D-004 — Effective expiration is a materialized, explainable projection

**Decision:** authoritative shelf-life truth consists of source expiration facts, lifecycle events, storage facts and versioned shelf-life rules. A concrete `effective_expiration_at` may be materialized for efficient queries/alerts.

ShelfLifeRule precedence is local to a semantic trigger/deadline group: rules compete only when they are alternatives intended to produce the same kind of deadline from the same authoritative activation fact. Within one such group, more specific applicability scope outranks broader scope and explicit priority resolves remaining order. Independent groups or activation facts — for example stock-entry/default versus opening — do not suppress one another; each applicable independent group may contribute a candidate to the final expiration calculation.

Source expiration must be representable at the concrete StockItem/package level even when no manufacturer Batch is known. Rule-version selection is anchored to the domain occurrence time of the authoritative fact that activates the relevant semantic group, and recomputation must reuse that same original anchor rather than current time. Event-triggered rules use the triggering FoodLifecycleEvent occurrence time; stock-entry/default rules use authoritative stock-entry occurrence time; placement/storage-change rules use the occurrence time of the authoritative InventoryMovement/InventoryTransfer or other canonical placement-state change; trusted observation-triggered storage rules use the observation occurrence time.

Applicable source expirations and deadlines produced by independently applicable rule groups form an explicit candidate set. Unless a future governed semantic-class rule defines a different composition, the effective operational expiration is the earliest applicable candidate: a later candidate may not extend an earlier authoritative deadline.

A source expiration expressed only as a calendar date preserves its original date-only precision as authoritative source truth. For operational comparison only, that date is interpreted as the end of the local calendar day in the canonical Household timezone applicable to the StockItem, unless the source itself supplies an explicit timezone/offset or governed source context. The timezone/context used for interpretation is versioned/as-of so later configuration changes cannot alter historical recomputation. Instant-valued candidates retain exact instant semantics. Operational normalization must not overwrite the original source precision.

The materialized value must be recomputable and must retain provenance sufficient to explain the candidate set, semantic groups, group-local precedence decisions, selected rule versions, evaluation anchors, date-only interpretation timezone/context and final combination result. Changing an authoritative input must invalidate/recalculate the projection deterministically.

The projection must never become an unexplained second source of truth.

## D-005 — Authoritative inventory cannot become negative

**Decision:** committed authoritative inventory balances must not become negative through ordinary operations or reconciliation.

Physical discrepancies are represented through InventoryCount plus explicit adjustment semantics. Each InventoryCountItem captures its authoritative physical observation time and corresponding ledger as-of/cutoff so a session that spans time does not falsely treat all lines as simultaneous. One common session-level cutoff is valid only when a genuinely atomic/frozen snapshot or equivalent snapshot token guarantees all lines correspond to the same authoritative inventory state.

Reconciliation is governed by domain occurrence time as well as ledger recording order. A movement recorded after a count cutoff but occurring after the physical observation is a genuinely intervening movement and is preserved outside the count adjustment. A movement recorded after the cutoff but occurring at or before the observation changes the historical state the count should have been compared against: the reconciliation basis is invalidated/rebased and must be recomputed with that movement included. It must not be applied on top of an adjustment that already compensated for the same physical effect.

If such a late pre-observation fact arrives after an adjustment has already committed, committed history remains immutable. The corrected count outcome is recomputed against the authoritative historical movement set and represented by an explicit compensating/reconciliation outcome when deterministic and safe; otherwise the case blocks/escalates. If the required as-of history, occurrence ordering or allocation cannot be reconstructed safely, reconciliation must not guess.

Imports or integrations with incomplete/contradictory data remain in staging/reconciliation state until they can be committed without fabricating negative stock.

If a future business case truly requires negative inventory, it requires an explicit domain decision rather than an accidental relaxation of constraints.

## D-006 — Transfer is one domain operation backed by paired ledger movements

**Decision:** a stock transfer is represented as one atomic `InventoryTransfer` domain operation with one transfer identity and two linked ledger effects: source decrement and destination increment.

Both effects commit atomically, represent the same Product, and conserve exactly the transferred quantity after valid dimension-safe conversion. The source-decrement effect preserves the immutable source placement anchor, the destination-increment effect preserves the immutable destination placement anchor, and the transfer/effects preserve authoritative domain occurrence time independently from later recording time when necessary. A transfer may change the current StockItem placement and may split or merge compatible holdings, but historical effects must never depend on the StockItem's current mutable placement to reconstruct where quantity existed at an earlier cutoff.

Within the initial domain, source and destination must resolve to the same Household. A future cross-household transfer would be a distinct workflow requiring explicit authorization, ownership-transfer and receiving semantics.

This representation keeps balances and per-placement historical counts reconstructible while preserving one business-level transfer identity and conservation law.

## D-007 — `Household` is canonical code/domain vocabulary

**Decision:** `Household` is the canonical architecture and code term for the primary domestic operational boundary. User interfaces may localize the label as `Casa` or another product-language term.

The domain term must not imply that physical street address is mandatory or that all future household-like scopes require a residential address.

Inventory-affecting external integrations do not create an alternate ownership boundary: every such Integration use, ImportRun and reconciled ExternalReference must resolve to an explicitly authorized target Household, and resulting operational entities remain within that Household.

## Consequence for DB-01

DB-01 may now model the relational entities and cardinalities using these decisions as constraints. It must preserve immutable historical evidence for placement-changing transfers, recipe execution snapshots, compatibility decisions and contextual conversions. It must not reopen these choices implicitly through table shape; any conflict must be raised explicitly as a governed decision.
