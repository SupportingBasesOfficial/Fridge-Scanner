# FridgeScanner — Project Status

## Canonical status

- Accepted baseline: **DB-00 — Domain Discovery & Invariants** merged into `main` at `9abb805e3ad179ca98aa363a5fd6ad9cce633292`
- Active phase: **DB-01 — Logical / Relational Database Model**
- DB-01 implementation status: **design/review in progress; not yet accepted**
- Physical database migrations: **not started**
- Backend implementation: **not started**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted DB-00 foundation

DB-00 establishes the canonical domain vocabulary, ownership boundaries, lifecycle semantics and invariants. Its accepted contracts are normative for DB-01 and all later implementation.

Earlier DDL/design notes remain historical input only. They are not production-ready or canonical unless explicitly reconciled with the accepted DB-00/DB-01 contracts.

## Purpose of DB-01

DB-01 translates accepted domain contracts into a technology-neutral logical relational model: relations, ownership paths, cardinalities, candidate keys, integrity constraints, immutable evidence/history relations and required transaction boundaries.

DB-01 does not yet select physical SQL types, ORM, indexes, extensions, RLS syntax, migration tooling or deployment topology. Those decisions follow only after the logical model is accepted.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization. A passing implementation does not override a violated domain invariant.

DB-01 must not silently reopen or weaken DB-00. If logical modeling exposes a genuine contradiction in DB-00, the contradiction must be recorded and governed explicitly rather than hidden in schema convenience.
