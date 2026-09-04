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
- Accepted BE-01 baseline: **Application Contracts & Domain Kernel**, final implementation lineage incorporated through squash commit `73d4345e42a958cd966fea012ce4ae8d360c8531`
- BE-01 final exact reviewed HEAD: `11dbf0313cf882385ae05f302a0d0a5ca09b97c0`
- BE-01 final execution/review gate: **accepted** — dependency boundaries, strict TypeScript/build/tests, DB-02/RLS regression, container regression, exact-value round trips and final review all CLEAN on the exact reviewed HEAD
- Active phase: **BE-02 — Identity Boundary**
- Backend implementation: **runtime foundation and provider-neutral application/domain kernel accepted; identity boundary in progress**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, canonical ordered migration lineage, database privileges/RLS, append-only protections, transaction-safe mutation boundaries and adversarial database tests.

BE-00 establishes the accepted executable backend runtime foundation: npm workspace topology, strict TypeScript baseline, validated immutable runtime configuration, Fastify delivery adapter, structured request correlation/logging, PostgreSQL transaction adapter, least-privileged Household candidate-context authorization bootstrap, liveness/readiness semantics, graceful shutdown, reproducible dependency graph, Docker non-root runtime and CI integration gates.

BE-01 establishes the accepted provider-neutral domain/application kernel above BE-00: opaque business identifiers; canonical UUID parsing; exact rational, decimal and money semantics without JavaScript binary floating point; explicit canonical wire serialization; strict UTC instant semantics; provider-neutral application errors; verified Household transaction authority; explicit use-case contracts; intent-specific ports; machine-enforced dependency direction; semantic contract tests; and one deliberately narrow proving slice demonstrating HTTP → application → authorized persistence wiring without uncontrolled feature CRUD.

DB-00, DB-01, DB-02, BE-00 and BE-01 are normative for BE-02 and all later implementation. Backend convenience, framework defaults, ORM behavior, identity-provider claims or hosting-provider features may not silently weaken those accepted contracts.

Earlier DDL/design notes remain historical input only. They are not production-ready or canonical unless explicitly reconciled with the accepted baselines.

## BE-01 acceptance

The canonical BE-01 evidence chain is recorded in `docs/05-backend/be-01-acceptance.md`.

BE-01 was delivered through:

- PR #5 — normative B1-001 through B1-015 baseline;
- PR #7 — executable domain/application kernel;
- PR #8 — one narrow authorized proving slice;
- PR #9 — exact serialization closure.

The accepted architecture direction remains:

```text
Domain <- Application <- Adapters / Delivery / Runtime
```

Later phases may extend the system with new domain/application contracts, but may not bypass the accepted dependency, exactness, authority or serialization boundaries.

## Purpose of BE-02

BE-02 establishes the real identity boundary that converts provider-authenticated evidence into a verified platform principal without allowing provider tokens, raw request data or requested Household identifiers to become application authority.

BE-02 must consume BE-01 rather than replace it. In particular:

- provider identity is not platform authority;
- authenticated principal resolution remains a delivery/runtime boundary responsibility;
- Household authorization remains current-membership verified inside the accepted transaction boundary;
- provider-specific claims and SDK models may not leak into domain/application contracts;
- application use cases continue receiving provider-neutral semantic inputs and verified authority only.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization. A passing implementation does not override a violated domain, relational, physical, runtime or application-kernel invariant.

BE-02 must not silently reopen or weaken DB-00/DB-01/DB-02/BE-00/BE-01. If implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in framework, ORM, SQL, authentication provider or deployment convenience.
