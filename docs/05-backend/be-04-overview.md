# FridgeScanner — BE-04 Storage Topology Management

## Status

BE-04 is the next backend phase after accepted BE-03 — Household Access Management.

Accepted upstream foundation:

- DB-00 — Domain Discovery & Invariants
- DB-01 — Logical / Relational Database Model
- DB-02 — PostgreSQL Physical Schema & Enforcement
- BE-00 — Backend Foundation & Runtime Contracts
- BE-01 — Application Contracts & Domain Kernel
- BE-02 — Identity Boundary
- BE-03 — Household Access Management

The canonical post-BE-03 `main` baseline is `546cb70ab6f752912d44f2140bcb3b474066dc07`.

BE-04 consumes those contracts. It may not reinterpret platform identity, Household authorization, membership administration, tenant isolation, RLS, nondisclosure, exact-value semantics, provider-neutral authentication or the accepted BE-03 authority model for storage-management convenience.

## Objective

Establish the provider-neutral application, persistence and delivery contracts for managing a Household's physical storage topology: `StorageLocation` and `Compartment`.

BE-04 makes storage topology an explicit governed Household resource before inventory placement workflows are implemented. It must provide safe current-state observation and lifecycle mutations without turning topology metadata, occupancy projections or client-provided Household identifiers into authority.

The authority flow is:

```text
verified PrincipalId
  -> current Household authorization
  -> explicit storage-topology capability/policy
  -> intent-specific topology command/read
  -> governed durable mutation or observation
  -> subsequent requests re-evaluate current authority
```

Authentication answers **who is this platform principal?** BE-03 answers **may this principal act in this Household and administer membership?** BE-04 answers **which authorized principals may govern the Household's storage topology, and how does that topology evolve without violating tenant or inventory invariants?**

## Why BE-04 comes before catalog/inventory delivery

DB-00 places Storage Topology immediately after Identity and Household Membership in the canonical domain model. A stored `StockItem` ultimately resolves placement through either a `StorageLocation` or a `Compartment` whose parent `StorageLocation` is authoritative. Therefore inventory delivery must not invent placement resources ad hoc.

BE-04 establishes the stable topology boundary that later catalog, receiving and inventory phases consume.

## Scope

BE-04 covers:

- reading current active StorageLocations for one authorized Household;
- reading current active Compartments under one authorized Household/StorageLocation;
- creating a StorageLocation under explicit Household authority;
- changing governed mutable StorageLocation metadata such as display name, kind and sort order under explicit policy;
- retiring a StorageLocation through lifecycle semantics rather than destructive deletion;
- creating a Compartment under an existing same-Household StorageLocation;
- changing governed mutable Compartment metadata such as display name, kind and sort order;
- retiring a Compartment through lifecycle semantics rather than destructive deletion;
- validating governed `storage_location_kind` and `compartment_kind` reference data instead of accepting arbitrary semantic strings;
- deterministic concurrency and retry behavior for topology mutations;
- provider-neutral errors and tenant nondisclosure;
- exact Household-scope enforcement in application and persistence layers;
- preserving future inventory safety when a topology resource is referenced by stock/history.

## Explicit non-goals

BE-04 does not implement:

- Product/IngredientConcept/catalog governance;
- product identifiers/barcode resolution;
- Purchase/Receipt workflows;
- StockItem creation or inventory balance mutation;
- InventoryMovement/Transfer/Count/Reconciliation;
- occupancy as authoritative inventory truth;
- camera/device telemetry;
- frontend/BFF UI;
- production deployment;
- cross-Household storage transfer;
- destructive hard-delete of topology history.

A later inventory phase may project occupancy from authoritative inventory facts. BE-04 must not store `full`, `almost-full` or `empty` as a second stock ledger.

## Canonical upstream model

DB-00 defines:

- every `StorageLocation` belongs to exactly one `Household`;
- every `Compartment` belongs to exactly one `StorageLocation`;
- a Compartment's parent StorageLocation is authoritative for resolved location;
- cross-Household attachment/mutation is forbidden absent a future explicit workflow;
- occupancy indicators are projections/observations, not authoritative inventory truth.

DB-02 already provides:

- `fridge.storage_location_kind` governed reference data;
- `fridge.compartment_kind` governed reference data;
- `fridge.storage_location` with Household ownership, lifecycle, ordering and retirement fields;
- `fridge.compartment` with explicit Household ownership, parent StorageLocation, lifecycle, ordering and retirement fields;
- a composite FK `(household_id, storage_location_id)` that physically prevents a Compartment from attaching to a StorageLocation in another Household;
- Household-oriented indexes and stable UUID identities.

