# FridgeScanner — Project Status

## Canonical status

### Database foundations

- DB-00 — Domain Discovery & Invariants: **accepted**, merged at `9abb805e3ad179ca98aa363a5fd6ad9cce633292`.
- DB-01 — Logical / Relational Database Model: **accepted**, merged at `33507116eae3e4e79f4d1242d17d7d8f847424d4`.
- DB-02 — Physical PostgreSQL Schema & Enforcement: **accepted**, squash `7261561bb008d70528c2905afb582ee42cba795f`, exact reviewed HEAD `8952856e48807d9a50e7adb0b5d16dee5911e90c`.
- Canonical ordered SQL migrations and PostgreSQL execution gate: **accepted on PostgreSQL 17 and PostgreSQL 18**.

### Backend foundations

- BE-00 — Backend Foundation & Runtime Contracts: **accepted**, squash `0ad61f38da15ebb237d9e6feda01bf1f8489f5d5`, reviewed HEAD `7901afe9e78e5ab2e1d24732790396b0aedaccc4`.
- BE-01 — Application Contracts & Domain Kernel: **accepted**, lineage through squash `73d4345e42a958cd966fea012ce4ae8d360c8531`, reviewed HEAD `11dbf0313cf882385ae05f302a0d0a5ca09b97c0`.
- BE-02 — Identity Boundary: **accepted**, squash `5f7cba8a1693a5df4cc7d61ad0c3452414b97d3c`, reviewed HEAD `061b9b4557787f309a3bbbf789d1ea0e47c7e592`.

## BE-03 — Household Access Management — CLOSED / ACCEPTED

- Normative baseline: PR #19 squash `75db7717761e791c04bbe43a5762fb3381b91e3f`, reviewed HEAD `b826f12cfc1307962740b3774d2f3deb01bf84af`.
- Authority kernel: PR #20 squash `9d9323122a86fbe572b7fd5bc5ea8d96a4cad65f`, reviewed HEAD `5c7feb9940b5e66d857780e5eb585e36a1ddb81e`.
- Add/rejoin: PR #21 squash `e4558a605ef31ace98e7dcf599784e413eb7dc8a`, reviewed HEAD `1200a73e0cedd35b148f0522d795bcccfb91b5d6`.
- Survivability: PR #22 squash `f9e7b2a9b8749a3c36530a3ba8d758856f55b64c`, reviewed HEAD `7ec622558f711408e36e0d44545f85f7ca59594f`.
- Role change: PR #23 squash `23bc0306c1f25df510b654b94f6ebb80b0a7491b`, reviewed HEAD `67d8f4a2823830519b8e469fbfde8e37336ea527`.
- Membership end/self-leave: PR #24 squash `5af9f92fd38466d7b9429465d59e9f0f7f2498f3`, reviewed HEAD `1a57cc01844d3f12bbab7ddeaaf0b9a69118d692`.
- Current-member read model: PR #25 squash `7cd840c1a169ed09a15e4045be2772ef002a14a5`, reviewed HEAD `10d7203189d12514ab0fbeb95d9d31427e47f1d5`.
- Authenticated HTTP delivery / B3-030 closure: PR #26 squash `546cb70ab6f752912d44f2140bcb3b474066dc07`, reviewed HEAD `5a1e05185d6be8d30b5ecb2c6729ccceaeddce44`.
- Final gates: DB-02 #75 SUCCESS on PostgreSQL 17/18; BE-00 #159 SUCCESS.
- Final panoramic reviews: CLEAN; unresolved material threads: 0.
- Canonical BE-03 acceptance evidence: `docs/05-backend/be-03-acceptance.md`.

## BE-04 — Storage Topology Management — CLOSED / ACCEPTED

