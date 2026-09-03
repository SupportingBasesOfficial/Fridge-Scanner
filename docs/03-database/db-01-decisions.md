# FridgeScanner — DB-01 Decision Register

## Status

Working decision register for DB-01. These decisions refine persistence shape without reopening accepted DB-00 semantics.

## L-001 — Direct Household scope on high-risk operational facts
**Decision:** retain direct `household_id` on high-risk operational/history relations even when derivable.  
**Reason:** tenant integrity and authorization must not depend on long/mutable joins; duplicated scope must agree with every owning parent.

## L-002 — Explicit catalog scope/owner pair
**Decision:** Product, IngredientConcept, Recipe, ShelfLifeRule and scoped compatibility mappings carry `catalog_scope` plus conditional `owner_household_id`; GLOBAL has no owner, HOUSEHOLD has exactly one.  
**Reason:** makes catalog visibility/edit/reference rules enforceable.

## L-003 — ProductIdentifier and staged identifier evidence are separate
**Decision:** unresolved Household observation of a global key is `staged_identifier_claim`, not canonical ProductIdentifier.  
**Reason:** private data cannot consume global uniqueness.

## L-004 — Exact conserved quantities are logical rationals
**Decision:** authoritative conservation/reconciliation uses exact rational semantics plus MeasurementUnit.  
**Reason:** DB-00 rejects floating point, implementation scale and rounded equality.

## L-005 — Conversion and compatibility decisions are immutable evidence
**Decision:** committed contextual conversion/concept compatibility points to exact immutable evidence.  
**Reason:** history survives later rule/profile changes.

## L-006 — Purchase money is role-bearing relational data
**Decision:** Purchase/PurchaseItem monetary facts have explicit roles rather than generic price.  
**Reason:** basis price, gross, discounts, tax/charge and net have distinct semantics.

## L-007 — ReceiptItem does not directly own PurchaseItem provenance
**Decision:** ordinary receiving uses `purchase_item_receipt_allocation`; substitutions use a separate allocation relation.  
**Reason:** explicit quantity supports partial/multiple source allocation and independent conservation.

## L-008 — ReceiptItem materialization uses explicit ledger-effect relation
**Decision:** `receipt_item_inventory_effect` links received quantity portions to InventoryMovement effects.  
**Reason:** ReceiptItem and ledger effects have different cardinality while total physical receipt must conserve exactly.

## L-009 — Receiving and shopping use distinct allocation pools
**Decision:** physical receiving/substitution and ShoppingList fulfillment are independent semantic allocation dimensions.  
**Reason:** one purchased unit can both arrive and fulfill intent without double-counting inside either dimension.

## L-010 — InventoryMovement is quantity-history authority
**Decision:** current StockItem balance may be materialized but cannot be sole truth.  
**Reason:** delayed facts, correction, transfer and historical reconstruction require immutable ledger history.

## L-011 — Current and historical placement are distinct
**Decision:** StockItem stores current placement; movements/transfers preserve occurrence-time placement.  
**Reason:** current relocation cannot rewrite history.

## L-012 — Transfer is a business identity plus paired ledger effects
**Decision:** InventoryTransfer has one source-decrement and one destination-increment with explicit lineage.  
**Reason:** conservation and placement provenance must be auditable as one operation.

## L-013 — Same-Product lineage is exact source→destination conserved edges
**Decision:** `inventory_quantity_lineage` carries source/destination movements, Product and exact quantity portion; Product-transforming Preparation is excluded.  
**Reason:** exact portion-level conservation/provenance is required.

## L-014 — Shelf-life inheritance attaches to exact lineage edges
**Decision:** `quantity_lineage_shelf_life_fact` carries inherited SourceExpirationFact, FoodLifecycleEvent and ShelfLifeRuleActivation.  
**Reason:** redistribution cannot reset expiry state.

## L-015 — Count reconciliation has explicit historical basis and outcome
**Decision:** each CountItem references `inventory_ledger_basis`; reconciliation creates explicit outcome and optional adjustment.  
**Reason:** processing-time balance cannot substitute for captured physical-count basis.

## L-016 — Session-level count basis is conditional
**Decision:** count lines share one basis only under a genuinely atomic/frozen authoritative snapshot; otherwise each line has its own.  
**Reason:** sessions may span stock changes.

## L-017 — Ambiguous count allocation is represented, not guessed
**Decision:** deterministic allocation is explicit; ambiguous discrepancies remain unresolved/staged.  
**Reason:** arbitrary allocation corrupts batch/expiry/provenance.

## L-018 — Recipe executions pin immutable RecipeVersion
**Decision:** Preparation references immutable RecipeVersion and allocations target immutable RecipeIngredient identity.  
**Reason:** later Recipe edits cannot reinterpret history.

