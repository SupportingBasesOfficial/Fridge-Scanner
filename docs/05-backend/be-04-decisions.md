# FridgeScanner — BE-04 Storage Topology Decisions

## Status

Normative decision register for BE-04 — Storage Topology Management.

All decisions below are subordinate to accepted DB-00/DB-01/DB-02 and BE-00/BE-01/BE-02/BE-03 contracts. They define the target semantics that executable BE-04 slices must prove before acceptance.

## B4-001 — Current Household authority remains execution-time truth

Every storage-topology read or mutation must execute only after current Household authority has been re-established through the accepted backend transaction boundary.

Client Household IDs, provider claims, provider groups, device metadata, cached UI state or previously valid membership are context only and never authority.

## B4-002 — Topology administration uses a provider-neutral capability

Mutating StorageLocation/Compartment topology requires an explicit governed capability, not a guessed role code.

BE-04 introduces the canonical capability:

`HOUSEHOLD_STORAGE_ADMINISTER`

Role-to-capability mapping remains governed reference data. A role string such as `ADMIN`, `OWNER` or `MEMBER` has no intrinsic storage-management meaning.

Read-only current topology observation may use ordinary current Household authority unless a later narrower policy is explicitly adopted.

## B4-003 — StorageLocation ownership is immutable Household identity

A StorageLocation belongs to exactly one Household for its entire domain lifetime.

No BE-04 mutation may rewrite a StorageLocation from one Household to another. Cross-Household transfer is not modeled as topology reassignment.

## B4-004 — Compartment parentage is same-Household and immutable in BE-04

A Compartment belongs to exactly one StorageLocation, and that StorageLocation belongs to the same Household.

BE-04 does not support moving an existing Compartment to a different StorageLocation by rewriting `storage_location_id`. If the physical meaning changes, the safe default workflow is retire old Compartment + create a new Compartment, preserving historical identity.

Any future explicit reparenting workflow must separately prove that historical placement facts remain reconstructable.

## B4-005 — Lifecycle retirement replaces destructive deletion

StorageLocation and Compartment domain identities are never hard-deleted by ordinary BE-04 commands.

Retirement closes current usability by setting governed lifecycle/retirement state while retaining durable identity and history.

Hard purge, if ever introduced for retention/privacy operations, is outside BE-04 business mutation semantics.

## B4-006 — Active reference kinds are governed data

Create/change commands accept a storage/compartment kind only when the corresponding governed reference row is active according to canonical reference-data semantics.

Application code must not infer semantics from arbitrary strings, descriptions or presentation labels.

## B4-007 — Occupancy labels are not inventory truth

`full`, `almost-full`, `empty` or similar labels must not be accepted as authoritative stock state by BE-04.

Future occupancy projections may be derived from inventory/capacity observations, but they cannot become a competing ledger.

## B4-008 — Read models are current, Household-scoped and observational

Current topology reads return only resources currently visible within the authorized Household context.

A read model is not mutation authority and must not expose another Household's topology, internal database metadata or provider-authentication data.

Historical/admin audit reads, if later required, are separate explicit intents.

## B4-009 — Mutation contracts are intent-specific

BE-04 must not expose generic table CRUD.

Canonical mutation intents are equivalent to:

- CreateStorageLocation
- ChangeStorageLocationMetadata
- RetireStorageLocation
- CreateCompartment
- ChangeCompartmentMetadata
- RetireCompartment

The exact API/type names may evolve without changing these semantics.

## B4-010 — Client-supplied stable CommandId is mandatory for network-retried mutations

Every externally retriable BE-04 mutation carries a stable caller-supplied `CommandId`.

The server must not silently generate a new idempotency identity for each delivery attempt.

## B4-011 — Command identity binds complete semantic facts

A durable BE-04 command record/fingerprint binds at least:

- target Household;
- authenticated actor PrincipalId;
- operation intent/version;
- target resource where applicable;
- normalized requested facts;
- candidate identity for create operations where applicable.

Reusing one CommandId with different facts returns an idempotency conflict and never overwrites/reinterprets the original command.

## B4-012 — Committed replay never resurrects retired topology

Retry of an already committed create/change/retire command returns its original committed outcome without reapplying the mutation.

If later state changed, replay must not restore an earlier StorageLocation/Compartment state.

## B4-013 — Parent retirement blocks new current Compartment creation

A new current Compartment may be created only beneath a current active StorageLocation in the same Household.

A concurrent parent retirement and child creation must serialize deterministically so both cannot commit as if each observed the parent active independently.

## B4-014 — Retired topology cannot receive ordinary current-state metadata mutation

Ordinary change commands target current active topology only.

Changing metadata on retired topology requires a distinct future correction/admin-history workflow; BE-04 must not silently reactivate resources by editing them.

## B4-015 — Retirement is stock-aware by contract, even before inventory delivery exists

A topology resource that is needed by current authoritative stock placement must not be retired in a way that strands current stock or makes placement ambiguous.

Because executable inventory placement is a later backend phase, BE-04 must implement retirement in one of two safe ways:

1. prove that no current stock depends on the resource before retiring; or
2. block retirement with a provider-neutral conflict until a future governed relocation workflow exists.

