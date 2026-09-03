# FridgeScanner — DB-01 Logical / Relational Model

## Status

DB-01 working contract. This phase translates the accepted DB-00 conceptual model and invariants into a technology-neutral logical relational model.

DB-00 remains normative. DB-01 may refine persistence structure only where one logical representation is required to make a DB-00 invariant enforceable. It must not silently reopen or weaken an accepted domain decision.

## Purpose

DB-01 defines:

- logical relations and their responsibilities;
- stable logical identifiers and parent/child cardinalities;
- ownership and Household isolation paths;
- candidate keys and uniqueness domains;
- mandatory versus optional relationships;
- immutable/history-bearing versus mutable/current-state relations;
- explicit allocation/evidence/link relations required by DB-00;
- cross-row and cross-relation integrity contracts;
- which facts are authoritative and which are projections;
- transaction-boundary expectations needed to preserve invariants.

DB-01 does **not** yet choose:

- physical SQL column types;
- UUID implementation/version;
- ORM;
- database extensions;
- concrete indexes;
- partitioning strategy;
- generated-column syntax;
- trigger implementation language;
- RLS syntax/provider specifics;
- migration tooling;
- cache/search/queue technology.

Those are DB-02/implementation concerns and must conform to this model.

## Source-of-truth hierarchy

1. `docs/01-product/product-scope.md`
2. `docs/02-domain/domain-invariants.md`
3. `docs/02-domain/canonical-domain-model.md`
4. `docs/02-domain/db-00-decisions.md`
5. this DB-01 contract set
6. future physical schema and implementation

If a lower layer conflicts with a higher layer, the lower layer is wrong until the conflict is explicitly governed and accepted.

## Relational modeling rules

### R1 — Household isolation is structurally recoverable

Every Household-owned operational relation must carry a direct `household_id` or have one single, non-ambiguous immutable ownership path to a parent that carries it. High-risk operational facts such as inventory movements, counts, receipts, preparations, waste, alerts, imports and idempotency records retain direct Household scope even when it could be derived, because authorization and integrity must not depend on a long mutable join path.

### R2 — Global and Household catalog scopes are explicit

Relations representing Product, IngredientConcept, Recipe, ShelfLifeRule and governed compatibility data expose one explicit catalog scope. `GLOBAL` scope has no Household owner; `HOUSEHOLD` scope requires exactly one owning Household. Cross-scope references follow DB-00 visibility rules.

### R3 — Current state never replaces history

Mutable current-state relations such as `stock_item` may hold the current placement/state necessary for operation, but immutable `inventory_movement` and lineage/evidence relations remain authoritative for historical reconstruction. A cached/current balance is a projection, never the only quantity truth.

### R4 — Semantic alternatives are represented as constrained alternatives

Where DB-00 defines XOR semantics, DB-01 retains them explicitly rather than collapsing them into ambiguous nullable references. Examples include:

- Product versus IngredientConcept shopping subject;
- StorageLocation versus Compartment placement anchor;
- global versus Household ownership;
- ordinary receipt allocation versus explicit substitution allocation;
- SourceExpirationFact versus ShelfLifeRuleActivation as one expiration candidate source.

### R5 — Exact quantities are logical rationals

Every authoritative conserved/reconciled quantity is a logical rational value plus MeasurementUnit. The physical representation must be lossless. DB-01 refers to this pair as `RationalQuantity(amount, unit_id)`; DB-02 will choose the storage encoding.

### R6 — Money is role-bearing and currency-bearing

A monetary fact is never a naked numeric value. Logical monetary facts preserve exact amount, currency and semantic role/provenance when required by DB-00.

### R7 — Evidence is first-class when history depends on it

Conversion, compatibility, normalization, temporal-selection and reconciliation evidence that can change future interpretation is stored or immutably referenced by committed business facts. History must remain reproducible without consulting only the latest mutable rule/profile/timezone configuration.

### R8 — Immutable facts are corrected, not rewritten

Inventory movements, committed allocation/evidence records and other historical facts are append/correct-by-compensation unless DB-00 explicitly classifies a field as mutable metadata. Physical implementation must prevent ordinary update/delete paths from rewriting authoritative history.

### R9 — Derived projections are explicitly non-authoritative

Effective expiration, current stock balance, occupancy and similar read-optimized values may be materialized, but their derivation source and recomputation contract are preserved. A projection cannot become an independent competing truth.

### R10 — DB-01 constraints define the minimum database contract

An application-level check alone is insufficient for invariants that can be expressed safely in relational constraints or atomic database transactions. DB-02 must maximize database-enforced integrity while keeping genuinely cross-aggregate/domain-policy checks deterministic and transactional.

## DB-01 deliverables

- `logical-relational-model.md` — canonical logical relations and cardinalities.
- `relational-integrity-contracts.md` — keys, uniqueness, XOR rules, conservation and transaction-level constraints.
- `db-01-decisions.md` — accepted logical modeling decisions and rationale.
- `db-01-open-decisions.md` — unresolved logical choices, or an explicit statement that none are currently known; physical implementation choices are not DB-01 blockers.
- `db-01-review-findings.md` — independent review traceability for findings, corrections and exact review-baseline context.

## Gate to leave DB-01

DB-01 is complete only when:

1. every DB-00 domain concept requiring durable persistence has a logical home or an explicit reason for remaining derived/transient;
2. every DB-00 relationship/cardinality has one unambiguous relational representation;
3. Household isolation and catalog visibility can be enforced from persisted scope data;
4. inventory conservation, receiving, waste, counting, preparation, transfer and redistribution history have sufficient persisted identity/evidence for deterministic reconstruction;
5. historical expiration decisions remain reproducible across rule, compatibility and Household-timezone evolution;
6. no relation reintroduces a rejected DB-00 conflation;
7. all material logical ambiguities are closed or explicitly recorded as DB-01 open decisions;
8. the exact DB-01 HEAD passes panoramic review before merge.