- Normative baseline: PR #27 squash `b789ab74dcc9f3d151463ec64bfc2efd8edf0cb3`, reviewed HEAD `7b07c94fc9f28edaf73fdfc3c9f053f0c30e5420`.
- Storage authority kernel: PR #28 squash `3b3c7e56063357590ba6677240ee0d63ba73c8c3`, reviewed HEAD `fffe8e9cdb3ad96111c9e57a35076eb4026de139`; DB-02 #80 PG17/18 SUCCESS; BE-00 #165 SUCCESS.
- CreateStorageLocation: PR #29 squash `53e52e578058977637fb9e7193ab043b5566cea5`, reviewed HEAD `5f3096beeac836cfc7155c8f6482c0e9cdd202e1`; DB-02 #86 PG17/18 SUCCESS; BE-00 #171 SUCCESS.
- ChangeStorageLocationMetadata: PR #30 squash `3a9e6f420f7b8410b786d65a3906490a35e36ef9`, reviewed HEAD `25ebc8e0c2e93eb8d8e9576a8bff61c6179db606`; DB-02 #88 PG17/18 SUCCESS; BE-00 #173 SUCCESS.
- RetireStorageLocation + shared topology CommandId hardening: PR #31 squash `e9f7ba4032d189f35d42328e61cbcdee4ecc96bb`, reviewed HEAD `b0d436799c4781cb13f31110bf135bef4922a21c`; DB-02 #99 PG17/18 SUCCESS; BE-00 #184 SUCCESS.
- Current StorageLocation reads: PR #32 squash `24e88933ab63d9b725e841cd643de132243689d8`, reviewed HEAD `1cab3d06cb301c847c45073d2d63534cdadd0356`; DB-02 #103 PG17/18 SUCCESS; BE-00 #188 SUCCESS.
- Current Compartment reads: PR #33 squash `3505a136c74e700cfc17ba05518c0fda56cc6bc0`, reviewed HEAD `2957b52dd0f4cc537903b72fc36554a86f2d8c2d`; DB-02 #105 PG17/18 SUCCESS; BE-00 #190 SUCCESS.
- CreateCompartment: PR #34 squash `d629c80da263477d001a10c00a40ad6703cf59e6`, reviewed HEAD `e367d96a13f5c081ca7b6723bfbb9ac32b9621df`; DB-02 #107 PG17/18 SUCCESS; BE-00 #192 SUCCESS.
- ChangeCompartmentMetadata: PR #35 squash `b9581d593c694b794fcb60c8ed26d30ad4189133`, reviewed HEAD `fa483d13949b319ed8e0925ac74a42218560a3f6`; DB-02 #111 PG17/18 SUCCESS; BE-00 #196 SUCCESS.
- RetireCompartment + current-stock topology serialization hardening: PR #36 squash `549498b14d28339a5b763126fd41b5128b9f5cef`, reviewed HEAD `2a0b6ae14009521f97aff2cd78d21c1fb66d990b`; DB-02 #118 PG17/18 SUCCESS; BE-00 #203 SUCCESS.
- Current-stock topology guard `000050`: **accepted**; current stock placement serializes against topology retirement and revalidates current topology lifecycle.
- Authenticated HTTP delivery / B4-030 closure: PR #37 squash `bc3874df2d3106bb66f57a102465a48c57d83956`, reviewed HEAD `e13f1c40e310e9fd5944feccc71498684de7e678`; DB-02 #121 PG17/18 SUCCESS; BE-00 #207 SUCCESS.
- BE-04 final panoramic reviews: CLEAN; unresolved material threads: 0.
- Canonical post-BE-04 `main`: `bc3874df2d3106bb66f57a102465a48c57d83956`.
- Canonical BE-04 acceptance evidence: `docs/05-backend/be-04-acceptance.md`.

### BE-04 automated-review evidence

- PR #31: one Codex P2 on an earlier head for cross-intent CommandId reuse; fixed systemically, replied and resolved; no claim of final-head Codex CLEAN.
- PR #35: one Codex P2 on an earlier head for malformed non-string metadata mapping; fixed, replied and resolved; no claim of final-head Codex CLEAN.
- PR #36: one Codex P1 on an earlier head for retirement vs concurrent placement; fixed systemically, replied and resolved; no claim of final-head Codex CLEAN.
- PRs #32, #33, #34 and #37: no automated Codex review published; no claim of Codex CLEAN.

## BE-05 — Product Catalog Governance — CLOSED / ACCEPTED

BE-05 is formally closed on canonical `main @ 4e98cf551cc14568cdca80a38b711152cb3e045d`.

### Accepted lineage

