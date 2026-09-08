# FridgeScanner — BE-04 Acceptance Evidence

## Status

BE-04 — Storage Topology Management is **formally accepted and closed**.

Final closure:

- PR #37: `backend: deliver BE-04 storage topology HTTP and B4-030 proof`
- Exact final reviewed HEAD: `e13f1c40e310e9fd5944feccc71498684de7e678`
- Squash merge on `main`: `bc3874df2d3106bb66f57a102465a48c57d83956`
- Parent: `549498b14d28339a5b763126fd41b5128b9f5cef`
- Branch `backend/be-04-http-delivery-proof`: preserved
- DB-02 PostgreSQL Gate #121: SUCCESS on PostgreSQL 17 and PostgreSQL 18
- BE-00 Backend Gate #207: SUCCESS across runtime/unit, container, DB-02 replay, PostgreSQL/RLS integration and authenticated B4-030 runtime
- final panoramic reviews: CLEAN
- unresolved material review threads at merge: 0
- no automated Codex review was published on PR #37; no claim of Codex CLEAN is made

BE-04 is no longer an active closure candidate. Later phases consume it as accepted upstream topology authority.

## Accepted implementation lineage

- PR #27 — normative BE-04 baseline: squash `b789ab74dcc9f3d151463ec64bfc2efd8edf0cb3`, reviewed HEAD `7b07c94fc9f28edaf73fdfc3c9f053f0c30e5420`.
- PR #28 — storage administration authority kernel: squash `3b3c7e56063357590ba6677240ee0d63ba73c8c3`, reviewed HEAD `fffe8e9cdb3ad96111c9e57a35076eb4026de139`.
- PR #29 — CreateStorageLocation: squash `53e52e578058977637fb9e7193ab043b5566cea5`, reviewed HEAD `5f3096beeac836cfc7155c8f6482c0e9cdd202e1`.
- PR #30 — ChangeStorageLocationMetadata: squash `3a9e6f420f7b8410b786d65a3906490a35e36ef9`, reviewed HEAD `25ebc8e0c2e93eb8d8e9576a8bff61c6179db606`.
- PR #31 — RetireStorageLocation + shared topology CommandId registry: squash `e9f7ba4032d189f35d42328e61cbcdee4ecc96bb`, reviewed HEAD `b0d436799c4781cb13f31110bf135bef4922a21c`.
- PR #32 — current StorageLocation reads: squash `24e88933ab63d9b725e841cd643de132243689d8`, reviewed HEAD `1cab3d06cb301c847c45073d2d63534cdadd0356`.
- PR #33 — current Compartment reads: squash `3505a136c74e700cfc17ba05518c0fda56cc6bc0`, reviewed HEAD `2957b52dd0f4cc537903b72fc36554a86f2d8c2d`.
- PR #34 — CreateCompartment: squash `d629c80da263477d001a10c00a40ad6703cf59e6`, reviewed HEAD `e367d96a13f5c081ca7b6723bfbb9ac32b9621df`.
- PR #35 — ChangeCompartmentMetadata: squash `b9581d593c694b794fcb60c8ed26d30ad4189133`, reviewed HEAD `fa483d13949b319ed8e0925ac74a42218560a3f6`.
- PR #36 — RetireCompartment + current-stock topology serialization hardening: squash `549498b14d28339a5b763126fd41b5128b9f5cef`, reviewed HEAD `2a0b6ae14009521f97aff2cd78d21c1fb66d990b`.
- PR #37 — authenticated HTTP delivery + B4-030 closure: squash `bc3874df2d3106bb66f57a102465a48c57d83956`, reviewed HEAD `e13f1c40e310e9fd5944feccc71498684de7e678`.

## Accepted authority and lifecycle model

BE-04 establishes:

- dedicated provider-neutral `HOUSEHOLD_STORAGE_ADMINISTER` capability;
- current Household authority as execution-time truth;
- immutable StorageLocation Household ownership;
- immutable same-Household Compartment parentage for ordinary BE-04 operations;
- lifecycle retirement instead of ordinary hard delete;
- current observational reads distinct from mutation authority;
- stable caller-supplied CommandId for retriable mutations;
- shared Household-scoped topology CommandId intent registry;
- non-restoring committed replay;
- canonical serialization order beginning `Household -> StorageLocation -> Compartment`;
- post-lock temporal observation for lifecycle decisions;
- stock-safe retirement with no automatic business cascade/relocation;
- provider-neutral errors and tenant nondisclosure;
- least-privileged intent-specific persistence;
- authenticated HTTP delivery as adapter only.

## Accepted current-stock topology serialization

PR #36 introduced `000050__current_stock_topology_guard.sql` after a valid Codex P1 identified the race between topology retirement and a new concurrent current-stock placement.

