# FridgeScanner — Relational Integrity Contracts

## Purpose

This document translates DB-00 invariants into minimum logical database integrity requirements. It does not prescribe one SQL implementation mechanism. DB-02 must choose keys, checks, deferred constraints, triggers, procedures or transaction orchestration that enforce the same semantics atomically.

## 1. Scope and ownership integrity

### C-001 Household parent/child equality

Whenever both child and parent carry Household scope, their `household_id` values must be equal. A child cannot be linked to a parent in another Household and rely on application filtering to hide the mistake.

### C-002 Catalog scope XOR

For Product, IngredientConcept, Recipe, ShelfLifeRule and scoped compatibility mappings:

- GLOBAL => `owner_household_id` absent;
- HOUSEHOLD => `owner_household_id` present;
- no third ambiguous state is valid.

### C-003 Cross-scope catalog references

A GLOBAL catalog record may reference only GLOBAL records where DB-00 requires global visibility. A HOUSEHOLD catalog record may reference GLOBAL or records owned by that same Household, never records owned by another Household.

### C-004 Stock Product visibility

A StockItem may reference only:

- a GLOBAL Product; or
- a Product owned by the StockItem Household.

### C-005 Household authorization is not provider identity

Integration/provider/account/destination identifiers cannot substitute for persisted Household scope on Household-affecting operational facts.

### C-006 Household timezone version intervals

HouseholdTimezoneVersion effective intervals for one Household must not overlap ambiguously. A historical fact that used Household timezone semantics retains the exact selected version; later timezone changes cannot reinterpret committed history.

## 2. Placement integrity

### C-007 StockItem placement XOR

A stored StockItem has exactly one current placement mode:

1. direct StorageLocation;
2. Compartment;
3. explicit governed unplaced state.

If Compartment is selected, a second direct StorageLocation value is not a competing authoritative truth.

### C-008 Compartment parent scope

Compartment and its StorageLocation must belong to the same Household. StockItem placement must resolve to the StockItem Household.

### C-009 Historical placement is immutable

Placement-sensitive InventoryMovement/InventoryTransfer effects preserve historical source/destination placement snapshots. Later changes to StockItem current placement cannot rewrite these facts.

## 3. Product and identifier integrity

### C-010 Batch Product agreement

If StockItem references Batch, `batch.product_id = stock_item.product_id`.

### C-011 Global identifier restriction

A canonical ProductIdentifier from a globally namespaced scheme may reference only a GLOBAL Product.

### C-012 Identifier candidate key

Canonical ProductIdentifier uniqueness is enforced within the governed tuple:

`(scheme, issuer_or_namespace, normalization_rule_version, normalized_value)`

with issuer/namespace omitted only when the scheme itself defines one global namespace.

### C-013 Staged claims do not reserve canonical keys

StagedIdentifierClaim is Household-scoped evidence and must not participate in canonical ProductIdentifier uniqueness until governed promotion/resolution succeeds.

### C-014 Normalization history is non-destructive

Changing normalization rules creates a new governed version and migration/resolution state. Historical source and normalized values are not overwritten in place.

## 4. Exact quantity integrity

### C-015 Authoritative quantity representation

Conserved/reconciled quantities and operative conversion factors must have exact rational semantics. Binary floating point, display rounding or implementation-specific decimal scale may not decide equality.

### C-016 Quantity requires unit

Every measurable PurchaseItem, ReceiptItem, InventoryMovement, InventoryCountItem, PreparationInput, PreparationOutput, ShoppingListItem and measurable HouseholdProductPolicy threshold carries/resolves a MeasurementUnit.

### C-017 Conversion evidence

A committed cross-dimension, package-equivalence or contextual conversion that affects conservation/reconciliation must retain immutable MeasurementConversionEvidence identifying source, target, exact factor/formula inputs, rule/profile version, evaluation context and provenance.

### C-018 Movement Product/Household agreement

When InventoryMovement references a StockItem, movement Household and Product must equal StockItem Household and Product.

### C-019 Movement sign semantics

Committed InventoryMovement quantity must be non-zero and its sign must agree with the movement semantic class. A future non-quantity event must use a different domain record rather than a zero-quantity InventoryMovement.

## 5. Purchase and receiving integrity

### C-020 Receipt parent Purchase consistency

If `receipt.purchase_id` is present, every ordinary or substitution allocation under that Receipt targets a PurchaseItem belonging to that Purchase. A Receipt without a prior Purchase remains valid.

