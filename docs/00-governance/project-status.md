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
- Accepted BE-01 baseline: **Application Contracts & Domain Kernel**, baseline squash-merged at `6c425b4813bdbb83d4fc450cbe70c8ef7bdd073a`
- Accepted BE-01 kernel implementation: squash-merged at `0fde96ce4b9d0bd6b23849c7841a2272febebdfb`; exact reviewed HEAD `7e760c2e40d2cc95280c298ab6fd98d6f77158b5`
- Accepted BE-01 proving vertical slice: squash-merged at `a015075e56f4793ad8ef8882b2d629058c837a78`; exact reviewed HEAD `df91f396b95a2ae04a132c99e850959473304e8d`
- BE-01 final execution/review gate: **accepted** — semantic kernel, dependency boundaries, verified Household transaction authority, provider-neutral use-case wiring, explicit serialization, nondisclosure mapping, DB-02/RLS regression and container regression all CLEAN on the accepted exact HEADs
- Active phase: **BE-02 — Identity & Authentication Boundary**
- Backend implementation: **runtime foundation, application/domain kernel and proving slice accepted; identity/authentication boundary next**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, canonical ordered migration lineage, database privileges/RLS, append-only protections, transaction-safe mutation boundaries and adversarial database tests.

BE-00 establishes the accepted executable backend runtime foundation: npm workspace topology, strict TypeScript baseline, validated immutable runtime configuration, Fastify delivery adapter, structured request correlation/logging, PostgreSQL transaction adapter, least-privileged Household candidate-context authorization bootstrap, liveness/readiness semantics, graceful shutdown, reproducible dependency graph, Docker non-root runtime and CI integration gates.

BE-01 establishes the accepted provider-neutral domain/application kernel: opaque DB-02-aligned identifiers, exact rational/decimal/money semantics without JavaScript floating point, stable application error taxonomy, explicit use-case/port contracts, machine-enforced dependency direction, verified Household transaction capability, intent-specific persistence ports and one narrow proving vertical slice through application → PostgreSQL adapter → HTTP. The proving slice deliberately leaves runtime principal authentication fail-closed rather than trusting raw headers or requested identifiers.

DB-00, DB-01, DB-02, BE-00 and BE-01 are normative for BE-02 and all later implementation. Backend convenience, framework defaults, ORM behavior, identity-provider claims or hosting-provider features may not silently weaken those accepted contracts.

Earlier DDL/design notes remain historical input only. They are not production-ready or canonical unless explicitly reconciled with the accepted baselines.

## Purpose of BE-02

BE-02 establishes the trusted principal-authentication boundary required before real feature delivery can depend on authenticated user identity.

It must convert provider-specific authentication evidence into a platform-owned verified `PrincipalId` without allowing provider tokens, JWT claims, cookies, headers or requested identifiers to become Household authority by themselves. Authentication proves who the platform principal is; current Household authorization remains a separate decision performed through the accepted BE-00/BE-01 authorized Household transaction boundary.

BE-02 must remain replaceable at the provider edge. Provider SDKs, key-discovery mechanisms, session/token formats and hosted identity services belong to adapters. Application/domain code consumes only verified platform principal identity and stable provider-neutral failures.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization. A passing implementation does not override a violated domain, relational, physical, runtime, application or authority invariant.

BE-02 must not silently reopen or weaken DB-00/DB-01/DB-02/BE-00/BE-01. If implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in framework, provider, JWT, cookie, SQL or deployment convenience.
