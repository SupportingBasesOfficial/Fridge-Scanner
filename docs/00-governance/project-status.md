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

## BE-05 — Product Catalog Governance — ACTIVE

### Accepted normative baseline

- PR #38 squash `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`.
- Exact reviewed HEAD `2e0c73387184c737abf0ec9bdada5af8e4f3f39d`.
- BE-00 #208 SUCCESS.
- Panoramic reviews CLEAN; unresolved material threads at merge: 0.
- No automated Codex review published; no claim of Codex CLEAN.

### Accepted Household catalog authority kernel

- PR #39 squash/main `37e93ded114f1c8f82a16d7089d9e65b887bc433`.
- Parent `bb5c8ef80c82fc93cac474ae9acc8dcc1c0a1ae4`.
- Exact reviewed HEAD `25f56ac86a32657e1674527b686e26ef7922d229`.
- DB-02 #128 SUCCESS on PostgreSQL 17/18.
- BE-00 #215 SUCCESS complete.
- Panoramic reviews CLEAN; unresolved material threads at merge: 0.
- Capability `HOUSEHOLD_CATALOG_ADMINISTER`: **accepted** and distinct from membership/storage authority and future GLOBAL catalog governance.
- Codex found one P1 and one P2 on an earlier head; both were fixed, replied, resolved and outdated before merge. No claim of a final-head Codex CLEAN review.
- Accepted evidence: `docs/05-backend/be-05-household-catalog-authority-kernel.md`.

### Active implementation candidate — CreateHouseholdProduct

- Active PR: **#40 — `backend: implement governed CreateHouseholdProduct mutation`**.
- Active branch: `backend/be-05-create-household-product`.
- Base/canonical accepted `main`: `37e93ded114f1c8f82a16d7089d9e65b887bc433`.
- Intent: `CreateHouseholdProduct`.
- Required authority: current `HOUSEHOLD_CATALOG_ADMINISTER`.
- Product scope forced to `HOUSEHOLD`; owner forced to authoritative Household.
- Stable caller `CommandId`; ProductId candidate generated internally/server-side.
- Shared Household catalog CommandId registry introduced with `CREATE_HOUSEHOLD_PRODUCT` as its first governed intent.
- Committed replay is candidate-independent and non-restoring.
- Brand, Manufacturer and ProductCategory remain intentionally null in this first mutation slice; their governance is not guessed.
- ProductIdentifier, StagedIdentifierClaim, IngredientConcept, compatibility, GLOBAL catalog governance, HTTP delivery, procurement and inventory remain out of scope.
- Candidate evidence: `docs/05-backend/be-05-create-household-product-acceptance.md`.
- Acceptance status: **not yet accepted**; requires immutable final HEAD with DB-02 PG17/18 + BE-00 SUCCESS, CLEAN panoramics, zero unresolved material findings and explicit owner-authorized squash merge.

## Accepted foundation

DB-00 defines domain truth and invariants. DB-01 translates those contracts into the accepted technology-neutral logical relational model. DB-02 translates them into the accepted PostgreSQL physical schema, ordered migrations, privileges/RLS, transaction-safe mutation boundaries and adversarial tests.

BE-00 establishes the executable runtime foundation: strict TypeScript, validated configuration, Fastify delivery, structured correlation/logging, PostgreSQL transactions, Household context, liveness/readiness, graceful shutdown, Docker non-root runtime and CI gates.

BE-01 establishes the provider-neutral domain/application kernel: opaque identifiers, exact value semantics, canonical serialization, UTC instant semantics, provider-neutral errors, transaction authority, intent-specific ports and dependency direction.

BE-02 establishes the provider-neutral identity boundary: authenticated provider evidence maps to a platform-owned principal; provider claims never become Household authority.

BE-03 establishes Household access governance and the capability model consumed by later Household-scoped phases.

BE-04 establishes accepted StorageLocation/Compartment ownership, lifecycle, current reads, canonical serialization/locking, placement and stock-safety contracts. Later phases consume BE-04 rather than inventing alternate topology semantics.

BE-05 establishes Product Catalog as a separate authority domain. The accepted baseline preserves explicit GLOBAL vs HOUSEHOLD scope, immutable ordinary scope/owner, Product vs IngredientConcept/identifier/stock separation, governed identifiers and compatibility, history-preserving lifecycle, stable commands, post-serialization current time, least privilege, provider-neutral failures and an authenticated phase-exit proof requirement.

## Acceptance references

- BE-01: `docs/05-backend/be-01-acceptance.md`
- BE-02: `docs/05-backend/be-02-acceptance.md`
- BE-03: `docs/05-backend/be-03-acceptance.md`
- BE-04: `docs/05-backend/be-04-acceptance.md`
- BE-05 normative: `docs/05-backend/be-05-overview.md`, `docs/05-backend/be-05-decisions.md`
- BE-05 Household authority: `docs/05-backend/be-05-household-catalog-authority-kernel.md`
- BE-05 CreateHouseholdProduct candidate: `docs/05-backend/be-05-create-household-product.md`, `docs/05-backend/be-05-create-household-product-acceptance.md`

## Current delivery status

- Backend: BE-00 through BE-04 accepted/closed; BE-05 normative baseline + Household catalog authority kernel accepted; CreateHouseholdProduct under validation/review.
- Frontend: **not started**.
- Production deployment: **not started**.

## Governance rule

The repository is the canonical source of truth. Changes progress through branch → review → exact-HEAD validation → explicit merge authorization.

A passing implementation does not override a violated domain, relational, physical, runtime, application-kernel, identity-boundary, Household-access, storage-topology or product-catalog invariant.

BE-05 must not silently reopen or weaken DB-00/DB-01/DB-02/BE-00/BE-01/BE-02/BE-03/BE-04. If implementation exposes a genuine contradiction, it must be recorded and governed explicitly rather than hidden in framework, ORM, SQL, authentication provider or deployment convenience.
