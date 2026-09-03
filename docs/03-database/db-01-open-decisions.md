# FridgeScanner — DB-01 Open Decisions

## Status

This file distinguishes genuine logical-model blockers from physical implementation choices that must not reopen DB-01 unnecessarily.

At the initial DB-01 baseline, **no intentional DB-00 semantic ambiguity is being carried forward as an accepted shortcut**. The items below are review targets or explicitly deferred physical choices.

## A. DB-01 review targets

These must be challenged during review because a mistake here could materially change the logical model.

### O-001 — Polymorphic historical subject references

Several history/evidence records can refer to different domain subject classes. DB-01 currently models those cases semantically rather than choosing one generic `entity_type/entity_id` association.

**Review question:** does any relation require an additional explicit typed link relation to avoid unenforceable polymorphic foreign keys?

**Default direction:** prefer typed association relations or explicit subject columns over unconstrained generic IDs whenever referential integrity matters.

### O-002 — Quantity-lineage granularity

`inventory_quantity_lineage` is intentionally first-class, but the exact decomposition of source effect, destination effect and quantity portion must be checked against all split/merge/preparation/transfer cases.

**Review question:** can every inherited shelf-life/provenance fact be tied to the exact conserved portion without ambiguous many-to-many interpretation?

### O-003 — Count historical basis identity

DB-00 requires a trustworthy as-of/cutoff and causal-order semantics. DB-01 records this on InventoryCountItem/ReconciliationOutcome.

**Review question:** should the logical model introduce a dedicated immutable `inventory_ledger_snapshot_reference` relation rather than allowing the cutoff identity to remain an implementation-neutral value/token?

**Constraint regardless of answer:** processing time/current balance can never substitute for the captured historical basis.

### O-004 — Rule applicability to governed classification

ShelfLifeRule may target Product, IngredientConcept or a governed classification.

**Review question:** is ProductCategory sufficient as the only classification target in DB-01, or does the domain require a separate versioned classification taxonomy relation before physical schema?

**Default direction:** do not generalize prematurely; introduce a new classification relation only if DB-00 behavior cannot be represented by current ProductCategory semantics.

### O-005 — Global notification preferences

DB-00 permits genuinely user-global notification preferences that do not grant Household authority.

**Review question:** should DB-01 include a separate `user_notification_preference` relation now, or leave it outside the first database slice until notification behavior is specified further?

**Constraint regardless of answer:** preferences never substitute for Household AlertRule/Alert authorization.

## B. Explicitly deferred to DB-02 — not DB-01 blockers

The following choices must be made during physical-schema design and must conform to DB-01; they do not justify weakening or delaying the logical contracts:

- concrete primary-key type and UUID version;
- exact SQL encoding of rational numbers;
- exact SQL encoding/scale policy for money;
- PostgreSQL/domain/enum/check representation choices;
- partial/functional/exclusion index syntax;
- RLS implementation and policy syntax;
- whether composite foreign keys duplicate Household scope for direct database enforcement;
- CHECK versus trigger versus deferred constraint versus stored procedure for cross-row invariants;
- immutable-row protection mechanism;
- materialized current-balance implementation;
- EffectiveExpiration materialization strategy;
- partitioning of high-volume ledger/audit/outbox tables;
- JSON versus normalized child relations for truly opaque external-provider metadata;
- outbox payload encoding;
- migration framework and naming conventions;
- ORM mapping strategy.

## C. Rejected “open decisions”

These are already closed by DB-00/DB-01 and must not be reopened as implementation convenience:

- whether StockItem can be the sole mutable quantity truth — no;
- whether Household roles belong globally on User — no;
- whether Batch is mandatory for stock identity — no;
- whether private Products can own global GTIN-like keys — no;
- whether ambiguous count discrepancies may be auto-allocated — no;
- whether receipt and shopping allocations share one pool — no;
- whether current conversion/compatibility rules may reinterpret committed history — no;
- whether InventoryTransfer can be represented only by changing current placement — no;
- whether Recipe edits may reinterpret committed Preparation — no;
- whether exact conservation may rely on floating point/display rounding — no;
- whether provider identity can imply Household authority — no;
- whether an idempotency key is globally unique without scope/fingerprint — no.

## Exit criterion

Before DB-01 can be accepted, every item in section A must either:

1. be proven adequately represented by the existing model; or
2. produce a concrete logical-model correction and corresponding decision update.

No section-B physical choice is required to close DB-01 unless review proves it actually changes logical semantics.