### C-021 Ordinary receipt allocation subject equality

Every PurchaseItemReceiptAllocation requires PurchaseItem Product to equal ReceiptItem Product.

### C-022 Substitution is explicit

A different received Product may consume a PurchaseItem receiving allowance only through PurchaseItemSubstitutionAllocation preserving requested Product, received Product, exact quantity/unit, reason/approval and provenance.

Requested Product must equal PurchaseItem Product. Received Product must equal ReceiptItem Product.

### C-023 ReceiptItem attribution conservation

For one ReceiptItem, cumulative ordinary receipt allocations plus substitution allocations cannot exceed the quantity physically received on that ReceiptItem. Any remaining quantity is unallocated/ad-hoc receiving evidence, not silently attributed to a PurchaseItem.

### C-024 Receipt effect conservation

For a committed ReceiptItem, ReceiptItemInventoryEffect rows and their linked inventory-entry effects:

- are in the same Household;
- represent the same Product;
- each refer to a valid inventory-entry movement;
- sum exactly to ReceiptItem quantity after governed exact conversion.

A ReceiptItem that physically entered stock cannot be considered committed/materialized without this exact effect accounting.

### C-025 One entry movement is not double-materialized

An InventoryMovement used as a ReceiptItem inventory-entry effect belongs to one ReceiptItem materialization role. It cannot simultaneously materialize unrelated ReceiptItems.

### C-026 Receiving pool conservation

For one PurchaseItem, cumulative ordinary receiving allocations plus governed substitutions cannot exceed purchased quantity as normal fulfillment. Excess exists only through an explicit receiving exception/discrepancy flow.

### C-027 Shopping pool is independent

ShoppingListFulfillment uses a separate attribution pool from physical receiving. The same purchased unit may participate once in each semantic dimension, while double-counting within either pool is forbidden.

### C-028 Pricing basis reconciliation

If a PurchaseItem has a basis/unit price, authoritative line gross must reconcile to exact purchased quantity and basis quantity under the preserved conversion and currency rounding policy, or an explicit pricing discrepancy must remain recorded.

### C-029 Money role and currency integrity

PurchaseMoneyFact and PurchaseItemMoneyFact require explicit semantic role, exact amount and currency. Numerically equal amounts of different roles or currencies are not interchangeable facts.

## 6. Inventory ledger and lineage integrity

### C-030 InventoryMovement immutability

Committed movement kind, Product, quantity, occurrence identity, causal-order evidence and historical placement/provenance cannot be silently updated/deleted. Corrections use compensating/new movements.

### C-031 Ledger is authoritative

Current StockItem balance, if materialized, is not independent truth and must reconcile to committed InventoryMovement history for the StockItem/lineage.

### C-032 Transfer pair completeness

Every committed InventoryTransfer has exactly one InventoryTransferEffect record containing one source-decrement and one destination-increment movement. Each movement can fill that transfer-effect role at most once.

### C-033 Transfer conservation

Source and destination transfer effects:

- share Household;
- share Product;
- preserve source/destination placement snapshots;
- have the correct decrement/increment signs;
- conserve exactly the transferred quantity after governed conversion.

### C-034 Lineage edge Product integrity

A same-Product InventoryQuantityLineage edge has one Product identity shared by its source and destination movement/StockItem endpoints. Same-Product split/transfer/merge lineage cannot silently transform Product identity.

### C-035 Source-side lineage conservation

For each source movement/effect participating in same-Product redistribution, outgoing lineage quantities cannot exceed the source conserved quantity after exact conversion.

### C-036 Destination-side lineage conservation

For each destination movement/effect declared lineage-derived, incoming lineage quantities reconcile exactly to the destination quantity unless the operation is an explicitly modeled Product-transforming domain process such as Preparation. Product transformation cannot masquerade as ordinary same-Product lineage.

### C-037 Shelf-life lineage propagation

Every applicable SourceExpirationFact, FoodLifecycleEvent and already-activated ShelfLifeRuleActivation for a conserved source portion propagates through QuantityLineageShelfLifeFact to the destination portion. Redistribution cannot reset expiry/lifecycle state.

## 7. Inventory count integrity

### C-038 Historical basis is first-class

Every InventoryCountItem references an immutable InventoryLedgerBasis describing the captured historical ledger cutoff/watermark and ordering context used for reconciliation. Processing time/current balance cannot substitute for that basis.

### C-039 Per-line observation basis

