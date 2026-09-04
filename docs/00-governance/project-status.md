# FridgeScanner — Project Status

## Canonical status

- Accepted DB-00 baseline: **Domain Discovery & Invariants**, merged at `9abb805e3ad179ca98aa363a5fd6ad9cce633292`
- Accepted DB-01 baseline: **Logical / Relational Database Model**, merged at `33507116eae3e4e79f4d1242d17d7d8f847424d4`
- Accepted DB-02 baseline: **Physical PostgreSQL Schema & Enforcement**, squash-merged at `7261561bb008d70528c2905afb582ee42cba795f`
- DB-02 exact reviewed HEAD: `8952856e48807d9a50e7adb0b5d16dee5911e90c`
- Canonical SQL migrations: **accepted**
- PostgreSQL execution gate: **accepted on PostgreSQL 17 and PostgreSQL 18**
- Active phase: **BE-00 — Backend Foundation & Runtime Contracts**
- Backend implementation: **foundation in progress; not yet accepted**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, canonical ordered migration lineage, database privileges/RLS, append-only protections, transaction-safe mutation boundaries and adversarial database tests.

DB-00, DB-01 and DB-02 are normative for BE-00 and all later implementation. Backend convenience, framework defaults, ORM behavior or hosting-provider features may not silently weaken those accepted contracts.

Earlier DDL/design notes remain historical input only. They are not production-ready or canonical unless explicitly reconciled with the accepted DB-00/DB-01/DB-02 contracts.

## Purpose of BE-00

BE-00 establishes the backend runtime architecture and executable foundation that will consume the accepted database contract without becoming a second source of domain truth. It defines service boundaries, dependency direction, configuration/secrets handling, database transaction/context discipline, identity/authentication boundary, API error/observability contracts, health/readiness semantics, container/runtime baseline, testing layers and CI gates.

The first backend implementation must remain replaceable at infrastructure boundaries and must never expose privileged database capabilities to untrusted clients. With DB-02 forced RLS on membership, ordinary tenant authorization uses a least-privileged, transaction-local candidate Household context solely to read the candidate Household's membership row; the adapter exposes tenant work only after verifying the authenticated principal's current membership. Candidate context alone is never authority and any failure rolls back.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization. A passing implementation does not override a violated domain, relational or physical invariant.

BE-00 must not silently reopen or weaken DB-00/DB-01/DB-02. If backend implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in framework, ORM, SQL, authentication provider or deployment convenience.
