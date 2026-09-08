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
- BE-00 execution/review gate: **accepted**

- Accepted BE-01 baseline: **Application Contracts & Domain Kernel**, final implementation lineage incorporated through squash commit `73d4345e42a958cd966fea012ce4ae8d360c8531`
- BE-01 final exact reviewed HEAD: `11dbf0313cf882385ae05f302a0d0a5ca09b97c0`
- BE-01 execution/review gate: **accepted**

- Accepted BE-02 baseline: **Identity Boundary**, formally accepted at squash commit `5f7cba8a1693a5df4cc7d61ad0c3452414b97d3c`
- BE-02 final exact reviewed HEAD: `061b9b4557787f309a3bbbf789d1ea0e47c7e592`
- BE-02 execution/review gate: **accepted**

- Accepted BE-03 normative baseline: **Household Access Management**, squash-merged at `75db7717761e791c04bbe43a5762fb3381b91e3f`
- BE-03 normative exact reviewed HEAD: `b826f12cfc1307962740b3774d2f3deb01bf84af`
- Accepted BE-03 authority kernel: squash `9d9323122a86fbe572b7fd5bc5ea8d96a4cad65f`, exact reviewed HEAD `5c7feb9940b5e66d857780e5eb585e36a1ddb81e`
- Accepted BE-03 add/rejoin: squash `e4558a605ef31ace98e7dcf599784e413eb7dc8a`, exact reviewed HEAD `1200a73e0cedd35b148f0522d795bcccfb91b5d6`
- Accepted BE-03 survivability: squash `f9e7b2a9b8749a3c36530a3ba8d758856f55b64c`, exact reviewed HEAD `7ec622558f711408e36e0d44545f85f7ca59594f`
- Accepted BE-03 role change: squash `23bc0306c1f25df510b654b94f6ebb80b0a7491b`, exact reviewed HEAD `67d8f4a2823830519b8e469fbfde8e37336ea527`
- Accepted BE-03 membership end/self-leave: squash `5af9f92fd38466d7b9429465d59e9f0f7f2498f3`, exact reviewed HEAD `1a57cc01844d3f12bbab7ddeaaf0b9a69118d692`
- Accepted BE-03 current-member read model: squash `7cd840c1a169ed09a15e4045be2772ef002a14a5`, exact reviewed HEAD `10d7203189d12514ab0fbeb95d9d31427e47f1d5`
- Accepted BE-03 final delivery/closure: PR #26 squash `546cb70ab6f752912d44f2140bcb3b474066dc07`, exact reviewed HEAD `5a1e05185d6be8d30b5ecb2c6729ccceaeddce44`
- BE-03 final exact-head gates: **DB-02 #75 SUCCESS on PostgreSQL 17/18; BE-00 #159 SUCCESS**
- BE-03 final B3-030 authenticated governed mutation proof: **accepted**
- BE-03 post-lock temporal serialization hardening (`000039`): **accepted**
- BE-03 final panoramic reviews: **CLEAN**
- BE-03 unresolved material threads at merge: **0**
- Canonical post-BE-03 `main`: **`546cb70ab6f752912d44f2140bcb3b474066dc07`**

- Accepted BE-04 normative baseline: **Storage Topology Management**, PR #27 squash `b789ab74dcc9f3d151463ec64bfc2efd8edf0cb3`
- BE-04 normative exact reviewed HEAD: `7b07c94fc9f28edaf73fdfc3c9f053f0c30e5420`
- BE-04 normative exact-head gate: **BE-00 #160 SUCCESS**
- BE-04 normative panoramic reviews: **CLEAN**
- BE-04 normative unresolved material threads at merge: **0**
- Canonical BE-04 baseline `main`: **`b789ab74dcc9f3d151463ec64bfc2efd8edf0cb3`**

- Active phase: **BE-04 — Storage Topology Management**
- Active implementation slice: **`HOUSEHOLD_STORAGE_ADMINISTER` authority kernel**
- Active branch: **`backend/be-04-storage-authority-kernel`**
- Backend implementation: **BE-00 through BE-03 accepted; BE-04 normative baseline accepted; storage administration authority kernel under exact-HEAD validation/review**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, canonical ordered migration lineage, database privileges/RLS, transaction-safe mutation boundaries and adversarial database tests.

BE-00 establishes the executable runtime foundation: strict TypeScript, validated configuration, Fastify delivery, structured correlation/logging, PostgreSQL transactions, Household context, liveness/readiness, graceful shutdown, Docker non-root runtime and CI gates.

BE-01 establishes the provider-neutral domain/application kernel: opaque identifiers, canonical UUID parsing, exact rational/decimal/money semantics, canonical wire serialization, strict UTC instant semantics, provider-neutral errors, transaction authority, intent-specific ports and machine-enforced dependency direction.

BE-02 establishes the provider-neutral identity boundary: authenticated provider evidence is verified and mapped to a platform-owned principal; provider claims never become Household authority; current Household membership is re-evaluated inside the accepted transaction boundary.

