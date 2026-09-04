# FridgeScanner — BE-00 Backend Foundation

## Status

BE-00 is the first backend implementation phase after accepted DB-00, DB-01 and DB-02.

Accepted database baseline:

- DB-00 — Domain Discovery & Invariants
- DB-01 — Logical / Relational Database Model
- DB-02 — PostgreSQL Physical Schema & Enforcement, merged to `main` at `7261561bb008d70528c2905afb582ee42cba795f`

BE-00 must consume those contracts; it must not redefine them for framework, ORM, provider or delivery convenience.

## Objective

Establish an executable, provider-neutral backend foundation that can evolve into the full FridgeScanner application without coupling domain logic to HTTP, PostgreSQL, Supabase, a queue, an ORM or a deployment platform.

BE-00 is not an MVP. It is the smallest complete architectural foundation on which later backend capabilities can be implemented without structural rewrites.

## Architectural shape

The backend starts as a modular monolith with explicit boundaries:

1. **Domain** — business concepts, invariants and value semantics; no framework/database imports.
2. **Application** — use cases, commands, queries, authorization decisions and ports.
3. **Adapters** — PostgreSQL, identity provider, clock, identifiers, messaging and external providers.
4. **Delivery** — HTTP/API transport only; no business truth in controllers/routes.
5. **Runtime** — composition root, configuration, lifecycle, observability and process concerns.

Service extraction is not a default. A module may become a service later only for measured runtime, ownership, isolation, security, cadence or scaling reasons while preserving its application/domain contracts.

## Non-negotiable invariants

- PostgreSQL remains business data authority as defined by DB-02.
- DB capability credentials are never exposed to browsers or other untrusted clients.
- A requested Household is installed only as transaction-local candidate RLS context inside an encapsulated authorization transaction; this permits the least-privileged role to read that Household's membership row under forced RLS.
- The authenticated platform principal must have a currently effective ACTIVE membership in that candidate Household before any tenant callback/business query can run. Failure rolls back; candidate context alone is never authority.
- Household authorization is re-established for each request/use case; a JWT/provider session or client-provided Household identifier alone is not current business authority.
- Provider identity is not Household authority.
- SQL migrations remain canonical schema authority; no ORM schema generation/migration becomes authoritative.
- Exact quantity and money remain exact end to end; no JavaScript `number` is allowed to represent authoritative rational or monetary values.
- Historical append-only relations are mutated only through accepted correction/compensation flows.
- Multi-row mutation semantics use the transaction boundaries and deferred database postconditions already accepted by DB-02.
- Idempotent commands use the DB-02 create-or-observe boundary rather than ad-hoc in-memory deduplication.
- Outbox publication responsibility remains transactionally coupled to the business mutation that owns the event.

## Initial repository target

BE-00 will introduce a backend workspace with clear package boundaries rather than placing application code in the repository root.

Planned shape:

```text
apps/
  api/
packages/
  domain/
  application/
  contracts/
  database/
  observability/
  config/
database/
  migrations/
  tests/
docs/
  05-backend/
```

The exact package-manager/runtime/framework versions are implementation decisions governed by `be-00-decisions.md` and must be pinned in the executable baseline.

## BE-00 deliverables

BE-00 is complete only when all of the following exist and execute in CI:

- workspace/package topology;
- strict TypeScript configuration and dependency direction checks;
- runtime configuration parser with fail-fast validation;
- API process lifecycle with health/readiness endpoints;
- structured logging and request correlation foundation;
- PostgreSQL connection/transaction adapter;
- principal-bound candidate-context/membership authorization transaction adapter;
- no-ambient-transaction policy for application use cases;
- explicit ports for identity, authorization context, clock and identifier generation;
- exact rational/money transport/value representation contract;
- error taxonomy and transport mapping;
- graceful shutdown and bounded request lifecycle;
- unit tests for architecture/runtime primitives;
- integration tests proving database context fail-closed behavior through the backend adapter;
- CI gate for install, lint, typecheck, test, build and DB integration;
- container build/run baseline;
- independent review findings register;
- exact-HEAD clean gate before merge.

## Explicitly not part of BE-00

The following belong to later backend phases unless required to prove the foundation:

- complete Household CRUD;
- product/catalog feature implementation;
- inventory commands;
- procurement/receiving endpoints;
- shopping/replenishment endpoints;
- recipe/preparation workflows;
- alerts/notifications delivery;
- provider integrations/import processing;
- frontend/BFF implementation;
- production hosting-provider configuration.

## Exit rule

BE-00 cannot be declared CLEAN merely because an API process starts. It is accepted only when the runtime, dependency boundaries, database authority/context semantics, CI and container baseline are executable and the exact PR HEAD has no known material architecture/security findings.
