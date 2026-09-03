# FridgeScanner — DB-02 Open Decisions

## Status

DB-02 has an initial physical baseline. The items below are proof/review targets that can still change the physical implementation while preserving DB-01 semantics.

## A. Current physical blockers

### O2-002 — Rational canonicalization execution proof

**State:** physical design implemented; execution proof pending.

`000001__bootstrap.sql` provides a PostgreSQL-17-compatible arbitrary-precision Euclidean GCD and rational normalization using integral `numeric`, positive denominator and canonical `0/1`. No fixed-width cast or decimal approximation participates.

**Gate:** automated PostgreSQL 17 execution must pass `database/tests/integrity/000001__rational_primitives.sql`, including exact 1/3, sign normalization, large values and invalid-input rejection. PostgreSQL 18 compatibility should also be exercised.

No other intentional physical-model blocker is currently open. New SQL/red-team findings may reopen this section.

## B. Closed physical decisions

### O2-001 — Final application schema namespace names — CLOSED

Canonical business/database objects use schema `fridge`; privileged implementation helpers use `fridge_internal`. Canonical application truth does not rely on an uncontrolled default `public` namespace. Provider-managed schemas remain separate.

### O2-003 — Constraint-trigger versus transaction-function boundary — CLOSED

Transaction-safe mutation routines own business decisions for cross-row operations. Deferred constraint triggers, when useful, verify narrow transaction-end mathematical/relational postconditions only; they do not duplicate policy selection or domain decision logic.

### O2-004 — Current-balance projection shape — CLOSED

Initial current balance is an ordinary read-only SQL view derived exactly from committed InventoryMovement ledger facts. A materialized/maintained projection may be introduced later only for measured performance need and remains rebuildable/non-authoritative.

### O2-005 — EffectiveExpiration projection shape — CLOSED

Initial EffectiveExpiration is a persisted derived projection table with derivation version/status, invalidation/rebuild semantics and candidate provenance. Authoritative expiration inputs remain source facts, lifecycle evidence, rule activations and lineage.

### O2-006 — Role/grant model across plain PostgreSQL and Supabase — CLOSED

Provider-neutral capability classes are `fridge_owner`, `fridge_migrator`, `fridge_app`, `fridge_worker` and `fridge_readonly`. Login identities bind to capabilities per environment. Supabase `anon`/`authenticated` receive no direct canonical table access by default; Data API exposure requires later explicit views/RPC contracts. `service_role` is not the ordinary request authority and must not be used as the normal RLS-bypass path.

RLS custom transaction context is defense in depth for trusted server connections, not a cryptographic authentication mechanism; untrusted clients never receive database capability credentials.

Also resolved by `db-02-decisions.md` and not open for convenience:

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

DB-02 cannot be declared CLEAN while any open proof requirement can still reveal a materially different correctness/enforcement outcome. New schema findings reopen this register even when previously known items are closed.
