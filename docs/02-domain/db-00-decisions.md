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

When a concrete Preparation executes a Recipe, fulfillment of recipe requirements is not inferred from Product names or stock usage alone. `PreparationInputAllocation` explicitly allocates measurable quantity from PreparationInput to the exact immutable RecipeIngredient version/snapshot line it fulfills. This supports repeated ingredient concepts, partial fulfillment and multiple stock sources while preserving line identity and compatibility constraints. For each RecipeIngredient snapshot line, the Preparation preserves the effective required quantity after its governed recipe scaling/yield adjustment together with the scaling inputs/context used. Compatible allocations into that exact line reconcile against that preserved requirement. Normal fulfillment cannot silently over- or under-allocate the line, and any allowed underage, overage, tolerance or substitution is an explicit governed deviation with expected/actual quantity, unit and provenance.

For every recipe-based PreparationInput, the full committed consumed quantity must also be accounted for on the source side. The sum of allocations to RecipeIngredient snapshot lines plus any explicitly classified non-recipe addition, process loss, waste or other governed deviation must equal exactly the PreparationInput quantity after valid conversion. An unallocated remainder is not valid historical state. Ad-hoc Preparations without a Recipe do not require RecipeIngredient allocations, but their consumed inputs remain fully represented by their authoritative PreparationInput/movement semantics.

This prevents generic recipes such as "milk" from being tied to one barcode/SKU while ensuring prepared, loose and non-commercial food can still have valid stock identity without fabricated commercial metadata, and it keeps recipe definition traceable and historically reproducible after later Recipe or compatibility changes.

## D-003 — Measurement conversion is dimension-safe and context-aware

**Decision:** MeasurementUnit belongs to an explicit dimension such as MASS, VOLUME or COUNT. Conversions inside the same dimension use canonical unit conversion rules.

Cross-dimension conversion is forbidden unless an explicit product/ingredient conversion profile provides the necessary context, for example density or package-equivalence semantics.

Package-to-quantity relationships such as "1 package = 500 g" are product/package facts, not universal unit conversions. Any measurable operational or policy quantity that is compared, reconciled or conserved must carry or resolve a MeasurementUnit.

When a committed business fact depends on a contextual, package-equivalence or cross-dimension conversion, the exact conversion decision becomes part of historical provenance. The committed fact must preserve or immutably reference source/target quantity and unit, the actual factor or formula inputs as exact rational values, conversion profile/rule identity and version, effective/evaluation context and provenance sufficient to reproduce the result. Authoritative quantities and operative conversion factors use exact rational semantics; exact converted results are rational products/quotients evaluated in a declared comparison unit. Persistence must support normalized numerator/denominator or another lossless representation even when the decimal expansion does not terminate. Binary floating point, implementation decimal scale and rounded display values cannot decide conservation equality. Rounding is presentation-only unless a separate governed non-conservation output explicitly requires it; a split remainder remains an explicit rational quantity and may not be silently rounded away. A later correction from, for example, `1 package = 500 g` to `1 package = 450 g` affects future decisions or explicit correction workflows; it must not silently reinterpret already committed receipt, movement, reconciliation or allocation quantities.

## D-004 — Effective expiration is a materialized, explainable projection

**Decision:** authoritative shelf-life truth consists of source expiration facts, lifecycle events, storage facts and versioned shelf-life rules. A concrete `effective_expiration_at` may be materialized for efficient queries/alerts.

ShelfLifeRule precedence is local to a semantic trigger/deadline group: rules compete only when they are alternatives intended to produce the same kind of deadline from the same authoritative activation fact. Within one such group, more specific applicability scope outranks broader scope and explicit priority resolves remaining order. Independent groups or activation facts — for example stock-entry/default versus opening — do not suppress one another; each applicable independent group may contribute a candidate to the final expiration calculation.