Non-atomic counts preserve authoritative observation time and ledger basis per InventoryCountItem. A session-level basis may be reused only when one authoritative frozen/atomic snapshot or equivalent trustworthy token applies to all lines.

### C-040 Count subject identity

Each InventoryCountItem identifies Product, observed exact quantity/unit and placement when relevant; an existing StockItem link is optional so newly discovered stock remains representable.

### C-041 Ambiguous holding allocation

When an aggregate count cannot deterministically distinguish state-distinct StockItems, no arbitrary adjustment allocation may commit. The item remains unresolved/staged or is recounted/resolved through explicit evidence.

### C-042 Late-event ordering

Historical reconciliation classifies movements by authoritative domain occurrence ordering, not recording/commit time.

### C-043 Equal-time ambiguity

Equal occurrence timestamps alone do not prove causal order. They may be ordered only by a trustworthy ordering discriminator from the same ordering domain. Without it, the case remains ambiguous and cannot authorize guessed rebase, post-observation preservation or compensation.

### C-044 Reconciliation adjustment provenance

Any committed count adjustment references the exact count item, InventoryLedgerBasis and reconciliation outcome/evidence that justified it.

### C-045 Late pre-observation correction

If a later-recorded movement is proven to precede the observation, it invalidates/rebases the historical basis. If a prior adjustment already committed, immutable history stays and only an explicit compensating/reconciliation outcome may correct it when deterministic; otherwise the case blocks/escalates.

## 8. Recipe and preparation integrity

### C-046 RecipeVersion immutability

A Recipe-based Preparation references one immutable RecipeVersion/snapshot. Ingredient lines and constraints used by committed Preparations cannot be reinterpreted by editing the current Recipe.

### C-047 Recipe scope visibility

A GLOBAL RecipeVersion references only GLOBAL catalog entities. A Household RecipeVersion may reference GLOBAL or same-Household catalog entities. Preparation may execute only GLOBAL or same-Household RecipeVersion.

### C-048 Preparation input movement conservation

PreparationInputMovement rows and linked decrement InventoryMovements share Household/Product and sum exactly to the PreparationInput consumed quantity after governed conversion.

### C-049 Source-side preparation accounting

For recipe-based PreparationInput:

`sum(recipe allocations) + sum(explicit source-side deviations) = committed input quantity`

No unclassified remainder is valid.

### C-050 Recipe-line target accounting

Allocations into each RecipeIngredient reconcile against the effective scaled requirement. Any allowed underage, overage, tolerance or substitution is an explicit governed deviation preserving expected/actual quantity, unit, policy/reason and provenance/approval.

### C-051 Compatibility evidence

Concept-based PreparationInputAllocation requires immutable CompatibilityDecisionEvidence proving Product-to-IngredientConcept compatibility at the decision point.

### C-052 Preparation output conservation

PreparationOutputMovement rows and linked increment InventoryMovements share Household/Product and sum exactly to PreparationOutput quantity.

### C-053 Preparation is the Product-transformation boundary

Input-to-output Product transformation is represented through Preparation input/output conservation semantics, not through same-Product InventoryQuantityLineage edges. This separation must remain explicit.

## 9. Shelf-life integrity

### C-054 Rule scope visibility

GLOBAL ShelfLifeRule references only GLOBAL catalog targets. Household ShelfLifeRule references GLOBAL or same-Household targets and applies only within its owning Household.

### C-055 Stable activation evidence

ShelfLifeRuleActivation preserves exact rule version, authoritative activation anchor, selected HouseholdTimezoneVersion when applicable, more-specific source temporal context and concept compatibility evidence when applicable. Recalculation does not substitute current rule/mapping/timezone state.

### C-056 Group-local precedence

Rule competition/precedence is evaluated only within the same semantic trigger/deadline group. Independent trigger groups may each contribute expiration candidates.

### C-057 Deterministic temporal arithmetic

Relative shelf-life rules retain temporal basis, amount/unit, timezone/version context, endpoint semantics and the accepted DB-00 calendar/DST/month-end rules. Physical implementation cannot delegate ambiguous behavior to a date-library default.

### C-058 Effective-expiration candidate XOR

Each EffectiveExpirationCandidate references exactly one candidate source: SourceExpirationFact XOR ShelfLifeRuleActivation. The candidate must belong to the same Household and applicable StockItem/lineage history.

### C-059 Effective expiration reproducibility

EffectiveExpiration is a projection over preserved source/rule candidates and evidence. It must be reproducible from authoritative facts and versioned decision context.

## 10. Shopping integrity

