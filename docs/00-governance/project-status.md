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
- Accepted BE-02 baseline: **Identity Boundary**, formally accepted at squash commit `5f7cba8a1693a5df4cc7d61ad0c3452414b97d3c`
- BE-02 final exact reviewed HEAD: `061b9b4557787f309a3bbbf789d1ea0e47c7e592`
- BE-02 final execution/review gate: **accepted** — provider-neutral verification/mapping, current Household authorization, stale-membership regression and end-to-end authenticated proof all CLEAN on the exact reviewed HEAD
- Accepted BE-03 normative baseline: **Household Access Management**, squash-merged at `75db7717761e791c04bbe43a5762fb3381b91e3f`
- BE-03 normative exact reviewed HEAD: `b826f12cfc1307962740b3774d2f3deb01bf84af`
- Accepted BE-03 authority kernel: **Household Membership Administration Capability**, squash-merged at `9d9323122a86fbe572b7fd5bc5ea8d96a4cad65f`
- BE-03 authority-kernel exact reviewed HEAD: `5c7feb9940b5e66d857780e5eb585e36a1ddb81e`
- BE-03 authority-kernel gate: **accepted** — governed provider-neutral capability, least-privileged SECURITY DEFINER acquisition, opaque application capability, concurrency locking proof, DB-02 regression and BE-00 gate all CLEAN
- Active phase: **BE-03 — Household Access Management**
- Backend implementation: **runtime, application/domain kernel and identity boundary accepted; BE-03 governed membership mutations in progress**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, canonical ordered migration lineage, database privileges/RLS, append-only protections, transaction-safe mutation boundaries and adversarial database tests.

BE-00 establishes the accepted executable backend runtime foundation: npm workspace topology, strict TypeScript baseline, validated immutable runtime configuration, Fastify delivery adapter, structured request correlation/logging, PostgreSQL transaction adapter, least-privileged Household candidate-context authorization bootstrap, liveness/readiness semantics, graceful shutdown, reproducible dependency graph, Docker non-root runtime and CI integration gates.

BE-01 establishes the accepted provider-neutral domain/application kernel above BE-00: opaque business identifiers; canonical UUID parsing; exact rational, decimal and money semantics without JavaScript binary floating point; explicit canonical wire serialization; strict UTC instant semantics; provider-neutral application errors; verified Household transaction authority; explicit use-case contracts; intent-specific ports; machine-enforced dependency direction; semantic contract tests; and one deliberately narrow proving slice demonstrating HTTP → application → authorized persistence wiring without uncontrolled feature CRUD.

BE-02 establishes the accepted provider-neutral identity boundary: provider-authenticated evidence is verified and mapped explicitly to a platform-owned principal; provider tokens/claims never become Household authority; current Household membership is still re-evaluated inside the accepted transaction boundary; stale or ended membership cannot be revived by a still-valid authentication credential.

BE-03 establishes Household-scoped access governance above that identity boundary. The accepted authority kernel introduces the canonical `HOUSEHOLD_MEMBERSHIP_ADMINISTER` capability and a least-privileged transaction-scoped acquisition boundary. Current work adds history-preserving, intent-specific membership mutations without granting delivery/runtime broad table mutation privileges.

DB-00, DB-01, DB-02, BE-00, BE-01 and BE-02 are normative for BE-03 and all later implementation. Backend convenience, framework defaults, ORM behavior, identity-provider claims or hosting-provider features may not silently weaken those accepted contracts.

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

## BE-02 acceptance

The canonical BE-02 evidence chain is recorded in `docs/05-backend/be-02-acceptance.md`.

BE-02 was formally accepted by PR #18 at `5f7cba8a1693a5df4cc7d61ad0c3452414b97d3c`. Provider authentication proves platform principal identity only; it does not freeze or replace Household authorization. External identity mapping, current-membership authorization and nondisclosure remain separate governed boundaries.

## Purpose of BE-03

BE-03 governs who may administer Household membership and how membership authority changes safely over time.

BE-03 must consume BE-02 rather than replace it. In particular:

- current Household membership remains execution-time truth;
- membership administration requires the explicit provider-neutral `HOUSEHOLD_MEMBERSHIP_ADMINISTER` capability;
- concrete role meaning comes from governed role/capability reference data, never arbitrary strings or provider metadata;
- adding/rejoining creates a new current membership interval without rewriting historical authority;
- role change and membership end must preserve historical semantics;
- self-mutation follows explicit policy rather than accidental actor/target equality behavior;
- last-administrator survivability must be checked atomically with any mutation that could reduce administration authority;
- target identities are platform-owned principals, not provider subjects, emails or JWT claims;
- mutation persistence remains least-privileged and intent-specific;
- provider-neutral application errors and tenant nondisclosure remain authoritative.

BE-03 is not complete until a real authenticated request crosses BE-02 verification → current Household authorization → membership-administration capability → durable governed mutation while adversarial and concurrency tests preserve one-current-membership, history and survivability invariants.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization. A passing implementation does not override a violated domain, relational, physical, runtime, application-kernel, identity-boundary or Household-access invariant.

BE-03 must not silently reopen or weaken DB-00/DB-01/DB-02/BE-00/BE-01/BE-02. If implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in framework, ORM, SQL, authentication provider or deployment convenience.