Source expiration must be representable at the concrete StockItem/package level even when no manufacturer Batch is known. Rule-version selection is anchored to the domain occurrence time of the authoritative fact that activates the relevant semantic group, and recomputation must reuse that same original anchor rather than current time. Event-triggered rules use the triggering FoodLifecycleEvent occurrence time; stock-entry/default rules use authoritative stock-entry occurrence time; placement/storage-change rules use the occurrence time of the authoritative InventoryMovement/InventoryTransfer or other canonical placement-state change; trusted observation-triggered storage rules use the observation occurrence time.

Every relative ShelfLifeRule must also define its temporal arithmetic explicitly. The rule preserves duration amount/unit, a temporal basis (`ELAPSED` or `LOCAL_CALENDAR`), endpoint semantics, and any timezone context/version required by calendar arithmetic. `ELAPSED` arithmetic operates on the instant timeline: seconds, minutes and hours are exact elapsed durations, an elapsed day is exactly 24 hours and an elapsed week is exactly 7 elapsed days; month/year units are not valid in elapsed mode. `LOCAL_CALENDAR` arithmetic adds calendar days/weeks/months/years in a governed IANA timezone whose exact version/context is anchored to the rule activation fact unless the rule carries a more specific governed timezone context. Calendar arithmetic preserves the activation local wall-clock time unless the rule explicitly declares a different endpoint such as start-of-day or end-of-day. Month/year addition applies the full amount to the original anchored local date using proleptic-Gregorian year/month arithmetic, retaining the original day-of-month when valid and otherwise clamping to the target month's final valid day; it does not iteratively carry forward an intermediate clamp. Thus January 31 plus one month becomes February 28 or 29, and February 29 plus one year becomes February 28. After that calendar-date resolution, if the resulting local wall-clock time falls in a DST gap, it resolves to the first valid instant after the gap; if it is ambiguous in an overlap, it resolves to the earlier occurrence. End-of-local-day semantics are represented as the exclusive start of the following local calendar day, not as an implementation-dependent “last representable instant”. A candidate is considered expired at its computed boundary and valid strictly before that boundary. A rule lacking the temporal basis, timezone context when required, or endpoint semantics needed to compute one deterministic instant is invalid and must not be published/applied.

Applicable source expirations and deadlines produced by independently applicable rule groups form an explicit candidate set. Unless a future governed semantic-class rule defines a different composition, the effective operational expiration is the earliest applicable candidate: a later candidate may not extend an earlier authoritative deadline.

A source expiration expressed only as a calendar date preserves its original date-only precision as authoritative source truth. For operational comparison only, that date is interpreted as the end of the local calendar day in the canonical Household timezone applicable to the StockItem, unless the source itself supplies an explicit timezone/offset or governed source context. For a Household-derived timezone, the exact timezone version is selected as of the preserved domain occurrence time at which that SourceExpirationFact became authoritative for the concrete StockItem/package — normally the source observation/import/receipt occurrence time carried by that fact. If the source supplies a more specific governed temporal context, that preserved source context governs instead. Initial calculation and every recomputation reuse this same timezone-selection anchor; later Household timezone changes must never reinterpret the historical date-only fact. Instant-valued candidates retain exact instant semantics. Operational normalization must not overwrite the original source precision.

The materialized value must be recomputable and must retain provenance sufficient to explain the candidate set, semantic groups, group-local precedence decisions, selected rule versions, evaluation anchors, relative-duration temporal basis/unit/endpoint/timezone context, the SourceExpirationFact occurrence/source anchor used to select date-only timezone context, the selected timezone version/context and final combination result. Changing an authoritative input must invalidate/recalculate the projection deterministically.

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

## D-008 — PurchaseItem monetary roles are explicit and reconciliable

**Decision:** PurchaseItem monetary data is modeled by semantic role rather than an ambiguous generic `price` amount. Every authoritative monetary component carries exact amount and currency. When a unit/basis price is present, it identifies the pricing-basis quantity and MeasurementUnit to which that amount applies. A line may additionally preserve source-provided or derived `line_gross`, `line_discount`, `line_tax`/governed line charges and `line_net` amounts, but each role is explicit and provenance identifies whether the value came from the source transaction or was derived by the platform.

