# FridgeScanner — DB-00 Open Decisions

## Purpose

This register prevents undecided subjects from being mistaken for accepted architecture. DB-00 closes domain semantics first and deliberately defers implementation-specific choices that require later evidence.

## Decisions to close before DB-01 / DB-02

### OD-001 — StockItem granularity

Question: when several equivalent units share the same batch, location, package state and shelf-life state, may one StockItem represent an aggregate quantity, or must every physical package/unit have a distinct identity?

Direction: support aggregation where identity is not operationally meaningful, while allowing split operations when package/lifecycle state diverges. DB-01 must define the exact relational representation and split/merge semantics.

### OD-002 — Ingredient abstraction

Question: should RecipeIngredient reference Product directly, a broader Ingredient concept, or support both?

Direction: do not force recipes to depend on one commercial SKU. DB-01 must define how generic ingredients such as "milk" can be fulfilled by compatible catalog products without introducing uncontrolled free-text semantics.

### OD-003 — Measurement conversion

Question: which conversions are universal and which require product/ingredient-specific density or packaging rules?

Direction: dimension-safe conversion is mandatory. Cross-dimension conversion (for example mass ↔ volume) must never be assumed globally.

### OD-004 — Effective expiration persistence

Question: should effective expiration be calculated on read, materialized as a projection, or both?

Direction: the result must be explainable and recomputable from authoritative source facts/rules. DB-02/DB-03 will choose persistence and invalidation semantics.

### OD-005 — Negative inventory policy

Question: must authoritative inventory balance always be non-negative, or may controlled reconciliation/import workflows temporarily represent negative balance?

Direction: ordinary user flows must never silently create negative stock. Exceptional reconciliation semantics require an explicit decision before physical constraints are designed.

### OD-006 — Stock transfer representation

Question: is a transfer one movement with origin/destination, or a paired outbound/inbound ledger operation under one transfer identity?

Direction: DB-01/DB-02 must select the representation that preserves atomicity, household isolation, lineage and efficient balance calculation.

### OD-007 — Household naming and external vocabulary

Question: should the canonical code/domain term be `Household` while Portuguese UI uses `Casa`, or should code use another stable term?

Direction: `Household` is currently the canonical architecture term; UI terminology is not constrained by it.

## Decisions deliberately deferred to later phases

The following are not DB-00 blockers:

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

They must not be inferred from legacy option lists.
