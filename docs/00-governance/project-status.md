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
- Accepted BE-04 storage authority kernel: PR #28 squash `3b3c7e56063357590ba6677240ee0d63ba73c8c3`, exact reviewed HEAD `fffe8e9cdb3ad96111c9e57a35076eb4026de139`
- BE-04 storage authority exact-head gates: **DB-02 #80 SUCCESS on PostgreSQL 17/18; BE-00 #165 SUCCESS**
- BE-04 storage authority panoramic reviews: **CLEAN**
- BE-04 storage authority unresolved material threads at merge: **0**
- Accepted BE-04 CreateStorageLocation: PR #29 squash `53e52e578058977637fb9e7193ab043b5566cea5`, exact reviewed HEAD `5f3096beeac836cfc7155c8f6482c0e9cdd202e1`
- BE-04 CreateStorageLocation exact-head gates: **DB-02 #86 SUCCESS on PostgreSQL 17/18; BE-00 #171 SUCCESS**
- BE-04 CreateStorageLocation panoramic reviews: **CLEAN**
- BE-04 CreateStorageLocation unresolved material threads at merge: **0**
- Accepted BE-04 ChangeStorageLocationMetadata: PR #30 squash `3a9e6f420f7b8410b786d65a3906490a35e36ef9`, exact reviewed HEAD `25ebc8e0c2e93eb8d8e9576a8bff61c6179db606`
- BE-04 ChangeStorageLocationMetadata exact-head gates: **DB-02 #88 SUCCESS on PostgreSQL 17/18; BE-00 #173 SUCCESS**
- BE-04 ChangeStorageLocationMetadata panoramic reviews: **CLEAN**
- BE-04 ChangeStorageLocationMetadata unresolved material threads at merge: **0**
- Accepted BE-04 RetireStorageLocation + cross-intent CommandId hardening: PR #31 squash `e9f7ba4032d189f35d42328e61cbcdee4ecc96bb`, exact reviewed HEAD `b0d436799c4781cb13f31110bf135bef4922a21c`
- BE-04 RetireStorageLocation exact-head gates: **DB-02 #99 SUCCESS on PostgreSQL 17/18; BE-00 #184 SUCCESS**
- BE-04 RetireStorageLocation panoramic reviews: **CLEAN**
- BE-04 RetireStorageLocation unresolved material threads at merge: **0**
- BE-04 shared topology CommandId registry (`000044`): **accepted**; one Household-scoped CommandId is bound to exactly one committed topology intent and later accepted migrations extend its governed intent set without creating parallel registries
- PR #31 Codex evidence: one P2 on an earlier head identified cross-intent CommandId reuse; fixed systemically, replied and resolved; **no claim of a final-head Codex CLEAN review**
- Accepted BE-04 current StorageLocation reads: PR #32 squash `24e88933ab63d9b725e841cd643de132243689d8`, exact reviewed HEAD `1cab3d06cb301c847c45073d2d63534cdadd0356`
- BE-04 current StorageLocation read exact-head gates: **DB-02 #103 SUCCESS on PostgreSQL 17/18; BE-00 #188 SUCCESS**
- BE-04 current StorageLocation read panoramic reviews: **CLEAN**
- BE-04 current StorageLocation read unresolved material threads at merge: **0**
- PR #32 Codex evidence: **no automated Codex review published; no claim of Codex CLEAN**
- Accepted BE-04 current Compartment reads: PR #33 squash `3505a136c74e700cfc17ba05518c0fda56cc6bc0`, exact reviewed HEAD `2957b52dd0f4cc537903b72fc36554a86f2d8c2d`
- BE-04 current Compartment read exact-head gates: **DB-02 #105 SUCCESS on PostgreSQL 17/18; BE-00 #190 SUCCESS**
- BE-04 current Compartment read panoramic reviews: **CLEAN**
- BE-04 current Compartment read unresolved material threads at merge: **0**
- PR #33 Codex evidence: **no automated Codex review published; no claim of Codex CLEAN**
- Accepted BE-04 CreateCompartment: PR #34 squash `d629c80da263477d001a10c00a40ad6703cf59e6`, exact reviewed HEAD `e367d96a13f5c081ca7b6723bfbb9ac32b9621df`
- BE-04 CreateCompartment exact-head gates: **DB-02 #107 SUCCESS on PostgreSQL 17/18; BE-00 #192 SUCCESS**
- BE-04 CreateCompartment panoramic reviews: **CLEAN**
- BE-04 CreateCompartment unresolved material threads at merge: **0**
- PR #34 Codex evidence: **no automated Codex review published; no claim of Codex CLEAN**
- Accepted BE-04 ChangeCompartmentMetadata: PR #35 squash `b9581d593c694b794fcb60c8ed26d30ad4189133`, exact reviewed HEAD `fa483d13949b319ed8e0925ac74a42218560a3f6`
- BE-04 ChangeCompartmentMetadata exact-head gates: **DB-02 #111 SUCCESS on PostgreSQL 17/18; BE-00 #196 SUCCESS**
- BE-04 ChangeCompartmentMetadata panoramic reviews: **CLEAN**
- BE-04 ChangeCompartmentMetadata unresolved material threads at merge: **0**
- PR #35 Codex evidence: one P2 on an earlier head identified malformed non-string metadata mapping; fixed with runtime type guards and explicit unit proof, replied and resolved; **no claim of a final-head Codex CLEAN review**
- Accepted BE-04 RetireCompartment + current-stock topology serialization hardening: PR #36 squash `549498b14d28339a5b763126fd41b5128b9f5cef`, exact reviewed HEAD `2a0b6ae14009521f97aff2cd78d21c1fb66d990b`
- BE-04 RetireCompartment exact-head gates: **DB-02 #118 SUCCESS on PostgreSQL 17/18; BE-00 #203 SUCCESS**
- BE-04 RetireCompartment panoramic reviews: **CLEAN**
- BE-04 RetireCompartment unresolved material threads at merge: **0**
- BE-04 current-stock topology guard (`000050`): **accepted**; current StockItem LOCATION/COMPARTMENT placement serializes with topology retirement under compatible locks and revalidates current lifecycle, while historical/non-current stock may preserve historical topology references and missing/cross-Household identity remains governed by accepted composite foreign keys
- PR #36 Codex evidence: one P1 on an earlier head identified a race between retirement and a new concurrent stock placement; fixed systemically, replied and resolved; **no claim of a final-head Codex CLEAN review**
- Accepted BE-04 authenticated HTTP delivery + B4-030 closure: PR #37 squash `bc3874df2d3106bb66f57a102465a48c57d83956`, exact reviewed HEAD `e13f1c40e310e9fd5944feccc71498684de7e678`
- BE-04 closure exact-head gates: **DB-02 #121 SUCCESS on PostgreSQL 17/18; BE-00 #207 SUCCESS**
- BE-04 B4-030 authenticated governed mutation/observation proof: **accepted**
- BE-04 closure panoramic reviews: **CLEAN**
- BE-04 closure unresolved material threads at merge: **0**
- PR #37 Codex evidence: **no automated Codex review published; no claim of Codex CLEAN**
- BE-04 status: **formally accepted and closed**
- Canonical post-BE-04 `main`: **`bc3874df2d3106bb66f57a102465a48c57d83956`**