BE-04 must use these canonical structures rather than creating an alternate topology store.

## Core authority rules

### Household authorization is execution-time truth

A route parameter, cached UI selection, JWT claim, provider group, device metadata or prior authorization result is never sufficient authority to read or mutate storage topology.

Every Household-scoped topology operation must re-establish current Household authority through the accepted BE-02/BE-03 transaction boundary.

### Storage administration is explicit

Ordinary current membership and membership administration are not automatically equivalent to topology administration.

BE-04 must define a provider-neutral topology capability/policy. Concrete Household role codes may not be guessed from strings such as `OWNER`, `ADMIN` or `MEMBER`.

The initial normative phase must decide whether topology administration reuses an already governed generic Household-management capability or introduces a dedicated capability such as `HOUSEHOLD_STORAGE_ADMINISTER`. Until accepted, implementation must not infer authority from role names.

### Household ownership is invariant

A StorageLocation created for Household A remains owned by Household A. A Compartment created under a StorageLocation must carry the same Household.

No mutation may move a StorageLocation or Compartment across Households by rewriting foreign keys. A future cross-Household physical transfer workflow, if ever required, must be modeled explicitly rather than simulated as topology reassignment.

### Lifecycle is not deletion

Topology identities can become historical provenance for later inventory movement and placement facts. Therefore retirement is the default lifecycle operation.

BE-04 must not expose generic DELETE semantics that erase a StorageLocation/Compartment fact referenced by business history. Any future physical purge is an operational retention concern and must not masquerade as a domain mutation.

### Kind semantics are governed reference data

`storage_location_kind` and `compartment_kind` are canonical reference data. Application/delivery code may not invent meaning from arbitrary client strings.

A mutation that changes kind must resolve an active governed kind under an explicit contract.

### Occupancy remains observational

BE-04 may expose topology capacity/configuration in the future only if the domain model is extended explicitly. It must not derive authority or stock state from a user-entered occupancy label.

## Intended command/read model

Topology operations must be intent-specific. Expected semantic contracts include concepts equivalent to:

```text
ListStorageLocations
GetStorageLocation
CreateStorageLocation
ChangeStorageLocationMetadata
RetireStorageLocation
ListCompartments
CreateCompartment
ChangeCompartmentMetadata
RetireCompartment
```

Names may evolve, but contracts must express business intent rather than generic table CRUD.

## Concurrency and retry model

Topology mutation is durable Household configuration and must be deterministic under retries/concurrency.

The normative phase must define:

- stable command identity for network-retried mutations;
- fingerprint/fact binding so one `CommandId` cannot be reused for different topology intent;
- exact conflict behavior for concurrent create/change/retire operations;
- stale-target handling after retirement;
- deterministic behavior when parent StorageLocation is retired concurrently with Compartment creation/change;
- lock ordering for operations touching Household, parent StorageLocation and Compartment;
- whether display-name duplication is allowed or governed by a uniqueness policy (it must not be guessed from UI convenience).

## Inventory-safety boundary

BE-04 precedes executable inventory placement but must already protect its future invariants.

At minimum:

- retiring a topology resource must not erase historical identity;
- later inventory code must never infer historical placement from current mutable topology alone;
- a retired parent cannot silently accept new current Compartments unless a future explicit policy says otherwise;
- when active stock eventually references a topology resource, retirement semantics must define whether the operation blocks, stages relocation, or requires a governed inventory workflow. BE-04 must not guess or bypass this dependency.

Until inventory mutation is executable, BE-04 may establish topology lifecycle contracts but must not claim full stock-aware retirement semantics without an integration proof.

## Delivery contract direction

HTTP remains an adapter:

```text
Fastify request
  -> BE-02 verified PrincipalId
  -> BE-03 current Household transaction authority
  -> BE-04 topology use case
  -> intent-specific database adapter
  -> provider-neutral HTTP response
```

Delivery must not contain SQL, role-name authorization, cross-tenant lookup logic or database-specific error leakage.

## Exit gate

BE-04 is complete only when the accepted normative decisions are implemented and one real authenticated request proves the complete path for a governed topology mutation while adversarial tests demonstrate:

- no cross-Household observation or mutation;
- no provider-claim authority substitution;
- no role-name guessing;
- same-Household Compartment/StorageLocation integrity;
- history-preserving retirement semantics;
- deterministic retry/concurrency behavior;
- least-privileged persistence;
- provider-neutral/nondisclosure-safe delivery;
- DB-02, BE-00, BE-01, BE-02 and BE-03 regressions remain green.

No merge occurs without exact-HEAD validation, CLEAN review and explicit owner authorization.