### C-060 Shopping subject XOR

Resolved ShoppingListItem selects exactly one canonical subject: Product XOR IngredientConcept. Free text may remain provenance only.

### C-061 Product-target fulfillment

A Product-targeted ShoppingListItem may be fulfilled only by PurchaseItems of that exact Product.

### C-062 Concept-target fulfillment

An IngredientConcept-targeted ShoppingListItem may be fulfilled only with immutable CompatibilityDecisionEvidence supporting the purchased Product at the decision point.

### C-063 Shopping allocation conservation

Cumulative ShoppingListFulfillment quantity drawn from a PurchaseItem cannot exceed purchased quantity within the shopping-intent pool after governed exact conversion.

## 11. Alerts, integrations and imports

### C-064 Alert ownership chain

AlertRule, Alert and NotificationDelivery for Household-derived conditions remain in the same Household. Alert preserves originating rule/trigger context; delivery preserves exactly one Alert and recipient/destination attempt provenance.

### C-065 Typed business subjects where referential integrity matters

Alert or other operational subject links that require referential integrity use typed FK/association structures. An unconstrained generic `entity_type/entity_id` pair must not replace enforceable business relationships merely for schema convenience.

### C-066 Import Household binding

Every inventory-affecting ImportRun identifies exactly one target Household. ExternalReference and all produced canonical operational facts remain within that boundary.

### C-067 External reference namespace

ExternalReference uniqueness/resolution is scoped by provider/integration namespace, reference type/value and Household when operationally Household-scoped. An unqualified external value cannot become global authority.

### C-068 Secret separation

Integration credentials/secrets are represented by secure secret references, not arbitrary domain JSON containing secret material.

## 12. Idempotency, audit and outbox

### C-069 Idempotency candidate identity

Idempotency logical uniqueness is scoped by target scope identity/Household where applicable, principal, operation/command identity and client key. Client key alone is never a cross-tenant key.

### C-070 Idempotency fingerprint conflict

Reuse of the same scoped idempotency identity with a different canonical semantic request fingerprint, target or command version is rejected and cannot overwrite/reinterpret the original outcome.

### C-071 Authorization before replay

Stored idempotent results are not disclosed merely because a client knows the key; current authorization is re-established on every retry.

### C-072 Mutation and outbox atomicity

When a committed business mutation requires asynchronous publication, its OutboxRecord is committed in the same database transaction boundary as the authoritative mutation. External publication occurs after that durable boundary.

### C-073 Audit is not ledger

AuditEvent cannot substitute for InventoryMovement or other domain history. Inventory/domain facts remain valid independently from audit/log storage concerns.

## 13. Transaction-boundary contracts

The following operations require one atomic logical database transaction or an equivalent serializable single-winner contract:

- creating a ReceiptItem materialization with its ReceiptItemInventoryEffect rows and entry movements;
- allocating ReceiptItems ordinarily or by substitution against PurchaseItem receiving pools;
- committing an InventoryTransfer, paired source/destination effects and required lineage;
- committing an inventory-count adjustment and reconciliation outcome against one captured InventoryLedgerBasis;
- committing Preparation input/output facts, allocations/deviations and authoritative movement effects;
- consuming a ShoppingListFulfillment allocation from a PurchaseItem attribution pool;
- creating or observing the winner of an IdempotencyRecord execution;
- committing a business mutation with its OutboxRecord.

No implementation may rely on a check-then-write sequence that allows concurrent transactions to over-allocate a ReceiptItem, PurchaseItem receiving pool, PurchaseItem shopping pool, Preparation quantity, duplicate an idempotent mutation or violate Household scope between validation and commit.

## 14. Delete/update semantics

DB-02 must classify foreign-key deletion behavior explicitly. Default logical policy:

- authoritative/history-bearing facts: RESTRICT ordinary parent deletion or preserve tombstoned identity;
- pure dependent drafts/transient staging: governed cascade may be allowed before commit;
- catalog entities referenced by committed history: retire/version/tombstone instead of hard-delete when deletion would destroy reproducibility;
- HouseholdTimezoneVersion referenced by history: immutable/restricted from destructive deletion;
- Household deletion: explicit lifecycle/data-retention workflow, never uncontrolled relational cascade across audit/history.

## 15. Gate rule

A physical schema is not DB-01 compliant merely because every relation exists. It is compliant only if these constraints remain enforceable under concurrency, retries, delayed/offline facts, historical rule/timezone changes and the reconciliation edge cases defined by DB-00.