- Accepted BE-05 normative baseline: **Product Catalog Governance**, PR #38 squash `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`, exact reviewed HEAD `2e0c73387184c737abf0ec9bdada5af8e4f3f39d`
- BE-05 normative exact-head gate: **BE-00 #208 SUCCESS**
- BE-05 normative panoramic reviews: **CLEAN**
- BE-05 normative unresolved material threads at merge: **0**
- PR #38 Codex evidence: **no automated Codex review published; no claim of Codex CLEAN**
- Canonical BE-05 baseline `main`: **`bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`**

- Active phase: **BE-05 — Product Catalog Governance**
- Active implementation slice: **Household catalog authority kernel**
- Active branch: **`backend/be-05-household-catalog-authority-kernel`**
- Active PR: **#39 — `backend: establish BE-05 household catalog authority kernel`**
- Backend implementation: **BE-00 through BE-04 accepted/closed; BE-05 normative baseline accepted; Household catalog authority kernel under exact-HEAD validation/review**
- BE-05 active capability: **`HOUSEHOLD_CATALOG_ADMINISTER` candidate; distinct from membership/storage authority and from future GLOBAL catalog governance**
- Frontend implementation: **not started**
- Production deployment: **not started**

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, canonical ordered migration lineage, database privileges/RLS, transaction-safe mutation boundaries and adversarial database tests.

BE-00 establishes the executable runtime foundation: strict TypeScript, validated configuration, Fastify delivery, structured correlation/logging, PostgreSQL transactions, Household context, liveness/readiness, graceful shutdown, Docker non-root runtime and CI gates.

BE-01 establishes the provider-neutral domain/application kernel: opaque identifiers, canonical UUID parsing, exact rational/decimal/money semantics, canonical wire serialization, strict UTC instant semantics, provider-neutral errors, transaction authority, intent-specific ports and machine-enforced dependency direction.

BE-02 establishes the provider-neutral identity boundary: authenticated provider evidence is verified and mapped to a platform-owned principal; provider claims never become Household authority; current Household membership is re-evaluated inside the accepted transaction boundary.

