# FridgeScanner — DB-02 Open Decisions

## Status

DB-02 has an initial physical baseline. The items below are proof/review targets that can still change the physical implementation while preserving DB-01 semantics.

## A. Current physical blockers

### O2-001 — Final application schema namespace names

**Question:** confirm the canonical PostgreSQL schema names for business objects and internal helpers before SQL migration acceptance.

**Default direction:** use provider-neutral PostgreSQL schemas such as `fridge` for canonical business objects and `fridge_internal` for privileged helpers. Do not rely on `public` as an uncontrolled application namespace.

### O2-002 — Rational canonicalization implementation

**Question:** prove one PostgreSQL 17-compatible normalization routine for arbitrary-precision integral `numeric` numerator/denominator, including gcd, sign normalization and `0/1`, without overflow-prone casts.

**Gate:** database tests must prove exact 1/3, negative values, large values and split/merge equality.

### O2-003 — Constraint-trigger versus transaction-function boundary

**Question:** for each cross-row conservation invariant, determine whether deferred constraint triggers add useful independent protection or whether all authoritative writes must be exclusively reachable through one privileged transaction routine plus postcondition checks.

**Default direction:** use both where practical for high-risk conservation, but avoid duplicated rule engines that can diverge.

### O2-004 — Current-balance projection shape

**Question:** choose between view, materialized projection table, or transactionally maintained aggregate after correctness/performance tests.

**Invariant:** no choice can make projected balance authoritative over InventoryMovement.

### O2-005 — EffectiveExpiration projection shape

**Question:** choose stored projection table versus calculated read path based on expected read/write ratio and invalidation complexity.

**Invariant:** source facts/rule activation/evidence remain authoritative and projection stays rebuildable.

### O2-006 — Exact role/grant mapping across plain PostgreSQL and Supabase

**Question:** map provider-neutral privilege classes (owner/migrator/application/worker/read-only) to concrete roles in local Docker and hosted Supabase without granting normal client traffic owner/service bypass privileges.

**Invariant:** privilege capability matters more than provider role name.

## B. Closed physical decisions

Already resolved by `db-02-decisions.md` and not open for convenience:

- PostgreSQL 17.x initial minimum baseline;
- forward-compatibility lane for PostgreSQL 18;
- UUID PK contract;
- exact rational numerator/denominator storage;
- no floating point for authoritative quantity/money;
- `numeric` money rather than PostgreSQL `money`;
- direct Household scope on high-risk rows;
- composite FKs where practical for Household equality;
- fixed typed XOR relationships rather than generic polymorphic IDs;
- RLS defense in depth with fail-closed trusted context;
- immutable/append-only authoritative history;
- transaction-safe multi-row mutation boundaries;
- `timestamptz` for authoritative instants;
- date-only expiration retained as date precision plus provenance;
- `jsonb` restricted away from invariant-bearing relational truth;
- no default partitioning without measured need;
- plain ordered SQL migrations as canonical schema lineage;
- migration forward-fix/expand-contract posture;
- ORM subordinate to the database contract;
- extension deny-by-default.

## C. Explicitly deferred beyond DB-02

These do not block physical schema acceptance unless implementation proves they affect database correctness:

- backend ORM/library selection;
- HTTP/API framework;
- cache technology;
- event broker/queue provider;
- application deployment platform;
- read-model/search service extraction;
- telemetry warehouse.

## Exit criterion

DB-02 cannot be declared CLEAN while any Section A item can still produce materially different correctness/enforcement semantics. Projection storage choices may remain implementation-tunable only if both candidate forms are proven semantically equivalent and the accepted migration chooses one explicit initial form.
