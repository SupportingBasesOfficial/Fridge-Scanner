# FridgeScanner — Project Status

## Canonical status

- Accepted DB-00 baseline: **Domain Discovery & Invariants**, merged at `9abb805e3ad179ca98aa363a5fd6ad9cce633292`
- Accepted DB-01 baseline: **Logical / Relational Database Model**, merged at `33507116eae3e4e79f4d1242d17d7d8f847424d4`
- Accepted DB-02 baseline: **Physical PostgreSQL Schema & Enforcement**, squash-merged at `7261561bb008d70528c2905afb582ee42cba795f`
- DB-02 exact reviewed HEAD: `8952856e48807d9a50e7adb0b5d16dee5911e90c`
- Canonical SQL migrations: **accepted**
- PostgreSQL execution gate: **accepted on PostgreSQL 17 and PostgreSQL 18**
- Accepted BE-00 baseline: **Backend Foundation & Runtime Contracts**, squash-merged at `0ad61f38da15ebb237d9e6feda01bf1f8489f5d5`
- BE-00 exact reviewed HEAD: `7901afe9e78e5ab2e1d24732790396b0aedaccc4`
- BE-00 final execution gate: **accepted** — runtime/build/test, PostgreSQL/RLS integration and container non-root/health all CLEAN on the exact reviewed HEAD
- Active phase: **BE-01 — Application Contracts & Domain Kernel**
- Backend implementation: **runtime foundation accepted; application/domain kernel in progress**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, canonical ordered migration lineage, database privileges/RLS, append-only protections, transaction-safe mutation boundaries and adversarial database tests.

BE-00 establishes the accepted executable backend runtime foundation: npm workspace topology, strict TypeScript baseline, validated immutable runtime configuration, Fastify delivery adapter, structured request correlation/logging, PostgreSQL transaction adapter, least-privileged Household candidate-context authorization bootstrap, liveness/readiness semantics, graceful shutdown, reproducible dependency graph, Docker non-root runtime and CI integration gates.

DB-00, DB-01, DB-02 and BE-00 are normative for BE-01 and all later implementation. Backend convenience, framework defaults, ORM behavior, identity-provider claims or hosting-provider features may not silently weaken those accepted contracts.

Earlier DDL/design notes remain historical input only. They are not production-ready or canonical unless explicitly reconciled with the accepted baselines.

## Purpose of BE-01

BE-01 establishes the provider-neutral application contracts and domain kernel that sit above the accepted BE-00 runtime and below later feature delivery. It defines strongly typed identifiers, exact numeric/value semantics, stable application error taxonomy, command/query/use-case contracts, transaction-aware application context, clock/identifier ports, authorization context semantics and package dependency direction before feature CRUD is allowed to proliferate.

BE-01 must not turn database rows, Fastify request objects, PostgreSQL clients, Supabase/provider identities or JSON transport shapes into domain objects. Domain/application code must remain executable without HTTP, PostgreSQL, a queue or a specific identity provider.

BE-01 is a structural phase, not a feature-delivery phase. Household CRUD, catalog, inventory, procurement, replenishment, recipes, notifications and external provider workflows remain later phases unless a minimal fixture is necessary to prove a kernel contract.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization. A passing implementation does not override a violated domain, relational, physical or runtime invariant.

BE-01 must not silently reopen or weaken DB-00/DB-01/DB-02/BE-00. If implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in framework, ORM, SQL, authentication provider or deployment convenience.