BE-03 establishes Household access governance: `HOUSEHOLD_MEMBERSHIP_ADMINISTER`, governed role/capability mapping, add/rejoin, role change, end/self-leave, durable command identity, actor provenance, atomic last-administrator survivability, post-lock temporal authority, current-member observation and authenticated HTTP delivery. The B3-030 proof demonstrates the complete chain from signed Bearer evidence through current Household authorization and membership-administration capability to durable governed mutation and post-commit observation.

BE-04 establishes the complete storage-topology authority/lifecycle/concurrency substrate: dedicated provider-neutral `HOUSEHOLD_STORAGE_ADMINISTER`, immutable Household ownership, immutable same-Household Compartment parentage for ordinary operations, governed kinds, current observational reads, stable command identity, shared cross-intent CommandId registry, non-restoring replay, canonical Household → StorageLocation → Compartment serialization, post-lock temporal observation, stock-safe retirement, current-stock/topology placement serialization, no automatic business cascades, least privilege and authenticated HTTP delivery. B4-030 proves the complete signed-Bearer chain through current authority, durable topology mutation and authenticated observation. BE-04 is formally closed at `main @ bc3874df2d3106bb66f57a102465a48c57d83956`.

BE-05 normative baseline establishes Product Catalog as a separate authority domain before executable catalog mutations. It preserves explicit `GLOBAL` vs `HOUSEHOLD` scope, forbids ordinary scope/owner mutation, separates Product from IngredientConcept/identifier/Batch/stock, governs ProductIdentifier namespace and normalization-rule semantics, preserves staged identifier evidence separately from canonical uniqueness, requires explicit versioned Product↔IngredientConcept compatibility, preserves immutable compatibility decision evidence, mandates lifecycle/history preservation, stable command identity, post-serialization current time, least privilege, provider-neutral failures and authenticated phase-exit proof. Household catalog administration is distinct from GLOBAL catalog governance.

DB-00, DB-01, DB-02 and BE-00 through BE-04 plus the accepted BE-05 normative baseline are authoritative for the current implementation. Framework defaults, provider claims, ORM behavior or hosting-provider conveniences may not silently weaken them.

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

BE-04 and BE-05 consume this chain rather than creating parallel Household authorization models.

## BE-04 acceptance

Canonical BE-04 evidence is recorded in `docs/05-backend/be-04-acceptance.md`.

BE-04 is formally closed at `main @ bc3874df2d3106bb66f57a102465a48c57d83956`. Later phases consume its StorageLocation/Compartment ownership, lifecycle, current-read, placement, serialization and stock-safety contracts rather than inventing alternate topology semantics.

The accepted topology authority chain is:

```text
BE-02 verified identity
  -> BE-03 current Household authority
  -> HOUSEHOLD_STORAGE_ADMINISTER
  -> governed StorageLocation / Compartment read + mutation
  -> stock-safe topology lifecycle
  -> authenticated provider-neutral delivery
```

## Purpose of BE-05

BE-05 governs canonical catalog identity and visibility before procurement/inventory are allowed to depend on Product truth.

DB-00/DB-02 already define the physical/conceptual substrate for:

- `Product` with explicit `GLOBAL` or `HOUSEHOLD` catalog scope;
- `IngredientConcept` with explicit catalog scope;
- `ProductCategory`, `Brand` and `Manufacturer` reference data;
- versioned/effective Product↔IngredientConcept compatibility;
- `ProductIdentifier` with governed scheme/namespace/normalization-rule identity;
- `StagedIdentifierClaim` as Household-scoped unresolved evidence rather than canonical reservation;
- immutable `CompatibilityDecisionEvidence` for committed downstream decisions.

The accepted BE-05 baseline requires dedicated `HOUSEHOLD_CATALOG_ADMINISTER` for Household-private mutation and a separate real platform-governance strategy for GLOBAL mutation. Household roles, storage authority, possession of stock, scanner observations and provider claims cannot manufacture global or private catalog authority.

The active PR #39 is limited to the Household authority kernel. It must not implement Product/IngredientConcept/Identifier/Compatibility mutation, GLOBAL catalog governance, HTTP delivery, procurement, inventory, frontend or deployment behavior.

Candidate evidence for this slice is recorded in `docs/05-backend/be-05-household-catalog-authority-kernel.md`. The kernel is not accepted history until one immutable final PR HEAD passes DB-02 PostgreSQL 17/18 + BE-00, panoramic reviews are CLEAN, unresolved material findings are zero, the owner explicitly authorizes squash merge, the resulting `main` SHA/parent are verified and the branch is preserved.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization.

A passing implementation does not override a violated domain, relational, physical, runtime, application-kernel, identity-boundary, Household-access, storage-topology or product-catalog invariant.

BE-05 must not silently reopen or weaken DB-00/DB-01/DB-02/BE-00/BE-01/BE-02/BE-03/BE-04. If implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in framework, ORM, SQL, authentication provider or deployment convenience.