BE-03 establishes Household access governance: `HOUSEHOLD_MEMBERSHIP_ADMINISTER`, governed role/capability mapping, add/rejoin, role change, end/self-leave, durable command identity, actor provenance, atomic last-administrator survivability, post-lock temporal authority, current-member observation and authenticated HTTP delivery. The B3-030 proof demonstrates the complete chain from signed Bearer evidence through current Household authorization and membership-administration capability to durable governed mutation and post-commit observation.

BE-04 normative baseline establishes storage-topology authority/lifecycle/concurrency semantics before executable topology mutations: dedicated provider-neutral `HOUSEHOLD_STORAGE_ADMINISTER`, immutable Household ownership, same-Household Compartment parentage, retirement rather than ordinary delete, current observational reads, stable command identity, non-restoring replay, canonical lock order `Household -> StorageLocation -> Compartment`, post-lock temporal observation, stock-safe retirement, no automatic business cascades, least privilege and B4-030 as the authenticated phase-exit proof.

DB-00, DB-01, DB-02 and BE-00 through BE-03 plus the accepted BE-04 normative baseline are authoritative for current BE-04 implementation. Framework defaults, provider claims, ORM behavior or hosting-provider conveniences may not silently weaken them.

## BE-01 acceptance

Canonical BE-01 evidence is recorded in `docs/05-backend/be-01-acceptance.md`.

Accepted architecture direction:

```text
Domain <- Application <- Adapters / Delivery / Runtime
```

Later phases may extend domain/application contracts, but may not bypass accepted dependency, exactness, authority or serialization boundaries.

## BE-02 acceptance

Canonical BE-02 evidence is recorded in `docs/05-backend/be-02-acceptance.md`.

Provider authentication proves platform principal identity only. It does not freeze or replace Household authorization. External identity mapping, current-membership authorization and nondisclosure remain separate governed boundaries.

## BE-03 acceptance

Canonical BE-03 evidence is recorded in `docs/05-backend/be-03-acceptance.md`.

BE-03 is formally closed at `main @ 546cb70ab6f752912d44f2140bcb3b474066dc07` and is now accepted upstream authority for all later Household-scoped backend phases.

The accepted authority chain is:

```text
verified provider evidence
  -> platform PrincipalId
  -> current Household authority
  -> governed Household capability
  -> intent-specific durable mutation/read
  -> provider-neutral delivery
```

BE-04 consumes this chain rather than creating a parallel storage authorization model.

## Purpose of BE-04

BE-04 governs the Household's physical storage topology before executable inventory placement is introduced.

DB-00 defines:

- every `StorageLocation` belongs to exactly one Household;
- every `Compartment` belongs to exactly one StorageLocation;
- every Compartment therefore resolves to exactly one Household through its parent;
- a stored StockItem eventually has one placement anchor, either a StorageLocation or a Compartment whose parent StorageLocation is authoritative;
- occupancy labels are projections/observations, not authoritative stock truth.

DB-02 already provides:

- governed `storage_location_kind` and `compartment_kind` reference tables;
- `storage_location` Household ownership/lifecycle/order/retirement fields;
- `compartment` Household ownership/parent/lifecycle/order/retirement fields;
- a composite same-Household FK preventing a Compartment from attaching to another Household's StorageLocation.

BE-04 therefore establishes the application/persistence/delivery rules for current topology reads, create/change/retire lifecycle, explicit `HOUSEHOLD_STORAGE_ADMINISTER` capability, stable command identity, nondisclosure, least privilege and deterministic concurrency.

BE-04 explicitly does **not** implement Product catalog, Purchase/Receipt, StockItem or InventoryMovement workflows. Those remain later phases and must consume the topology contract rather than invent placement semantics themselves.

## Accepted BE-04 normative baseline

The accepted BE-04 baseline is recorded in:

- `docs/05-backend/be-04-overview.md`
- `docs/05-backend/be-04-decisions.md`

Key accepted rules include:

- execution-time Household authority;
- dedicated provider-neutral `HOUSEHOLD_STORAGE_ADMINISTER` capability;
- immutable Household ownership of StorageLocation;
- same-Household immutable Compartment parentage for BE-04;
- retirement instead of ordinary hard delete;
- active governed kinds;
- current observational read models;
- stable caller-supplied CommandId for retriable mutations;
- non-restoring committed replay;
- canonical lock order `Household -> StorageLocation -> Compartment`;
- post-lock temporal observation;
- parent retirement blocked while active children remain;
- topology retirement blocked when it would strand current stock;
- no automatic business cascades;
- provider-neutral errors and nondisclosure;
- least-privileged intent-specific persistence;
- B4-030 authenticated governed topology-mutation proof as phase exit condition.

The first executable slice is intentionally the storage-administration authority kernel. StorageLocation/Compartment mutations may consume that stronger opaque capability only after its own exact-HEAD gate and review are accepted.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization.

A passing implementation does not override a violated domain, relational, physical, runtime, application-kernel, identity-boundary, Household-access or storage-topology invariant.

BE-04 must not silently reopen or weaken DB-00/DB-01/DB-02/BE-00/BE-01/BE-02/BE-03. If implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in framework, ORM, SQL, authentication provider or deployment convenience.
