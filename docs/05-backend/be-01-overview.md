# FridgeScanner — BE-01 Application Contracts & Domain Kernel

## Status

BE-01 is the active backend phase after accepted BE-00.

Accepted upstream baselines are normative:

- DB-00 — Domain Discovery & Invariants
- DB-01 — Logical / Relational Database Model
- DB-02 — PostgreSQL Physical Schema & Enforcement
- BE-00 — Backend Foundation & Runtime Contracts

BE-01 consumes those contracts. It may not reopen them for framework, database, identity-provider or delivery convenience.

## Objective

Establish the provider-neutral domain kernel and application contracts required before feature CRUD is allowed to proliferate.

The kernel must make invalid cross-domain substitutions difficult at compile time, preserve exact quantity and money semantics end to end, provide stable provider-neutral errors, and define application execution contracts without importing HTTP, PostgreSQL, queues or provider SDKs.

## Dependency direction

```text
@fridge/domain
    ^
    |
@fridge/application
    ^
    |
adapters / delivery / runtime
```

`@fridge/domain` must have no dependency on application, database, delivery, runtime or provider packages.

`@fridge/application` may depend on domain contracts and application ports. It must not import Fastify, `pg`, Zod transport schemas, Supabase SDKs, queue clients or deployment-provider APIs.

## First executable baseline

The first BE-01 slice introduces:

- a dedicated `@fridge/domain` workspace;
- nominally branded canonical identifiers so Household, Product, Batch and other IDs are not interchangeable strings;
- arbitrary-precision exact rational values represented with `bigint` numerator/denominator and canonical normalization;
- money represented as exact minor units plus explicit currency;
- an explicit UTC instant value rather than ambient local-time interpretation;
- a stable domain error taxonomy;
- executable kernel tests;
- root build/typecheck/test integration so the kernel participates in the normal repository gate.

## Required later BE-01 work

Before BE-01 can be accepted, the phase must also establish and review:

- application command/query/use-case contracts;
- transaction-aware application execution context;
- principal/Household authorization context semantics consuming BE-00's fail-closed transaction adapter;
- provider-neutral clock and identifier-generation ports returning kernel values;
- application error taxonomy and stable mapping boundary;
- request/idempotency/correlation metadata contracts where required by accepted DB-02/BE-00 semantics;
- package dependency-direction enforcement;
- tests proving domain/application packages execute without HTTP, PostgreSQL or a provider SDK;
- exact-HEAD review findings register and clean gate.

## Non-goals

BE-01 is not a feature CRUD phase. It does not implement complete Household management, catalog, procurement, inventory, counting, shopping, recipes, notifications or external provider workflows.

Minimal fixtures are permitted only when required to prove a kernel/application contract.

## Exit rule

BE-01 is accepted only when its domain/application contracts are executable, dependency direction is enforced, exactness and authority semantics remain consistent with DB-00/DB-01/DB-02/BE-00, CI is CLEAN on the exact reviewed HEAD, known material findings are resolved, and merge is explicitly authorized by the repository owner.
