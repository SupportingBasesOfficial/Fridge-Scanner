# FridgeScanner — BE-04 Acceptance Evidence

## Status

BE-04 — Storage Topology Management is a **closure candidate pending exact-HEAD final validation/review and explicit owner-authorized merge of PR #37**.

This document does not declare BE-04 formally accepted before merge. The repository `main` remains authoritative until the closure PR is squash-merged and verified.

## Accepted upstream implementation lineage

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

PR #36 final gates were DB-02 #118 SUCCESS on PostgreSQL 17/18 and BE-00 #203 SUCCESS. Its final panoramic reviews were CLEAN and its one material Codex P1 on concurrent new stock placement was fixed systemically and resolved before merge. The accepted `000050__current_stock_topology_guard.sql` now serializes current StockItem placement with topology retirement while preserving historical placement references and the canonical composite-FK identity boundary.

## Closure PR #37

PR #37 — `backend: deliver BE-04 storage topology HTTP and B4-030 proof` — is the closure candidate.

It exposes the already-accepted topology use cases through an authenticated Fastify adapter without moving authority or persistence rules into delivery:

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

Delivery performs wire parsing, calls intent-specific application contracts, serializes provider-neutral output and reuses the accepted application error boundary. It contains no SQL, role-name authorization or provider-specific Household authority logic.

## B4-030 proving chain

The closure candidate contains a real authenticated proof:

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

The proving JWT deliberately contains a provider role claim (`provider-super-admin`) and a provider Household claim that does not match the requested Household. Neither is used as platform Household authority. A caller-supplied `x-principal-id` is also ignored.

The proof demonstrates that an ordinary current Household member can observe current topology but cannot mutate it even while presenting the same provider-side super-admin claim.

## B4-030 adversarial coverage

The closure candidate proves through real HTTP/runtime integration:

- authenticated governed StorageLocation creation;
- lost-response retry returning the original committed StorageLocation identity despite a different internal candidate;
- authenticated current observation after commit;
- ordinary-member read access without storage-mutation authority;
- provider role/Household claims do not substitute for platform authority;
- caller-controlled principal header does not substitute for verified PrincipalId;
- foreign-Household observation is nondisclosure-safe;
- governed StorageLocation metadata change;
- governed Compartment creation under a current same-Household parent;
- foreign-parent Compartment creation is nondisclosure-safe;
- parent-scoped and identity-scoped current Compartment observation;
- cross-intent topology CommandId reuse maps to provider-neutral HTTP conflict;
- governed Compartment metadata change;
- history-preserving Compartment retirement followed by current-read hiding;
- history-preserving StorageLocation retirement followed by current-read hiding;
- malformed wire CommandId fails as provider-neutral invalid input before business mutation.

Accepted database integration suites continue to prove stock-safe retirement, current-stock/topology concurrency serialization, same-Household physical integrity, least privilege and historical preservation beneath this delivery adapter.

## Execution evidence

Initial executable proof on PR #37 HEAD `dd38e3a32ec80513d5984da1280549ae3142ac4c`:

- BE-00 Backend Gate #204: SUCCESS.
- Runtime / TypeScript / Unit: SUCCESS.
- Container Smoke / Non-root / Health Semantics: SUCCESS.
- accepted DB-02 replay in the PostgreSQL 17 integration lane: SUCCESS.
- least-privileged backend fixtures: SUCCESS.
- `@fridge/database` integration regressions: SUCCESS.
- configured authentication runtime + `@fridge/api` integration including B4-030: SUCCESS.

This evidence is **intermediate**, because governance/physical-contract documentation changes move the PR HEAD. Formal closure requires the final exact HEAD to pass DB-02 PostgreSQL 17/18 and BE-00 again, followed by CLEAN panoramic reviews and zero unresolved material findings.

## Closure condition

BE-04 becomes formally accepted only after all of the following are true on one immutable final PR #37 HEAD:

1. DB-02 PostgreSQL Gate is SUCCESS on PostgreSQL 17 and 18;
2. BE-00 Backend Gate is SUCCESS across runtime/unit, container, database/RLS integration and configured authentication/B4-030;
3. B4-030 remains a real signed-Bearer governed mutation proof;
4. panoramic authority/delivery/concurrency review is CLEAN;
5. panoramic least-privilege/provider-neutrality/package-boundary review is CLEAN;
6. unresolved material review threads are zero;
7. the owner explicitly authorizes squash merge;
8. GitHub merges exactly the reviewed HEAD and the resulting `main` commit/parent are verified;
9. the closure branch is preserved.

Until then, PR #37 is a closure candidate, not accepted history.
