# FridgeScanner — BE-00 Decisions

## Status

This register contains backend-foundation decisions that are authoritative for BE-00 once merged. They must remain consistent with accepted DB-00/DB-01/DB-02.

## B0-001 — Architecture style

**Decision:** modular monolith with ports/adapters and explicit domain/application/adapters/delivery/runtime dependency boundaries.

**Reasoning:** the system needs strong module boundaries and replaceable infrastructure without paying the operational complexity of premature service distribution.

**Rule:** domain and application code may not import delivery/framework/database/provider implementations.

## B0-002 — Database authority

**Decision:** PostgreSQL is the authoritative business store; canonical SQL migrations remain schema authority.

**Rule:** no ORM schema-generation or migration facility may become canonical. Database adapters are subordinate to DB-02.

## B0-003 — Transaction ownership

**Decision:** application use cases own transaction scope explicitly through an application port. Infrastructure may implement that port but must not create hidden ambient transactions.

**Rule:** a use case that requires atomicity receives one explicit transaction boundary. External network calls do not run inside ordinary long-lived database transactions.

## B0-004 — Household database context

**Decision:** trusted Household context is installed inside the same PostgreSQL transaction that executes tenant-scoped work, after backend authorization resolves the Household.

**Rule:** context must use transaction-local semantics. Missing/invalid context fails closed. The context value is defense in depth, not cryptographic authentication.

## B0-005 — Credentials and database roles

**Decision:** runtime identities bind to DB-02 capability roles per environment. Browser/untrusted clients never receive canonical database capability credentials.

**Rule:** ordinary tenant requests use the least-privileged application capability and must not depend on owner/migrator/service-role bypass.

## B0-006 — Exact numeric representation

**Decision:** authoritative quantity and money values are represented in backend code with exact decimal/integer string or bigint-backed value objects as appropriate; JavaScript binary floating point is prohibited for authoritative arithmetic.

**Rule:** API contracts preserve exactness; no silent parse through `number` is permitted for rational numerator/denominator or monetary amount.

## B0-007 — Errors

**Decision:** domain/application errors use a provider-neutral typed taxonomy. Delivery adapters translate those errors to transport responses.

**Rule:** PostgreSQL/provider error strings are not public API contracts. Internal causes may be logged with classification and correlation identifiers while client responses remain stable and non-sensitive.

## B0-008 — Observability

**Decision:** every inbound request receives or validates a correlation identifier; logs are structured; secrets and credential material are never logged.

**Rule:** business identifiers may be logged only according to data classification; authentication tokens, DB URLs with passwords, credential references resolved to secret material and raw provider secrets are redacted.

## B0-009 — Health semantics

**Decision:** liveness and readiness are distinct.

- liveness proves the process event loop/runtime is operational;
- readiness proves required dependencies for serving normal traffic are available.

**Rule:** a database outage must not normally kill liveness, but it must make readiness fail when the API cannot safely serve its contract.

## B0-010 — Configuration

**Decision:** configuration is parsed once at composition-root startup into an immutable validated object.

**Rule:** application/domain code does not read `process.env` directly. Missing or malformed required configuration fails startup rather than falling back to unsafe defaults.

## B0-011 — Dependency injection

**Decision:** dependencies are wired only at composition roots. Domain/application modules depend on explicit interfaces/ports rather than a global service locator.

## B0-012 — HTTP framework isolation

**Decision:** the HTTP framework is a delivery adapter, not an application architecture.

**Rule:** route/controller objects may validate transport shape, establish request metadata and invoke use cases; they may not implement business invariants or direct SQL.

## B0-013 — Identity boundary

**Decision:** provider authentication and platform authorization are separate.

**Rule:** a valid identity-provider token/session proves a provider-authenticated principal, not Household permission. Current authority must be resolved against platform truth before tenant-scoped work.

## B0-014 — Idempotency

**Decision:** idempotent command execution must use the DB-02 idempotency boundary and request fingerprint semantics.

**Rule:** in-memory maps, cache-only locks or check-then-insert are not accepted as the source of idempotency truth.

## B0-015 — Event publication

**Decision:** durable event publication uses the DB-02 outbox responsibility model.

**Rule:** business mutation and outbox responsibility are committed atomically; broker publish is asynchronous and retryable.

## B0-016 — Runtime/framework/version selection — CLOSED

**Decision:**

- Runtime baseline: **Node.js 24 LTS**; CI/container pin the maintained 24.x line and the workspace rejects unsupported older majors.
- Language/compiler baseline: **TypeScript 7.0.x**, strict mode.
- Workspace/package manager: **npm workspaces**, using the package manager bundled/provisioned with the pinned Node 24 runtime; dependency lockfile is mandatory before BE-00 acceptance.
- HTTP delivery adapter: **Fastify 5.12.x**.
- PostgreSQL driver: **`pg` 8.23.x (node-postgres)**, used directly behind repository/transaction adapters; no ORM owns schema/migrations.
- Runtime/transport/config validation: **Zod 4.x**, isolated to boundaries; domain invariants remain domain types/functions and database contracts rather than Zod schemas.
- Test execution: Node.js test runner for low-level tests, with TypeScript execution/build tooling kept replaceable and non-architectural.

**Why this stack:** Node 24 is an active LTS line; Fastify exposes a small, lifecycle-oriented HTTP surface and does not require the application architecture to inherit framework abstractions; `pg` exposes PostgreSQL transactions and session-local context directly; npm workspaces avoid an additional package-manager dependency at the foundation layer.

**Version policy:** package manifests pin compatible release ranges while the lockfile pins the exact dependency graph. Dependency upgrades are reviewed changes and must pass the same BE gate; `latest` is never an execution contract.

**Boundary rule:** Fastify, `pg` and Zod imports are forbidden from domain/application packages except where a specifically reviewed adapter/contract package owns that dependency.
