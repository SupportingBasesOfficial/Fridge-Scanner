# FridgeScanner — BE-01 Application Contracts & Domain Kernel

## Status

BE-01 is the first backend phase after accepted BE-00.

Accepted baseline:

- DB-00 — Domain Discovery & Invariants
- DB-01 — Logical / Relational Database Model
- DB-02 — PostgreSQL Physical Schema & Enforcement
- BE-00 — Backend Foundation & Runtime Contracts, squash-merged to `main` at `0ad61f38da15ebb237d9e6feda01bf1f8489f5d5`

BE-01 consumes those contracts. It does not reinterpret them for HTTP, PostgreSQL, Supabase, ORM, queue, cache or deployment convenience.

## Objective

Create the provider-neutral domain/application kernel that all later backend features depend on, before feature-specific CRUD and transport contracts are allowed to grow.

The result must make business semantics explicit in code while preserving the dependency direction established by BE-00:

```text
Domain <- Application <- Adapters / Delivery / Runtime
```

The domain and application layers must be testable without network, database or framework infrastructure.

## Why this phase exists

BE-00 proved that the process, configuration, database context, RLS authorization bootstrap, CI and container boundaries work. It intentionally left most business types and use-case contracts thin.

If feature endpoints are built directly on top of that thin layer, database rows and transport shapes will become accidental business contracts. BE-01 prevents that by defining the semantic kernel first.

## Target package topology

BE-01 may evolve the workspace toward:

```text
packages/
  domain/
  application/
  contracts/
  config/
  database/
apps/
  api/
```

The exact split is governed by dependency direction, not by a desire to create packages. A package exists only when it owns a stable boundary with independent semantic responsibility.

## Required kernel contracts

### 1. Strong identifiers

Business identifiers must not remain interchangeable plain strings inside domain/application code.

At minimum the kernel must define branded/opaque types and parsing/validation boundaries for identifiers that participate in accepted core invariants, including:

- PrincipalId
- HouseholdId
- HouseholdMembershipId
- ProductId
- StorageLocationId
- CompartmentId
- command/idempotency identifiers when they enter application contracts

The first kernel set is intentionally aligned to identities already present in DB-02. Later feature phases add additional opaque identifiers only when the accepted schema/use case requires them.

Transport strings are converted once at the boundary. Internal APIs must not permit accidental substitution of one identifier class for another.

### 2. Exact numeric semantics

Authoritative quantity and money must never be represented by JavaScript binary floating point.

BE-01 must provide canonical value semantics for the accepted database numeric model, using exact integer/bigint/string-backed representations as appropriate. DB-02 represents measurement quantities and exact conversion factors as normalized rational numerator/denominator pairs and requires explicit currency identity for monetary facts; BE-01 must preserve those semantics rather than collapse them into floating point.

Required behavior includes:

- canonical parse;
- validation;
- normalized rational representation where required;
- equality;
- safe serialization;
- no implicit conversion to `number`;
- explicit overflow/range behavior where applicable.

### 3. Application error taxonomy

Define stable provider-neutral errors sufficient for later use cases and transport mapping.

The taxonomy must distinguish at least:

- invalid input / malformed value;
- unauthenticated principal;
- unauthorized Household access;
- not found without cross-tenant disclosure;
- conflict / invariant violation;
- idempotency conflict or in-progress state where applicable;
- dependency unavailable;
- unexpected internal failure.

PostgreSQL error strings, provider SDK errors and Fastify errors are not public application contracts.

### 4. Application execution context

Application use cases must receive only verified context needed to execute business work.

The context must clearly separate:

- authenticated platform principal;
- authorized Household;
- verified Household role/membership facts;
- transaction handle where atomic work is required;
- correlation/request metadata that is operational rather than business authority.

A provider token or requested Household identifier alone is never application authority.

### 5. Command/query/use-case contracts

Establish a uniform but non-framework-specific pattern for application operations.

Rules:

- use cases expose explicit input/output types;
- commands and queries do not receive Fastify request/reply objects;
- application code does not receive `pg` Pool/Client objects;
- transaction ownership is explicit;
- external effects are represented by ports;
- long-lived external calls do not occur inside ordinary database transactions;
- idempotent command contracts are compatible with DB-02 create-or-observe semantics.

### 6. Core ports

Define or harden application-owned ports for capabilities that must remain replaceable:

- clock;
- identifier generation;
- transaction management;
- authorized Household execution;
- persistence/repository capabilities only as required by use cases;
- event/outbox responsibility where a proving use case requires it.

Ports must describe business/application intent, not mirror vendor SDKs.

### 7. Dependency direction enforcement

CI must prove that domain/application packages do not import forbidden infrastructure dependencies.

At minimum, protected packages may not import:

- Fastify;
- `pg`;
- Zod except at an explicitly reviewed boundary package;
- Node process/environment APIs for business behavior;
- provider SDKs;
- application runtime composition modules.

### 8. Contract tests

BE-01 requires tests proving semantic behavior, not just type compilation.

At minimum:

- identifier non-interchangeability at compile-time where feasible;
- runtime parsing rejection for malformed identifiers;
- exact numeric round-trip and arithmetic/value invariants required by the kernel;
- error taxonomy stability;
- use-case isolation from infrastructure;
- application context cannot be constructed from unverified tenant input through the ordinary public API.

## Proving vertical slice

BE-01 may implement one deliberately narrow, read-only or side-effect-free vertical slice solely to prove the kernel wiring end to end.

The proving slice must:

- use the accepted Household authorization transaction boundary;
- call an application use case through provider-neutral input/output contracts;
- access persistence only through an adapter-owned implementation;
- map application errors at the HTTP delivery boundary;
- avoid introducing a feature architecture that outruns the kernel.

The proving slice is evidence, not the start of uncontrolled CRUD expansion.

## Explicitly not part of BE-01

Unless necessary as a minimal proving fixture, BE-01 excludes:

- complete Household management APIs;
- catalog/product CRUD;
- inventory mutation workflows;
- procurement/receiving workflows;
- shopping/replenishment workflows;
- recipe/preparation workflows;
- notification delivery;
- provider imports/integrations;
- frontend/BFF implementation;
- production hosting configuration.

## Required CI gate

BE-01 cannot be accepted until CI proves, on the exact reviewed HEAD:

- reproducible install from the accepted lockfile;
- lint/static dependency-boundary checks;
- strict typecheck;
- unit/contract tests;
- build;
- BE-00 database/RLS integration regression;
- container regression;
- BE-01 kernel-specific tests;
- no known material review findings.

## Exit rule

BE-01 is CLEAN only when later feature phases can depend on domain/application contracts without importing HTTP, PostgreSQL or provider implementations and without representing authoritative identifiers, money or quantity as weak primitive values.

A green endpoint is not sufficient. The semantic kernel, dependency direction, exactness, authority boundaries and exact-HEAD CI/review gate must all be clean.
