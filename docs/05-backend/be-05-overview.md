# FridgeScanner — BE-05 Product Catalog Governance

## Status

BE-05 normative baseline candidate. This phase begins only after the accepted BE-04 Storage Topology closure and consumes DB-00, DB-01, DB-02 and BE-00 through BE-04 as upstream authority.

BE-05 does not reopen storage-topology semantics. Product Catalog is a separate domain boundary whose facts may later be referenced by procurement, inventory, recipes, shelf life, shopping and integrations.

## Purpose

BE-05 establishes executable application/persistence/delivery contracts for governed catalog truth before procurement and inventory workflows begin depending on it.

The canonical catalog model distinguishes:

- `IngredientConcept`: recipe-facing semantic food concept;
- `Product`: stockable canonical product identity, not synonymous with retail SKU;
- `ProductCategory`: governed hierarchy;
- `Brand` and `Manufacturer`: distinct optional commercial concepts;
- `ProductIdentifier`: governed canonical identifier with scheme/namespace/versioned normalization evidence;
- `StagedIdentifierClaim`: Household-scoped unresolved identifier evidence that cannot reserve canonical uniqueness;
- `ProductIngredientCompatibility`: governed, versioned Product↔IngredientConcept relationship;
- `CompatibilityDecisionEvidence`: immutable evidence of the exact compatibility decision used by a committed downstream fact.

## Catalog scopes

Catalog truth has two explicit scopes:

### GLOBAL

A GLOBAL Product or IngredientConcept has no Household owner. Ordinary Household authority does not imply permission to mutate global catalog truth.

Global catalog mutation requires a distinct platform/global-governance authority boundary. BE-05 must not infer this authority from a provider role claim, from a Household role, from possession of stock referencing the entity, or from a globally namespaced identifier observation.

### HOUSEHOLD

A HOUSEHOLD Product or IngredientConcept belongs to exactly one Household. Current membership is necessary for observation of private catalog truth; mutation requires a dedicated Household catalog-administration capability established by BE-05.

A Household context may consume GLOBAL catalog entities plus entities owned by that same Household. It must never observe or reference another Household's private catalog entity.

Ownership/scope is immutable in ordinary BE-05 operations. Promotion, sharing, cloning, canonical merge or migration across scopes is an explicit governed workflow, never a metadata update.

## Authority model

BE-05 must preserve the accepted chain:

```text
verified provider evidence
  -> platform PrincipalId
  -> current platform/Household authority
  -> catalog-specific governed capability
  -> intent-specific read/mutation
  -> least-privileged persistence
  -> provider-neutral delivery
```

Household catalog mutation authority must be distinct from `HOUSEHOLD_STORAGE_ADMINISTER` and `HOUSEHOLD_MEMBERSHIP_ADMINISTER`.

Global catalog governance must be a separate authority from Household authority. A global Product cannot become mutable merely because it is visible or referenced by a Household.

## Visibility model

For a Household-scoped consumer:

- GLOBAL Product/IngredientConcept may be visible when active and eligible;
- same-Household private Product/IngredientConcept may be visible when active and eligible;
- another Household's private Product/IngredientConcept is invisible;
- hidden/missing/foreign private targets must collapse through nondisclosure-safe provider-neutral outcomes;
- read access never upgrades into mutation authority.

Search/list/read contracts must define deterministic ordering and must not expose private-entity existence through totals, pagination metadata, identifier collisions or error shape.

## Product identity

Product identity is independent from:

- current Household stock;
- storage placement;
- purchase price;
- barcode/SKU;
- Batch;
- Brand or Manufacturer.

Brand, Manufacturer, Category and identifiers are metadata/relationships around Product, not substitute primary identities.

A valid Product may be unbranded, loose, Household-defined or a reusable prepared-food identity.

## Identifier governance

Canonical ProductIdentifier resolution is governed by:

- explicit `scheme_code`;
- namespace mode (`GLOBAL` or issuer-scoped);
- issuer namespace when required;
- exact source value;
- normalized value;
- exact normalization-rule identity/version;
- lifecycle/provenance.

BE-05 must not normalize identifiers with generic string cleanup or deployment-local assumptions.

Globally namespaced canonical identifiers may belong only to GLOBAL Products. A Household observation of a global identifier that is not yet canonically resolved becomes `StagedIdentifierClaim`; it must not reserve or consume canonical global uniqueness and must not silently promote a Household Product.

Normalization-rule changes are versioned. They never rewrite historical source/normalized values in place. Collision/change detection must remain governed and deterministic.

## Compatibility governance

Product↔IngredientConcept compatibility is explicit governed domain data, not fuzzy name matching.