BE-04 must not cascade, rewrite or guess inventory placement.

For StorageLocation retirement, current active child Compartments are also dependent topology and must be handled explicitly; silent orphaning is forbidden.

## B4-016 — StorageLocation retirement and child state are atomic

Retiring a StorageLocation must not leave current active Compartments beneath a retired parent.

The initial BE-04 policy is conservative: retirement is blocked while any current active child Compartment exists. Callers must retire children first through explicit commands.

This preserves explicit history and avoids hidden cascade side effects.

## B4-017 — Compartment retirement does not retire its parent

Retiring a Compartment affects only that Compartment. The parent StorageLocation remains current unless independently retired through its own command.

## B4-018 — Display-name uniqueness is not invented

DB-00/DB-02 do not currently establish canonical uniqueness of StorageLocation or Compartment display names.

BE-04 therefore permits duplicate display names unless a later governed decision establishes a stable uniqueness rule. UI convenience must not be promoted into a backend invariant accidentally.

## B4-019 — Sort order is presentation metadata, not identity or authority

`sort_order` may be changed without changing resource identity, ownership or historical placement meaning.

Duplicate/null sort values are allowed unless canonical schema/contracts later govern otherwise. Deterministic reads use stable identity as a final ordering tiebreaker.

## B4-020 — Canonical lock order is Household → StorageLocation → Compartment

Any mutation that touches multiple topology resources acquires locks in the canonical order:

`Household -> StorageLocation -> Compartment`

Governed kind/reference facts may be locked consistently after the owning resource anchor as needed.

This order applies across create/change/retire operations to prevent reciprocal deadlocks and write skew.

## B4-021 — Current-state time is sampled after serialization

Any BE-04 mutation whose correctness depends on current/active lifecycle state must observe the operative database time only after acquiring the relevant canonical serialization anchor.

The phase must not repeat the pre-lock `statement_timestamp()` class of bug corrected during BE-03. A fresh post-lock database time is used consistently for current-state checks and retirement timestamps within the operation.

## B4-022 — Unknown/foreign topology is nondisclosure-safe

Unauthorized Household access, another Household's StorageLocation/Compartment, and a nonexistent target must not create a cross-tenant existence oracle.

Delivery maps such outcomes according to accepted provider-neutral nondisclosure semantics.

## B4-023 — Persistence remains least-privileged and intent-specific

Runtime roles must not gain broad `INSERT/UPDATE/DELETE` over topology tables merely to implement BE-04.

Mutations execute through narrow intent-specific persistence boundaries. Internal helpers remain inaccessible to ordinary runtime roles unless their direct execution is itself the accepted public persistence contract.

## B4-024 — Database/provider failures are normalized

PostgreSQL/driver errors do not escape public application or HTTP contracts.

Dependency-unavailable conditions, conflict conditions, invalid request facts, authorization/nondisclosure and unexpected internal failures remain provider-neutral.

## B4-025 — Reads never become mutation authority

A StorageLocation/Compartment returned by a read model, UI cache or prior response does not prove that the resource is still current or that the actor may mutate it.

Every mutation revalidates current Household authority, target lifecycle/ownership and required capability inside the same governed transaction.

## B4-026 — No provider metadata or device trust substitutes for Household storage authority

JWT role claims, provider groups, external tenant IDs, camera/device ownership, barcode-scanner identity or integration credentials cannot grant `HOUSEHOLD_STORAGE_ADMINISTER` unless a future explicit trusted-principal contract is separately governed.

## B4-027 — Creation candidate IDs are command-bound

Create operations use a stable candidate UUID bound to the CommandId/fingerprint. Replay returns the originally committed identity rather than allocating another StorageLocation/Compartment.

## B4-028 — No automatic cascade semantics in application code

BE-04 will not silently cascade StorageLocation retirement to child Compartments, nor Compartment retirement to inventory.

Cascading business effects require explicit modeled commands/workflows and proof of all affected invariants.

## B4-029 — Delivery remains a transport adapter

Fastify validates wire shape, resolves the authenticated platform principal through BE-02, invokes BE-04 application contracts and serializes provider-neutral results.

Routes contain no SQL, role-code policy, tenant lookup shortcuts or database-error leakage.

## B4-030 — Phase exit requires a real authenticated governed topology mutation

BE-04 is complete only when one real authenticated HTTP request crosses:

```text
BE-02 identity verification
  -> current Household authorization
  -> HOUSEHOLD_STORAGE_ADMINISTER
  -> governed topology command
  -> least-privileged durable mutation
  -> authenticated current-state observation
```

The exit proof must deliberately demonstrate that provider role/Household claims and spoofable headers are not storage authority.

Adversarial and concurrency tests must preserve same-Household parentage, lifecycle retirement, child/stock safety, idempotency, temporal serialization and nondisclosure.

## Acceptance rule

No BE-04 implementation slice is accepted merely because it compiles or its happy path works.

Each slice requires exact-HEAD execution gates, panoramic review, zero unresolved material findings and explicit owner authorization before squash merge. The final BE-04 acceptance must reconcile all B4 decisions and preserve all accepted upstream phases.
