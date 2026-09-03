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

## L-006 — Purchase money is role-bearing relational data

**Decision:** Purchase-level and PurchaseItem-level monetary facts are represented by explicit role-bearing logical facts, not a generic unlabeled `price` numeric.

**Reason:** pricing basis, line gross, discount, tax/charge, net and Purchase-level charges have different semantics and reconciliation rules even when numeric values coincide.

## L-007 — ReceiptItem does not directly own PurchaseItem provenance

**Decision:** ordinary receiving is represented by `purchase_item_receipt_allocation` with explicit quantity/unit; substitutions use a separate `purchase_item_substitution_allocation`.

**Reason:** a direct nullable `receipt_item.purchase_item_id` makes allocation quantity implicit and cannot cleanly represent partial/multi-line source provenance. Explicit allocations let both the ReceiptItem source quantity and PurchaseItem receiving allowance be conserved independently.

## L-008 — ReceiptItem materialization uses an explicit ledger-effect relation

**Decision:** `receipt_item_inventory_effect` links each ReceiptItem quantity portion to the InventoryMovement effect that physically materialized it.

**Reason:** ReceiptItem and InventoryMovement have different identities/cardinalities; a received line may split across placement/batch/state while all entry effects must still sum exactly to what physically arrived.

## L-009 — Receiving and shopping fulfillment use distinct allocation relations and pools

**Decision:** ordinary/substitution receiving and ShoppingList fulfillment are independent semantic allocation dimensions over PurchaseItem quantity.

**Reason:** a purchased unit can both physically arrive and fulfill the shopping intent that caused the purchase without double-counting inside either dimension.

## L-010 — InventoryMovement is the quantity-history authority

**Decision:** StockItem may expose/materialize current balance for read efficiency, but no mutable current quantity field is the sole source of truth.

**Reason:** historical reconstruction, delayed facts, corrections and transfers require immutable ledger history.

## L-011 — Current placement and historical placement are distinct

**Decision:** StockItem stores current placement mode; placement-sensitive movements/transfers preserve immutable effect-time placement snapshots.

**Reason:** changing current StockItem placement cannot rewrite historical per-location truth.

## L-012 — Transfer is a business identity plus paired ledger effects

**Decision:** InventoryTransfer has its own identity and exactly one source-decrement plus one destination-increment movement effect, with explicit quantity lineage.

**Reason:** transfer conservation and source/destination placement must be enforceable and auditable as one domain operation without collapsing two ledger effects into one mutable row.

## L-013 — Same-Product quantity lineage is an explicit source→destination conserved edge

**Decision:** `inventory_quantity_lineage` identifies source movement, destination movement, optional endpoint StockItems, Product and exact conserved quantity portion.

**Reason:** lineage must be precise enough to enforce source/destination conservation and carry expiry/provenance by quantity portion. A vague many-to-many relationship is insufficient.

**Boundary:** Product-transforming Preparation is not represented as same-Product lineage; transformation uses Preparation input/output conservation semantics.

## L-014 — Shelf-life inheritance is attached to exact lineage edges

**Decision:** `quantity_lineage_shelf_life_fact` carries inherited SourceExpirationFact, FoodLifecycleEvent and ShelfLifeRuleActivation references across conserved redistribution edges.

**Reason:** split/transfer/merge must not reset lifecycle/expiration state or lose which quantity portion inherited which fact.

## L-015 — Count reconciliation has explicit historical basis and outcome identities

**Decision:** each InventoryCountItem references immutable `inventory_ledger_basis`; reconciliation produces explicit `inventory_reconciliation_outcome`, optionally linked to an adjustment movement.

**Reason:** processing-time balance is not the physical count basis, and unresolved/blocked/no-change/adjusted/compensated states must be representable without fabricating a ledger effect.

## L-016 — Session-level count basis is conditional, not assumed

**Decision:** multiple count lines may share one InventoryLedgerBasis only when a genuinely atomic/frozen snapshot or equivalent authoritative token applies to all of them. Otherwise each line has its own basis.

**Reason:** long/offline counting sessions can span intervening stock changes.

## L-017 — Ambiguous count allocation is represented, not guessed

**Decision:** when a count can deterministically allocate among holdings, `inventory_count_allocation` records the decision. Otherwise the count remains unresolved/staged.

**Reason:** arbitrary allocation would corrupt batch, expiry and provenance state.

## L-018 — Recipe executions pin immutable RecipeVersion

**Decision:** recipe-based Preparation references an immutable RecipeVersion and PreparationInputAllocation targets immutable RecipeIngredient line identity.

