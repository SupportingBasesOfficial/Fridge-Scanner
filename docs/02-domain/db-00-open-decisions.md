# FridgeScanner — DB-00 Decision Register

## Status

The nine DB-00 conceptual decisions currently tracked here are **resolved** by `db-00-decisions.md` as D-001 through D-009. This file remains as the traceability register showing what was open, how it was closed, and which implementation-specific subjects are deliberately deferred.

No item in the resolved section below is an open blocker for DB-01. If a later phase needs to change one of these decisions, it must do so explicitly through governed architecture change rather than by silently changing table shape or implementation behavior.

## Resolved DB-00 decisions

### OD-001 — StockItem granularity → resolved by D-001

Resolution: StockItem uses state-coherent aggregate identity. Aggregation is allowed while identity-affecting state remains coherent; split/merge semantics must preserve lifecycle, ownership, measurement, provenance and audit meaning.

### OD-002 — Ingredient abstraction → resolved by D-002

Resolution: RecipeIngredient targets `IngredientConcept`, not commercial stock. Controlled compatibility mapping determines which Products can satisfy an IngredientConcept, with exact-product constraints only when genuinely required.

### OD-003 — Measurement conversion → resolved by D-003

Resolution: units have explicit dimensions. Same-dimension conversions may use canonical conversion rules; cross-dimension conversion requires explicit product/ingredient context such as density or package equivalence.

### OD-004 — Effective expiration persistence and temporal arithmetic → resolved by D-004

Resolution: effective expiration may be materialized for efficient reads and alerts, but authoritative truth remains the source facts, lifecycle/storage facts and versioned shelf-life rules. The projection must be explainable, invalidatable and recomputable. Relative ShelfLifeRule arithmetic explicitly records elapsed-vs-local-calendar basis, temporal unit, endpoint semantics, governed timezone/version context and canonical month/year end-of-month clamping when required, so rollover and DST/timezone transitions cannot produce implementation-dependent deadlines.

### OD-005 — Negative inventory policy → resolved by D-005

Resolution: committed authoritative inventory cannot become negative. Ambiguous imports/reconciliation remain staged until they can be committed without fabricating negative stock.

### OD-006 — Stock transfer representation → resolved by D-006

Resolution: one atomic `InventoryTransfer` domain operation produces two linked ledger effects: source decrement and destination increment under one transfer identity.

### OD-007 — Household naming and external vocabulary → resolved by D-007

Resolution: `Household` is the canonical architecture/code term. User interfaces may localize it as `Casa` or another product-language term.

### OD-008 — PurchaseItem monetary basis → resolved by D-008

Resolution: purchase-line money is modeled by explicit semantic role rather than a generic ambiguous price. Unit/basis price identifies its pricing quantity/unit; gross, discount, tax/line charges and net are explicit and reconciled under a governed rounding policy. Purchase-level charges remain distinct unless an explicit derived allocation preserves its method and provenance.

### OD-009 — Recipe catalog governance → resolved by D-009

Resolution: Recipe and RecipeVersion have explicit global-or-Household scope. Versions inherit Recipe ownership; global recipes cannot reference private Household Products; household recipes and Preparations may reference/execute only global or same-Household catalog entities. Cross-scope publication, sharing or cloning is an explicit provenance-preserving workflow.

## Decisions deliberately deferred to later phases

The following are intentionally unresolved because they depend on the accepted domain/database contracts and are not DB-00 blockers:

- PostgreSQL physical type/index choices;
- ORM/query layer;
- backend language/framework;
- REST vs another API interaction model;
- frontend framework;
- mobile implementation technology;
- cloud/deployment provider;
- queue/cache selection;
- Kubernetes or other orchestrators;
- telemetry storage technology.

These subjects must not be inferred from legacy option lists. Each becomes a governed decision only when its owning phase has enough evidence to close it.