The accepted invariant is:

- a current StockItem anchored directly to a StorageLocation must acquire/revalidate that same-Household StorageLocation as current;
- a current StockItem anchored to a Compartment must acquire/revalidate current same-Household parent StorageLocation and current Compartment;
- placement locks serialize with topology retirement locks;
- if placement wins first, retirement later observes the stock dependency and blocks;
- if retirement wins first, placement later revalidates lifecycle and is rejected;
- historical/non-current stock may preserve historical topology references;
- missing/cross-Household identity continues to be governed by the accepted composite foreign-key boundary.

This physical invariant is also recorded in the DB-02 enforcement map.

## Accepted HTTP surface

PR #37 exposes the accepted topology application contracts through Fastify without moving authority or persistence into delivery:

- `GET /households/:householdId/storage-locations`
- `GET /households/:householdId/storage-locations/:storageLocationId`
- `POST /households/:householdId/storage-locations`
- `POST /households/:householdId/storage-locations/:storageLocationId/metadata-changes`
- `POST /households/:householdId/storage-locations/:storageLocationId/retirements`
- `GET /households/:householdId/storage-locations/:storageLocationId/compartments`
- `POST /households/:householdId/storage-locations/:storageLocationId/compartments`
- `GET /households/:householdId/compartments/:compartmentId`
- `POST /households/:householdId/compartments/:compartmentId/metadata-changes`
- `POST /households/:householdId/compartments/:compartmentId/retirements`

Delivery performs only authentication-entry integration, wire parsing, invocation of intent-specific use cases, serialization and provider-neutral error mapping. It contains no SQL, role-name policy or provider-specific Household authority logic.

## B4-030 accepted proving chain

The final accepted runtime proof executes:

```text
signed ES256 Bearer JWT
  -> JWT/JWKS verification
  -> provider-neutral verified identity evidence
  -> platform PrincipalId mapping
  -> current Household membership/authority
  -> HOUSEHOLD_STORAGE_ADMINISTER acquisition for mutation
  -> governed BE-04 topology use case
  -> intent-specific least-privileged PostgreSQL persistence
  -> durable topology mutation + CommandId provenance
  -> authenticated current topology observation
```

The proving JWT deliberately carries a provider `provider-super-admin` role claim and a provider Household claim inconsistent with the requested Household. Neither becomes platform authority. A caller-controlled `x-principal-id` is ignored.

The accepted proof also demonstrates:

- ordinary current Household members may observe current topology but cannot mutate it;
- lost-response retry returns the original committed identity;
- foreign-Household observation and foreign-parent mutation remain nondisclosure-safe;
- cross-intent topology CommandId reuse maps to provider-neutral conflict;
- metadata changes remain intent-specific;
- retired StorageLocations/Compartments are hidden from current reads while history is preserved;
- malformed wire CommandId is rejected before business mutation.

## Final execution evidence

On exact final HEAD `e13f1c40e310e9fd5944feccc71498684de7e678`:

- DB-02 PostgreSQL Gate #121: SUCCESS.
- PostgreSQL 17: SUCCESS.
- PostgreSQL 18: SUCCESS.
- BE-00 Backend Gate #207: SUCCESS.
- Runtime / TypeScript / Unit: SUCCESS.
- Container Smoke / Non-root / Health Semantics: SUCCESS.
- accepted DB-02 replay in PostgreSQL/RLS lane: SUCCESS.
- database/RLS/identity integration regressions: SUCCESS.
- configured authentication runtime including B4-030: SUCCESS.
- final authority/lifecycle/nondisclosure/idempotency/delivery panoramic review: CLEAN.
- final least-privilege/provider-neutrality/package-boundary/governance panoramic review: CLEAN.
- unresolved material review threads: 0.

The owner explicitly authorized squash merge. GitHub merged exactly the reviewed HEAD and `main` was verified at `bc3874df2d3106bb66f57a102465a48c57d83956` with parent `549498b14d28339a5b763126fd41b5128b9f5cef`. The closure branch was preserved.

## Accepted BE-04 outcome

BE-04 now provides the canonical storage-topology substrate:

```text
BE-02 verified identity
  -> BE-03 current Household authority
  -> HOUSEHOLD_STORAGE_ADMINISTER
  -> StorageLocation / Compartment current reads + governed create/change/retire
  -> command provenance + replay safety + deterministic serialization
  -> stock-safe topology lifecycle
  -> authenticated provider-neutral HTTP delivery
```

All later phases may consume this topology contract. They may not bypass, weaken or reinterpret its ownership, lifecycle, placement, authority, concurrency, nondisclosure or least-privilege guarantees without an explicit governed architectural change.
