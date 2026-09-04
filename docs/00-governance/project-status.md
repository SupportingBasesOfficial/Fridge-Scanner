# FridgeScanner — Project Status

## Canonical status

- Accepted DB-00 baseline: **Domain Discovery & Invariants**, merged at `9abb805e3ad179ca98aa363a5fd6ad9cce633292`
- Accepted DB-01 baseline: **Logical / Relational Database Model**, merged at `33507116eae3e4e79f4d1242d17d7d8f847424d4`
- Active phase: **DB-02 — Physical Database Schema & Enforcement**
- DB-02 status: **physical design and PostgreSQL enforcement baseline in progress; not yet accepted**
- Canonical SQL migrations: **not yet accepted**
- Backend implementation: **not started**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model and integrity boundaries. Both are normative for DB-02 and all later implementation.

Earlier DDL/design notes remain historical input only. They are not production-ready or canonical unless explicitly reconciled with the accepted DB-00/DB-01/DB-02 contracts.

## Purpose of DB-02

DB-02 translates the accepted logical model into a concrete PostgreSQL physical schema and enforcement design: physical types, keys, constraints, indexes, RLS/privileges, immutable-history protection, transaction-safe routines, projection strategy, migrations and database-level invariant tests.

The initial database baseline targets PostgreSQL 17.x while preserving forward compatibility with PostgreSQL 18 where possible. PostgreSQL is the database contract; a hosting provider such as Supabase may provision it but does not define domain truth.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization. A passing implementation does not override a violated domain or relational invariant.

DB-02 must not silently reopen or weaken DB-00/DB-01. If physical implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in SQL, ORM or provider convenience.