- PR #38 — normative baseline: squash `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`, reviewed HEAD `2e0c73387184c737abf0ec9bdada5af8e4f3f39d`.
- PR #39 — Household catalog authority kernel: squash `37e93ded114f1c8f82a16d7089d9e65b887bc433`, reviewed HEAD `25f56ac86a32657e1674527b686e26ef7922d229`.
- PR #40 — CreateHouseholdProduct: squash `b568831c6227c3a48ff6d72f70f126b4aad30934`, reviewed HEAD `a1fdc4c7d7a4e56eef13bd4ec1d969cf00ba3aee`.
- PR #41 — ChangeHouseholdProductMetadata: squash `2e91a52742ac1143292db2edd9da32b7aa6f8006`, reviewed HEAD `835966221e0181fc968f9708075c855595d5f015`.
- PR #42 — RetireHouseholdProduct: squash `460f7d452fbac180a1db6320764c5ad60601c376`, reviewed HEAD `b2b43e27f0c36d1c35148661dd55549086f98e8d`.
- PR #43 — current Product reads: squash `4563c7b04be15816665747bea26bf47045bff5e7`, reviewed HEAD `0e6ff7bbe874a71faedd03fefef9a2cd8ec1d402`.
- PR #44 — current IngredientConcept reads: squash `d822a60d4ca6ea4008b69529e82ba1399f3d743f`, reviewed HEAD `27c2c8d512052e72ad7b5de470a0033e628e3f2f`.
- PR #45 — CreateHouseholdIngredientConcept: squash `fb0958a38c38c6ec318a48a893189f3885b242c4`, reviewed HEAD `588cddecc1ff23d1bb04d7889ae4dbf7e1332bc8`.
- PR #46 — ChangeHouseholdIngredientConceptMetadata: squash `3f5f9aaa18edffd036ff406de6e1d2ad2e54c81e`, reviewed HEAD `bc5632b8e64a9b54c2d880b3a8a65101123f79a4`.
- PR #47 — RetireHouseholdIngredientConcept: squash `9c7f528b59838b781674449e7ec4c506e73a7601`, reviewed HEAD `9b0ddf6da751053080b83a30234696c047e3a455`.
- PR #48 — ObserveProductIdentifier / staged evidence: squash `6de6fa1032855ad04b5f5f90e7d348adec68e3c4`, reviewed HEAD `5f69548d6fd1b3c7c8c3e57ab8128d3117878aea`.
- PR #49 — ResolveProductIdentifier: squash `703fbe5016cda6a562429c7af5eb708832902151`, reviewed HEAD `421d65fb95ab646fe56f3a0fc57e762179eb0102`.
- PR #50 — CreateHouseholdCompatibilityMapping: squash `a1c2d95e355043c863b65eac373267728ef11c47`, reviewed HEAD `2dbeb386c51956f0eeb9519c84a6d7b1a284dec0`.
- PR #51 — RetireHouseholdCompatibilityMapping: squash `9239f82797b143530bf10ab0a50d268c27df2c04`, reviewed HEAD `ad8478adb6ab3a2f0c4c8fc0e9930696c524cd00`.
- PR #52 — immutable CompatibilityDecisionEvidence: squash `589bf28f6547d384f524f08190c91d07aba76fd4`, reviewed HEAD `08a717ada9d5a5a7ee83f19f57c49a6db182f978`.
- PR #53 — authenticated Product HTTP delivery / B5-039 closure: squash `4e98cf551cc14568cdca80a38b711152cb3e045d`, reviewed HEAD `c38e7944e7aecf0160e1735e2d639234a770ebc2`.

### Accepted BE-05 outcome

- `HOUSEHOLD_CATALOG_ADMINISTER` is distinct from membership/storage authority and future GLOBAL catalog governance.
- Current Product/IngredientConcept visibility is ACTIVE GLOBAL + ACTIVE same-Household private with nondisclosure-safe foreign/missing handling.
- Household Product and IngredientConcept create/change/retire lifecycles are governed and history-preserving.
- ProductIdentifier observation is staged evidence, not canonical authority; staged claims do not reserve canonical uniqueness.
- Canonical identifier resolution uses the exact governed scheme/namespace/rule/value identity; heuristic normalization is forbidden.
- Product↔IngredientConcept compatibility is explicit governed data.
- CompatibilityDecisionEvidence is immutable/append-only and pins the exact historical decision.
- Stable CommandId, cross-intent conflict, non-restoring replay, serialization and least-privileged persistence are enforced.
- Authenticated B5-039 proves provider identity -> platform PrincipalId -> current Household authority -> `HOUSEHOLD_CATALOG_ADMINISTER` -> durable Product mutation -> authenticated observation while provider claims remain non-authoritative.