A GLOBAL compatibility mapping may reference only GLOBAL entities. A HOUSEHOLD mapping may reference GLOBAL or same-Household entities, never another Household's private entities.

Mappings are versioned and effective-dated. Downstream committed facts that depend on compatibility must preserve `CompatibilityDecisionEvidence`; later mapping changes cannot reinterpret history.

## Lifecycle

Ordinary removal is lifecycle retirement, not destructive deletion of catalog truth already referenced by business history.

New mutations operate only on current eligible targets/reference data. Committed replay returns the original committed outcome without reactivating or restoring later-changed catalog state.

Retirement must be dependency-aware. BE-05 may not claim a catalog entity can be retired safely if the operation would violate an accepted FK/business dependency; it must either prove safe retirement or block with an explicit provider-neutral conflict.

## Commands and idempotency

Every retriable BE-05 mutation uses a stable caller-supplied `CommandId`.

The fingerprint binds at minimum:

- authority scope (`GLOBAL` or exact Household);
- actor PrincipalId;
- operation name/version;
- target identity for existing-resource mutations;
- candidate identity only when semantically required (server-generated candidates must not become caller-controlled collision oracles);
- normalized business facts.

Committed replay is non-restoring and must be evaluated before current-state validation where required to make lost-response retry safe.

Cross-intent reuse of one CommandId in the same governed command scope must conflict rather than acquire a second meaning.

## Concurrency and time

BE-05 must define canonical serialization anchors before executable mutations are accepted.

At minimum:

- Household-private mutations serialize through current Household authority and the relevant catalog target/reference rows;
- global mutations use an explicit global-governance serialization strategy rather than a fake Household;
- uniqueness/resolution operations serialize on the canonical identifier namespace/rule/value decision point;
- fresh database time is sampled after the required serialization locks whenever lifecycle/effective-time truth depends on the serialized state.

`statement_timestamp()` must not be used as execution-time current truth after lock waits in serialized kernels.

## Least privilege

The ordinary runtime role must not receive broad direct catalog DML merely to implement BE-05.

Persistence must expose intent-specific SECURITY DEFINER/functions or equivalently narrow adapters. Global-governance persistence and Household-catalog persistence must not be conflated into one broad privilege surface.

Raw PostgreSQL errors, SQLSTATEs, table names, provider identifiers and hidden entity existence must not leak through application/delivery contracts.

## Initial executable slices

The normative baseline is expected to lead to small, independently reviewed slices such as:

1. catalog authority kernel(s): Household catalog administration and explicit global-governance boundary;
2. current Product/IngredientConcept observational reads with GLOBAL + same-Household visibility;
3. governed Household Product creation/change/retirement;
4. governed Household IngredientConcept creation/change/retirement;
5. ProductIdentifier observation/resolution boundary, including staged claims;
6. governed compatibility mapping/evidence contracts;
7. global catalog workflows only after their authority source and governance policy are explicitly materialized;
8. authenticated HTTP delivery and BE-05 phase-exit proof.

This ordering may be refined by review, but later procurement/inventory phases must not bypass the catalog contracts to gain speed.

## Explicit non-goals

BE-05 does not implement:

- Purchase/Receipt workflows;
- StockItem creation/movement/consumption;
- Inventory count/reconciliation;
- Recipe execution;
- shelf-life evaluation;
- shopping/replenishment;
- camera/device recognition as authoritative catalog truth;
- automatic global catalog crowdsourcing;
- silent Product merge/promotion across scopes;
- production frontend/deployment.

A scanner/import may eventually create identifier evidence, but observation is not equivalent to canonical Product resolution or mutation authority.

## Phase-exit condition

BE-05 closes only after an authenticated runtime proof demonstrates at least one real governed catalog mutation and subsequent observation while proving the critical scope boundary.

The final proof must include, at minimum:

```text
signed authenticated identity
  -> platform PrincipalId
  -> current authority for requested catalog scope
  -> catalog-specific capability/governance
  -> intent-specific mutation
  -> least-privileged PostgreSQL persistence
  -> durable command/provenance
  -> authenticated observation
```

Adversarial coverage must prove:

- provider claims cannot create catalog authority;
- Household catalog authority cannot mutate GLOBAL truth;
- one Household cannot observe/mutate another Household's private catalog;
- GLOBAL + same-Household visibility is correct;
- identifier namespace/rule semantics do not become a cross-tenant existence oracle;
- staged claims do not reserve canonical identifier uniqueness;
- lost-response retry is safe and non-restoring;
- cross-intent CommandId reuse conflicts;
- least privilege holds;
- all exact-HEAD CI/review gates are green with zero unresolved material findings.
