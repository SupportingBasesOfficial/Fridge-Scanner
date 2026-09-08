# FridgeScanner — BE-05 Product Catalog Governance Decisions

## Status

Normative decision set for BE-05. These decisions refine, but do not override, accepted DB-00/DB-01/DB-02 and BE-00 through BE-04 authority.

### B5-001 — Product Catalog is a separate bounded authority domain

Product catalog mutation authority is not implied by Household membership administration, storage administration, inventory possession, identifier observation or provider role claims.

### B5-002 — Catalog scope is explicit and authoritative

Every governed Product/IngredientConcept/compatibility mapping has exactly one scope: `GLOBAL` or `HOUSEHOLD`. GLOBAL has no Household owner. HOUSEHOLD has exactly one owner Household.

### B5-003 — Ordinary scope/ownership mutation is forbidden

A Product or IngredientConcept does not change from HOUSEHOLD to GLOBAL, GLOBAL to HOUSEHOLD, or from one Household owner to another through metadata update. Promotion/sharing/cloning/merge is a separate governed workflow with preserved provenance.

### B5-004 — Household catalog mutation requires a dedicated capability

BE-05 will establish a provider-neutral `HOUSEHOLD_CATALOG_ADMINISTER` capability (exact name normative unless a later reviewed baseline change replaces it before implementation). It is distinct from `HOUSEHOLD_MEMBERSHIP_ADMINISTER` and `HOUSEHOLD_STORAGE_ADMINISTER`.

### B5-005 — Global catalog mutation requires explicit platform governance

GLOBAL catalog mutation must use a separate platform/global governance authority. BE-05 must not invent a fake Household owner or treat any Household role as global governance.

### B5-006 — Household visibility is GLOBAL plus same-Household private

A Household-scoped consumer may observe eligible GLOBAL entities plus eligible entities owned by that Household. Another Household's private entities remain hidden.

### B5-007 — Product is not SKU/barcode/Batch/stock

Product identity is canonical stockable identity. Identifier, Batch, Brand, Manufacturer, price, stock and placement are not substitutes for Product identity.

### B5-008 — IngredientConcept is distinct from Product

IngredientConcept is recipe/semantic food identity. Product↔IngredientConcept satisfaction requires governed compatibility; name equality or fuzzy matching is not authoritative.

### B5-009 — Brand and Manufacturer remain distinct

Neither concept may be silently collapsed into the other, and neither is required for Product validity.

### B5-010 — ProductCategory hierarchy is governed

Category direct self-parent is physically blocked already. Any executable category mutation must additionally prevent cycles before commit; recursive hierarchy validity is not delegated to UI convention.

### B5-011 — Canonical identifiers are scheme/namespace/rule-version specific

Identifier identity and uniqueness are evaluated under explicit scheme, namespace/issuer when applicable, normalization rule/version and normalized value. Generic trim/lowercase or deployment-local normalization is forbidden as canonical logic.

### B5-012 — Global identifiers cannot be claimed by Household Products

A canonical identifier from a globally namespaced scheme belongs only to a GLOBAL Product. Household observation of such a key before canonical resolution remains staged evidence.

### B5-013 — StagedIdentifierClaim is evidence, not canonical reservation

Staged claims are Household-scoped unresolved evidence. They do not participate in canonical ProductIdentifier uniqueness and do not grant mutation/ownership of a GLOBAL Product.

### B5-014 — Identifier normalization history is immutable evidence

Rule/version changes create new governed normalization context. Historical source/normalized values and rule identity/version are retained; they are never rewritten in place.

### B5-015 — Identifier migration collisions block

If a normalization-rule transition creates collisions or changes Product matches, the workflow remains staged/blocked for explicit governance. It never silently merges Products or picks a winner based on processing order.

### B5-016 — Product identifiers must not become cross-scope existence oracles

Lookup/resolution errors, collisions and staged-claim outcomes must preserve nondisclosure. A Household caller must not infer another Household's private Product through identifier behavior.

### B5-017 — Compatibility is versioned/effective governed data

Product↔IngredientConcept mappings are versioned, effective-dated and scope-governed. GLOBAL mappings may reference only GLOBAL entities. HOUSEHOLD mappings may reference GLOBAL or same-Household entities only.

### B5-018 — Committed compatibility use pins evidence

Any downstream committed fact that depends on compatibility preserves/immutably references the exact CompatibilityDecisionEvidence. Later mapping changes do not reinterpret historical facts.

### B5-019 — Reads are observational only

