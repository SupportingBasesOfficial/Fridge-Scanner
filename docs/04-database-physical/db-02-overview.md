# FridgeScanner — DB-02 Physical Database Schema & Enforcement

## Status

DB-02 working contract. DB-00 and DB-01 are accepted and normative. DB-02 translates the accepted logical model into a concrete PostgreSQL schema/enforcement design without weakening any domain or relational invariant.

## Technology baseline

- Database engine: PostgreSQL 17.x minimum supported major for the initial deployment baseline.
- Compatibility target: schema and migration design should remain forward-compatible with PostgreSQL 18 where no DB-01 invariant requires version-specific behavior.
- Provider posture: PostgreSQL is the database contract; Supabase may host/provision PostgreSQL but must not become the domain model.
- Extensions: deny-by-default. An extension may be introduced only when a concrete requirement cannot be satisfied safely with core PostgreSQL or when the benefit is material and portability/upgrade cost is documented.

## Source-of-truth hierarchy

1. DB-00 domain contracts and invariants.
2. DB-01 logical relational model and integrity contracts.
3. DB-02 physical schema/enforcement contracts.
4. SQL migrations and database tests.
5. Backend/ORM mappings.

A lower layer that violates a higher layer is wrong even when it passes application tests.

## DB-02 deliverables

- `db-02-overview.md` — phase scope and physical-design rules.
- `db-02-decisions.md` — accepted physical choices and rationale.
- `db-02-enforcement-map.md` — DB-01 integrity contract → concrete PostgreSQL mechanism.
- `db-02-migration-strategy.md` — migration, rollback/forward-fix, deployment and validation rules.
- `db-02-open-decisions.md` — only unresolved physical blockers.
- SQL schema/migrations and database-level validation tests once the physical contract is accepted enough to encode safely.

## Physical-design rules

### P1 — PostgreSQL constraints are preferred over application-only checks

Use PK, FK, UNIQUE, CHECK, exclusion constraints, generated values and transactionally invoked functions/triggers where they can safely enforce an invariant. Application validation is additive, never a substitute for durable integrity.

### P2 — Household scope is explicit on high-risk rows

High-risk Household-scoped facts retain `household_id` physically even when derivable. Where practical, composite candidate keys and composite FKs enforce parent/child Household equality directly.

### P3 — Historical facts are append-only

Inventory ledger/evidence/history rows are protected against ordinary UPDATE/DELETE. Corrections append compensating/correction facts according to DB-00/DB-01.

### P4 — Exact quantities never use floating point

Conserved/reconciled quantities use an exact rational representation. Display rounding is outside authoritative quantity storage.

### P5 — Money is exact and currency-scoped

Money uses exact decimal/numeric semantics with explicit ISO-style currency identity and role. Binary floating point is forbidden for authoritative money.

### P6 — RLS is defense in depth, not the only integrity boundary

Household RLS policies protect reads/writes by current trusted principal context, but FKs/constraints/transaction functions still enforce structural tenant integrity independently.

### P7 — Privilege model is deny-by-default

Application roles do not receive unrestricted table mutation rights. Sensitive multi-row mutations are exposed through narrow transaction-safe database routines where direct DML cannot preserve invariants reliably.

### P8 — Projection tables are disposable

Current balances, effective expiration and other projections are reconstructible. Their schema and invalidation/rebuild strategy must preserve that property.

### P9 — Migrations are immutable after acceptance

Applied migration files are never edited in place. Corrections are new migrations. Development squashing is allowed only before an accepted/deployed migration lineage exists and must be explicit.

### P10 — Schema evolution is additive-first

Prefer expand → backfill/verify → switch → contract. Destructive changes require evidence that old readers/writers are fenced and data has been migrated/verified.

## Gate to leave DB-02

DB-02 is complete only when:

1. every DB-01 physical decision deferred to DB-02 has one explicit resolution;
2. every DB-01 integrity contract maps to a concrete PostgreSQL enforcement mechanism or an explicit transactional routine with rationale;
3. the full schema can be created from an empty database deterministically;
4. database tests prove tenant isolation, conservation, XOR/cardinality, immutability and idempotency invariants;
5. migration and rollback/forward-fix behavior is documented and tested;
6. no provider-specific convenience becomes authoritative domain truth;
7. exact current HEAD passes physical-schema review before merge.