### Final BE-05 gate

- BE-00 #265: SUCCESS including Runtime / TypeScript / Unit, Container, accepted DB-02 replay, PostgreSQL/RLS integration and configured authentication runtime.
- Final panoramic/adversarial review: CLEAN.
- Unresolved material review threads at merge: 0.
- Squash commit `4e98cf551cc14568cdca80a38b711152cb3e045d`: verified/valid signature.
- Canonical BE-05 acceptance evidence: `docs/05-backend/be-05-acceptance.md`.

## BE-06 — Procurement & Receiving — ACTIVE NORMATIVE BASELINE

BE-06 starts from accepted `main @ 4e98cf551cc14568cdca80a38b711152cb3e045d` and consumes BE-00 through BE-05 without reopening them.

Primary scope:

- Purchase / PurchaseItem commercial truth;
- exact quantity + MeasurementUnit semantics;
- role-typed exact money/currency facts and pricing discrepancy handling;
- Receipt / ReceiptItem physical receiving;
- partial receiving;
- ordinary PurchaseItem↔ReceiptItem allocation;
- explicit substitution allocation;
- explicit over-receipt exception handling;
- exact receiving-pool reconciliation;
- immutable conversion evidence when contextual conversion is required;
- atomic receipt inventory-ingress seam linking committed ReceiptItem quantity to exact inventory entry effects;
- provider-neutral Household procurement authority and authenticated phase-exit proof.

Normative direction:

- dedicated `HOUSEHOLD_PROCUREMENT_ADMINISTER` mutation capability;
- Purchase and Receipt remain distinct aggregates;
- visible Product references consume BE-05 and never mutate catalog truth;
- receiving placement consumes BE-04 current topology;
- ReceiptItem commit and required inventory ingress are atomic;
- BE-06 opens only the minimum intent-specific inventory ingress required by receiving, not generic inventory authority;
- broader transfer/consumption/waste/count/reconciliation remain later inventory phases.

Normative documents:

- `docs/05-backend/be-06-overview.md`
- `docs/05-backend/be-06-decisions.md`

No BE-06 executable mutation/read slice is accepted until this normative baseline passes exact-HEAD review/gates and explicit owner-authorized squash merge.

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, ordered migrations, privileges/RLS, transaction-safe mutation boundaries and adversarial tests.

BE-00 establishes the executable runtime foundation. BE-01 establishes the provider-neutral domain/application kernel. BE-02 establishes provider-neutral identity. BE-03 establishes Household access governance. BE-04 establishes storage topology. BE-05 establishes governed Product Catalog truth.

BE-06 may compose those accepted boundaries but may not duplicate or weaken them.

## Acceptance references

- BE-01: `docs/05-backend/be-01-acceptance.md`
- BE-02: `docs/05-backend/be-02-acceptance.md`
- BE-03: `docs/05-backend/be-03-acceptance.md`
- BE-04: `docs/05-backend/be-04-acceptance.md`
- BE-05: `docs/05-backend/be-05-acceptance.md`
- BE-06 normative: `docs/05-backend/be-06-overview.md`, `docs/05-backend/be-06-decisions.md`

## Current delivery status

- Backend: BE-00 through BE-05 **accepted/closed**; BE-06 Procurement & Receiving **normative baseline active**.
- Frontend: **not started**.
- Production deployment: **not started**.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch -> review -> exact-HEAD validation -> explicit merge authorization.

A passing implementation does not override a violated domain, relational, physical, runtime, application-kernel, identity-boundary, Household-access, storage-topology, product-catalog, procurement or receiving invariant.

Any new commit invalidates prior exact-HEAD CI/review evidence for the candidate being evaluated.

External automated review is defense-in-depth, not the authoritative merge gate. Internal adversarial/panoramic review, exact-HEAD CI, zero unresolved material findings and explicit owner authorization remain mandatory.
