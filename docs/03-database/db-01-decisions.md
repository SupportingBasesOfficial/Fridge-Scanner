# FridgeScanner — DB-01 Decision Register

## Status

Working decision register for DB-01. These decisions refine persistence shape without reopening accepted DB-00 semantics.

## L-001 — Direct Household scope on high-risk operational facts

**Decision:** retain direct `household_id` on high-risk operational/history relations even when Household might also be derivable from a parent.

**Applies to:** inventory movement/count/reconciliation, receipt, preparation, alert, import, idempotency, outbox and related committed allocation/evidence facts.

**Reason:** tenant integrity and authorization must not depend on a long or mutable join chain; duplicated scope is intentional integrity data, not denormalized business truth, and must agree with every owning parent.

## L-002 — Explicit catalog scope/owner pair

**Decision:** Product, IngredientConcept, Recipe, ShelfLifeRule and scoped compatibility mappings carry explicit logical `catalog_scope` plus conditional `owner_household_id`.

**Constraint:** GLOBAL => no owner; HOUSEHOLD => exactly one owner.

**Reason:** makes DB-00 visibility/edit/reference rules relationally enforceable.

## L-003 — ProductIdentifier and staged identifier evidence are separate relations

**Decision:** unresolved Household observation of a globally namespaced identifier is persisted as `staged_identifier_claim`, not as nullable/flagged canonical ProductIdentifier.

**Reason:** canonical uniqueness cannot be consumed accidentally by private Household catalog data.

## L-004 — Exact conserved quantities are logical rationals

**Decision:** all authoritative conservation/reconciliation math uses exact rational semantics plus MeasurementUnit.

**Reason:** DB-00 explicitly rejects implementation-specific decimal scale, binary floating point and rounded equality. Physical encoding is deferred to DB-02.

## L-005 — Conversion and compatibility decisions are first-class immutable evidence

**Decision:** contextual conversion and concept compatibility used by committed facts point to immutable evidence relations.

**Reason:** historical meaning must survive later rule/profile changes.

## L-006 — Receipt effects are separate ledger facts

**Decision:** ReceiptItem never acts as the inventory ledger row itself. It links to one or more InventoryMovement entry effects.

**Reason:** receiving semantics and ledger semantics have different identities/cardinalities; split placement/batch/provenance requires multiple effects while preserving one received line.

## L-007 — Receiving and shopping fulfillment use distinct allocation relations and pools

**Decision:** physical receiving/substitution and ShoppingList fulfillment are independent semantic allocation dimensions over PurchaseItem quantity.

**Reason:** a purchased unit can both physically arrive and fulfill the shopping intent that caused the purchase without double-counting inside either dimension.

## L-008 — InventoryMovement is the quantity-history authority

**Decision:** StockItem may expose/materialize current balance for read efficiency, but no mutable current quantity field is the sole source of truth.

**Reason:** historical reconstruction, delayed facts, corrections and transfers require immutable ledger history.

## L-009 — Current placement and historical placement are distinct

**Decision:** StockItem stores current placement mode; placement-sensitive movements/transfers preserve immutable effect-time placement snapshots.

**Reason:** changing current StockItem placement cannot rewrite historical per-location truth.

## L-010 — Transfer is a business identity plus paired ledger effects

**Decision:** InventoryTransfer has its own identity and exactly one source-decrement plus one destination-increment movement effect, with explicit quantity lineage.

**Reason:** transfer conservation and source/destination placement must be enforceable and auditable as one domain operation without collapsing two ledger effects into one mutable row.

## L-011 — Count reconciliation has explicit outcome identity

**Decision:** InventoryCountItem does not directly mutate stock. Reconciliation produces an explicit `inventory_reconciliation_outcome`, optionally linked to an adjustment movement.

**Reason:** unresolved/blocked/no-change/adjusted/compensated states and historical basis evidence must be representable without fabricating a ledger effect.

## L-012 — Ambiguous count allocation is represented, not guessed

**Decision:** when a count can deterministically allocate among holdings, `inventory_count_allocation` records the decision. Otherwise the count remains unresolved/staged.

**Reason:** arbitrary allocation would corrupt batch, expiry and provenance state.

## L-013 — Recipe executions pin immutable RecipeVersion

**Decision:** recipe-based Preparation references an immutable RecipeVersion and PreparationInputAllocation targets immutable RecipeIngredient line identity.

**Reason:** later Recipe edits cannot reinterpret historical preparation fulfillment.

## L-014 — Preparation source-side and target-side accounting are separate constraints

**Decision:** PreparationInput allocations/deviations exhaust each consumed input, while allocations into each RecipeIngredient independently reconcile to the scaled requirement.

**Reason:** satisfying only one side permits unaccounted consumption or silent over/under-fulfillment.

## L-015 — ShelfLifeRule activation is persisted separately from EffectiveExpiration projection

**Decision:** persist immutable `shelf_life_rule_activation` decision evidence and derive/materialize `effective_expiration` plus candidates separately.

**Reason:** activation-time rule/mapping/timezone context is historical truth; the final expiration is a recomputable projection over candidates.

## L-016 — Shelf-life facts propagate through explicit quantity lineage

**Decision:** split/transfer/merge quantity lineage carries inherited shelf-life fact references for each quantity portion.

**Reason:** moving or splitting stock must not reset opening/expiry state.

## L-017 — ShoppingList subject is relational XOR

**Decision:** resolved ShoppingListItem targets Product XOR IngredientConcept; unresolved text remains provenance only.

**Reason:** fulfillment compatibility and quantity accounting need a canonical subject.

## L-018 — Integration binding and imported operational scope are persisted

**Decision:** inventory-affecting Integration use resolves to Household scope, and ImportRun directly retains exactly one target Household.

**Reason:** provider identity/credential possession must never become implicit tenant authority.

## L-019 — Idempotency uniqueness is scoped, not global-by-key

**Decision:** candidate identity is target scope + principal + operation/command + client key, with immutable canonical request fingerprint.

**Reason:** prevents cross-Household collisions and payload mutation under reused keys.

## L-020 — Mutation + outbox share one durable database commit boundary

**Decision:** OutboxRecord is logically committed in the same transaction as the authoritative mutation that requires asynchronous publication.

**Reason:** avoids state where business mutation commits but required publication intent is lost, or publication claims a mutation that never committed.

## L-021 — History-bearing referenced records retire/version instead of unsafe hard-delete

**Decision:** catalog/rule/evidence identities referenced by committed history cannot be hard-deleted in a way that destroys reproducibility. Physical FK delete behavior is finalized in DB-02, but the logical requirement is RESTRICT/tombstone/version semantics.

## L-022 — Transactional allocation checks are part of the database contract

**Decision:** receiving pools, shopping pools, preparation conservation, transfer pairs, count adjustments and idempotency winner selection cannot be implemented as non-atomic check-then-write application logic.

**Reason:** concurrency is part of correctness, not an optimization detail.
