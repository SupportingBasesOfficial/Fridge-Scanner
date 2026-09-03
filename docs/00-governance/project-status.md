# FridgeScanner — Project Status

## Canonical status

- Phase: **DB-00 — Domain Discovery & Invariants**
- Product implementation: **not started**
- Database migrations: **not started**
- Backend implementation: **not started**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Purpose of DB-00

DB-00 establishes the domain vocabulary, ownership boundaries, lifecycle semantics and invariants that must exist before a physical database schema is accepted.

No DDL from earlier design notes is considered production-ready or canonical until it is reconciled with the DB-00 contracts.

## Governance rule

The repository is the canonical source of truth. Design inputs may be preserved as historical context, but accepted contracts in this repository take precedence over earlier drafts.

Changes progress through branch → review → exact-HEAD validation → explicit merge authorization. A passing implementation does not override a violated domain invariant.