## L-019 — Preparation source-side and target-side accounting are separate
**Decision:** input allocations/deviations exhaust consumed input while line allocations independently reconcile to scaled recipe requirements.  
**Reason:** one-sided validation permits unaccounted consumption or silent under/over-fulfillment.

## L-020 — Household timezone is versioned historical reference data
**Decision:** persist `household_timezone_version` and retain exact version in historical temporal evidence when used.  
**Reason:** timezone configuration changes cannot change historical expiration recomputation.

## L-021 — ShelfLifeRule activation is separate from EffectiveExpiration projection
**Decision:** immutable activation evidence is persisted; EffectiveExpiration/candidates are derived.  
**Reason:** activation context is history; expiration is a recomputable projection.

## L-022 — EffectiveExpiration candidate source is constrained XOR
**Decision:** each candidate references one SourceExpirationFact XOR one ShelfLifeRuleActivation.  
**Reason:** candidate provenance is unambiguous.

## L-023 — ShoppingList subject is relational XOR
**Decision:** resolved item targets Product XOR IngredientConcept; text is provenance only.  
**Reason:** fulfillment compatibility and accounting need canonical subject identity.

## L-024 — Integration binding/imported scope are persisted
**Decision:** Household-affecting integrations resolve explicit Household scope and inventory ImportRun retains exactly one target Household.  
**Reason:** provider credentials/identity cannot imply tenant authority.

## L-025 — External references remain namespaced
**Decision:** ExternalReference identity is scoped by provider/integration namespace, reference type/value and Household where operationally scoped.  
**Reason:** repeated provider values across accounts/tenants cannot become accidental global identity.

## L-026 — Idempotency uniqueness is scoped
**Decision:** target scope + Household/global identity + principal + command/version + client key define candidate identity, with immutable request fingerprint.  
**Reason:** prevents cross-tenant collisions and payload mutation under reused keys.

## L-027 — Mutation + outbox share one durable commit
**Decision:** required OutboxRecord commits atomically with authoritative mutation.  
**Reason:** avoids mutation-without-publication-intent and publication-without-mutation states.

## L-028 — History-bearing referenced records retire/version instead of unsafe hard-delete
**Decision:** catalog/rule/evidence/timezone identities referenced by history cannot be destructively deleted.  
**Reason:** historical reproducibility must survive lifecycle change.

## L-029 — Transactional allocation checks are database-contract correctness
**Decision:** receipt source/purchase pools, shopping pools, preparation, transfer/lineage, count adjustment and idempotency winner selection cannot be non-atomic check-then-write logic.  
**Reason:** concurrency is part of correctness.

## L-030 — Referentially significant polymorphism remains typed
**Decision:** business relationships requiring integrity use explicit typed FKs/associations; generic type/id is allowed only for evidence such as AuditEvent target metadata.  
**Reason:** schema convenience cannot erase referential semantics.

## L-031 — Future governed ShelfLife classification is explicit schema evolution
**Decision:** current ShelfLifeRule targets Product XOR IngredientConcept; future classification requires a reviewed typed governed relation. ProductCategory is not automatically that taxonomy.  
**Reason:** DB-00 explicitly defines additional classification as future governance.

## L-032 — Global notification preferences are optional future user-level data
**Decision:** no user-global notification preference relation is required for current DB-01.  
**Reason:** if introduced, it affects delivery only and cannot grant Household authority.

## L-033 — Preferred storage defaults are typed policy children
**Decision:** `household_product_storage_preference` uses ranked typed target StorageLocation XOR Compartment XOR governed StorageLocation kind.  
**Reason:** opaque metadata would permit incompatible schemas and unenforceable Household/cardinality semantics; preference is never actual placement truth.

## L-034 — AlertRule scope and Alert trigger evidence are typed
**Decision:** each Household AlertRule has typed `alert_rule_subject`; committed Alert retains typed `alert_trigger_subject`. Current kinds: Household, Product, StockItem, StorageLocation, Compartment, HouseholdProductPolicy.  
**Reason:** DB-00 requires governed scope and explainable triggering subject/context; generic DB-02 IDs are insufficient.

## L-035 — ExternalReference is provider provenance, not a universal canonical-target pointer
**Decision:** `external_reference` stores namespaced provider identity/import provenance and Household scope where applicable. It does not expose a universal `target_type/target_id` relationship to arbitrary canonical entities. When a concrete domain fact must retain external provenance, that domain defines a typed FK/provenance association and cardinality through reviewed schema evolution.  
**Reason:** DB-00 requires import provenance and Household isolation but does not define one universal polymorphic canonical-target relationship. Inventing one in DB-01 would reintroduce unenforceable generic polymorphism and allow materially different DB-02 schemas.