**Reason:** later Recipe edits cannot reinterpret historical preparation fulfillment.

## L-019 — Preparation source-side and target-side accounting are separate constraints

**Decision:** PreparationInput allocations/deviations exhaust each consumed input, while allocations into each RecipeIngredient independently reconcile to the scaled requirement.

**Reason:** satisfying only one side permits unaccounted consumption or silent over/under-fulfillment.

## L-020 — Household timezone is versioned historical reference data

**Decision:** persist `household_timezone_version` with non-ambiguous effective intervals; historical shelf-life/source-expiration evidence references the exact selected version when Household timezone participates in interpretation.

**Reason:** changing a Household timezone after an expiration fact/activation cannot change historical EffectiveExpiration recomputation.

## L-021 — ShelfLifeRule activation is persisted separately from EffectiveExpiration projection

**Decision:** persist immutable `shelf_life_rule_activation` decision evidence and derive/materialize `effective_expiration` plus candidates separately.

**Reason:** activation-time rule/mapping/timezone context is historical truth; final expiration is a recomputable projection over preserved candidates.

## L-022 — EffectiveExpiration candidate source is constrained XOR

**Decision:** each candidate references exactly one SourceExpirationFact or one ShelfLifeRuleActivation.

**Reason:** provenance must be relationally unambiguous and candidates from unrelated histories cannot be silently mixed.

## L-023 — ShoppingList subject is relational XOR

**Decision:** resolved ShoppingListItem targets Product XOR IngredientConcept; unresolved text remains provenance only.

**Reason:** fulfillment compatibility and quantity accounting need a canonical subject.

## L-024 — Integration binding and imported operational scope are persisted

**Decision:** inventory-affecting Integration use resolves to Household scope, and ImportRun directly retains exactly one target Household.

**Reason:** provider identity/credential possession must never become implicit tenant authority.

## L-025 — External references remain namespaced

**Decision:** ExternalReference resolution/uniqueness is scoped by provider/integration namespace, reference type/value and Household where operationally Household-scoped.

**Reason:** the same provider value can be valid in different accounts/tenants and must not become accidental global identity.

## L-026 — Idempotency uniqueness is scoped, not global-by-key

**Decision:** candidate identity is target scope + Household/global scope identity + principal + operation/command + client key, with immutable canonical request fingerprint.

**Reason:** prevents cross-Household collisions and payload mutation under reused keys.

## L-027 — Mutation + outbox share one durable database commit boundary

**Decision:** OutboxRecord is logically committed in the same transaction as the authoritative mutation that requires asynchronous publication.

**Reason:** avoids state where business mutation commits but required publication intent is lost, or publication claims a mutation that never committed.

## L-028 — History-bearing referenced records retire/version instead of unsafe hard-delete

**Decision:** catalog/rule/evidence/timezone identities referenced by committed history cannot be hard-deleted in a way that destroys reproducibility. Physical FK delete behavior is finalized in DB-02, but the logical requirement is RESTRICT/tombstone/version semantics.

## L-029 — Transactional allocation checks are part of the database contract

**Decision:** ReceiptItem attribution, PurchaseItem receiving pools, shopping pools, preparation conservation, transfer pairs/lineage, count adjustments and idempotency winner selection cannot be implemented as non-atomic check-then-write application logic.

**Reason:** concurrency is part of correctness, not an optimization detail.

## L-030 — Referentially significant polymorphism must remain typed

**Decision:** business relationships that require referential integrity use explicit typed FK/association structures. Generic type/id pairs are permitted only for evidentiary metadata such as AuditEvent targets where they do not substitute for domain integrity.

**Reason:** schema convenience must not erase enforceable referential semantics.

## L-031 — Future governed classification is an explicit schema extension point

**Decision:** the current DB-01 ShelfLifeRule model has concrete referential applicability targets for Product and IngredientConcept. The DB-00 phrase “another governed classification introduced later” does not authorize a generic untyped classification ID now.

**Reason:** DB-00 explicitly frames additional classification as future governance. A future target becomes valid only when its typed relation, ownership/versioning and reference constraints are introduced through reviewed schema evolution. ProductCategory is not silently assumed to be that universal taxonomy.

## L-032 — Global notification preferences are optional future user-level data

**Decision:** DB-01 does not require a `user_notification_preference` relation for acceptance.

**Reason:** DB-00 permits such a preference but does not require it. If introduced later, it influences NotificationDelivery behavior only and cannot grant Household operational authority or replace Household AlertRule/Alert ownership.