For the canonical ordinary line equation, `line_gross` is the pre-discount, pre-tax/line-charge extended amount; `line_discount` is the total discount allocated to that line; `line_tax`/governed line charges are the total taxes/charges allocated to that line; and `line_net = line_gross - line_discount + line_tax/line-charges` under the transaction's governed rounding/scale policy. If both source-provided and derived totals are available, they must reconcile under that rounding policy or the discrepancy remains explicit rather than one value silently replacing the other.

Purchase-level discounts, taxes, fees or charges may remain Purchase-level facts when the source does not allocate them to lines. They must not be silently folded into a PurchaseItem unit price or historical unit cost. If later analytics or accounting allocate Purchase-level amounts across lines, the allocation method, basis, rounding and provenance are explicit derived facts and do not rewrite the original transaction amounts.

A pricing-basis quantity/unit that differs from the purchased quantity/unit may be reconciled only through accepted measurement-conversion semantics, retaining the exact conversion evidence when contextual conversion is required. Multi-currency source lines retain source amount/currency plus any explicit governed conversion evidence as already required by the money invariants.

## D-009 — Recipe catalog governance is explicit

**Decision:** Recipe and RecipeVersion use the same explicit global-versus-Household governance pattern required for reusable catalog identities. A global Recipe has no Household owner, is governed outside ordinary Household authority and may be viewed/executed according to global catalog policy. A household-scoped Recipe belongs to exactly one Household and may be viewed, edited or executed only through authority for that Household. RecipeVersion inherits its Recipe's scope and owner and cannot widen them.

A global Recipe may reference only globally visible IngredientConcepts/classifications and, when an exact-Product constraint is genuinely required, only a global Product. A household-scoped Recipe may reference globally visible concepts/Products and Products owned by that same Household, but never another Household's private Product. A Preparation inside a Household may execute only a global RecipeVersion or one owned by that same Household. Authorization is re-established at use time; possession of a recipe/version identifier is not proof of visibility.

Promotion, publication, sharing or cloning between household and global scopes is an explicit governed workflow. It creates or selects a destination-scope identity/version, validates every referenced catalog entity against the destination scope and preserves source provenance; it never silently flips ownership or exposes private Product metadata.

## D-010 — PurchaseItem allocation pools are separated by semantic dimension

**Decision:** physical receiving reconciliation and shopping-intent fulfillment are independent allocation dimensions over a PurchaseItem. The receipt pool contains ordinary same-Product ReceiptItem allocations plus governed substitutions and is capped by purchased quantity for normal receiving fulfillment. The shopping-intent pool contains ShoppingListFulfillment allocations and is independently capped by that PurchaseItem quantity.

The same purchased unit may appear once in each pool because a physical receipt proves what arrived while a shopping allocation attributes why the purchase was made. Within a pool, exact-rational converted allocations may not double-count quantity: ordinary receipts and substitutions share one receipt allowance, and allocations across shopping lines share one shopping-intent allowance. Allocations in one pool neither consume nor replenish availability in the other and cannot substitute for the other pool's required evidence. Over-receipt and shopping over-fulfillment/tolerance remain explicit under their respective policies.

## Consequence for DB-01

DB-01 may now model the relational entities and cardinalities using these decisions as constraints. It must preserve immutable historical evidence for placement-changing transfers, recipe execution snapshots, compatibility decisions, contextual conversions, exact-rational quantity conversion/conservation, relative shelf-life arithmetic including month/year rollover, date-only timezone selection anchors, purchase monetary-role reconciliation, separated receipt-versus-shopping allocation pools and Recipe/RecipeVersion catalog governance. It must not reopen these choices implicitly through table shape; any conflict must be raised explicitly as a governed decision.