Catalog reads never confer mutation authority. Read paths may use current ordinary Household authority where private Household data is involved, while GLOBAL public/platform-visible read policy remains explicitly governed by delivery policy.

### B5-020 — Current reads filter lifecycle eligibility

Default current reads expose only current eligible catalog entities. Historical/retired access, if needed, is a separate explicitly authorized contract.

### B5-021 — Hidden targets collapse safely

Missing, foreign-Household private and otherwise hidden targets produce nondisclosure-safe provider-neutral outcomes. APIs must not distinguish them through status/body/timing-dependent metadata intentionally exposed by the contract.

### B5-022 — Retirement preserves history

Ordinary removal is retirement, not destructive delete. Historical business facts retain references. Retirement blocks when accepted dependencies cannot remain valid.

### B5-023 — No silent reactivation

Ordinary change operations apply only to current eligible targets. Retired catalog entities are not silently reactivated by metadata change or replay.

### B5-024 — Repeated names are not canonical identity

Canonical names are display/semantic metadata and are not sufficient as unique identity across all catalog scopes. Duplicate names may be legitimate unless a narrower governed invariant says otherwise.

### B5-025 — Mutations are intent-specific

BE-05 uses explicit commands such as CreateHouseholdProduct, ChangeHouseholdProductMetadata, RetireHouseholdProduct, rather than generic CRUD/update blobs.

### B5-026 — Retriable mutations require stable caller CommandId

Every retriable mutation uses a stable caller-supplied `CommandId`; generated resource candidates remain server-side unless the domain specifically requires caller ownership of identity.

### B5-027 — Command fingerprint binds semantic scope and intent

Fingerprint includes authority scope, actor, operation/version, target where applicable and normalized semantic facts. One CommandId cannot gain a second catalog intent within the same governed command scope.

### B5-028 — Committed replay is non-restoring

Committed retry returns the original committed outcome after reauthorization as required, but does not reapply old metadata, reactivate a retired entity or restore a prior identifier mapping.

### B5-029 — Household-private serialization starts from Household authority

Household catalog mutations serialize through current Household authority before target/reference locks. Lock ordering must be defined per intent before executable acceptance.

### B5-030 — Global serialization cannot reuse Household locking fiction

Global catalog mutations require a real platform-governance serialization anchor/strategy. A sentinel/fake Household is forbidden.

### B5-031 — Namespace uniqueness operations serialize on the decision point

Canonical identifier creation/resolution must serialize against the relevant normalization rule/namespace/value uniqueness decision so concurrent contenders cannot both commit conflicting canonical truth.

### B5-032 — Current time is sampled after required serialization

Lifecycle/effective-time decisions use fresh database time after the locks that establish current truth. `statement_timestamp()` is not acceptable for post-wait current-state decisions.

### B5-033 — Persistence is least-privileged

Runtime roles receive only the narrow execution/read privileges required by each accepted catalog intent. Broad direct Product/Identifier/Compatibility DML is not the application contract.

### B5-034 — Provider failures are normalized

Raw driver errors, SQLSTATEs, table names and provider-specific metadata do not cross the persistence/application boundary except through provider-neutral error classes.

### B5-035 — Scanner/import output is observation first

A camera, barcode scan or external import may produce identifier/product evidence. It does not by itself create canonical GLOBAL truth, mutate another Household's private truth or bypass normalization/governance.

### B5-036 — Catalog mutation never implies inventory mutation

Creating/changing/retiring Product catalog truth does not create, move, consume or dispose StockItem. Inventory remains a later bounded phase.

### B5-037 — Downstream references must respect catalog visibility

Procurement, inventory, recipes, shelf life, shopping and integrations may reference only catalog entities visible under their governing scope. They may not implement parallel private visibility rules.

### B5-038 — Global/private merge and promotion are explicit deferred workflows

BE-05 baseline does not assume automatic crowdsourced merging. Any future promotion/merge contract must define provenance, alias/history, conflict handling, authority and downstream reference semantics before implementation.

### B5-039 — Authenticated phase-exit proof is mandatory

BE-05 does not close on unit/integration tests alone. A real authenticated request must cross identity, exact catalog authority, intent-specific persistence and subsequent observation, with adversarial scope/identifier/idempotency coverage.

### B5-040 — No later phase may bypass BE-05 to accelerate delivery

Procurement/inventory may not create ad-hoc Products, resolve identifiers with local heuristics, or read private catalog rows directly merely because BE-05 implementation is inconvenient. Catalog governance is upstream authority once accepted.
