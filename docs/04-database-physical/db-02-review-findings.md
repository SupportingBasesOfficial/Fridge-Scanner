# FridgeScanner — DB-02 Independent Review Findings

## Purpose

Traceability log for physical-schema/enforcement findings discovered during DB-02. A finding closes only when the physical decision, SQL artifact, enforcement map and affected tests remain mutually consistent on the new exact HEAD.

## Review baseline

DB-02 begins from accepted DB-01 main commit `33507116eae3e4e79f4d1242d17d7d8f847424d4`.

## Pass 1 — physical baseline and identity/tenancy

### F2-001 — Invalid/redundant duplicate-column Household unique constraint

**Severity:** executable-schema blocker.

The first `household` draft attempted `UNIQUE(household_id, household_id)`, which was unnecessary because `household_id` is already the PK and duplicate-column key syntax does not provide the intended composite integrity.

**Resolution:** removed the constraint. Same-Household integrity is enforced on child/parent relations using meaningful composite candidate keys on the actual parent relation that contains both Household and child identity.

**Status:** CLOSED.

### F2-002 — Physical schema invented concrete Household role codes

**Severity:** domain-governance overreach.

The initial migration seeded OWNER/ADMIN/MEMBER/AUDITOR even though accepted DB-00/DB-01 require Household-scoped authority but do not canonically define that exact role taxonomy.

**Resolution:** retained `household_role` as governed reference structure but removed all guessed role seeds. Concrete business role meanings must enter through a separately accepted reference-data contract.

**Status:** CLOSED.

### F2-003 — Current membership uniqueness depended on mutable status text

**Severity:** lifecycle integrity ambiguity.

The first partial unique index treated only `lifecycle_status = 'ACTIVE'` as current. Because lifecycle status taxonomy is governed/evolvable, a different current-state code could permit two simultaneously open memberships for the same Household/User.

**Resolution:** current-membership uniqueness is now based on the temporal contract itself: only one `(household_id, user_id)` row may have `effective_to IS NULL`, independent of lifecycle label.

**Status:** CLOSED.

## Pass 2 — storage and catalog

### F2-004 — Compatibility invariants were being hidden in JSON

**Severity:** material physical-model integrity gap.

The first storage/catalog migration included `constraint_metadata`, `decision_context` and `approval_context` JSON fields around Product↔IngredientConcept compatibility. Compatibility constraints can change whether a committed Product is valid for a concept, so opaque JSON would make invariant-bearing semantics application-defined and unenforceable.

**Resolution:** removed invariant-bearing compatibility JSON and the invented priority field. The initial DB-02 mapping supports unconditional compatibility only. Any future constraint that changes applicability requires a reviewed typed/versioned relational extension and matching typed decision evidence. Approval/provenance that is not itself a relationship remains explicit scalar/FK evidence.

**Status:** CLOSED.

## Current review state

All findings recorded above are closed on the branch. DB-02 is **not** CLEAN: the migration lineage is still incomplete and rational execution proof plus future physical-schema red-team remain required.

## Rule

Any finding that could permit a DB-00/DB-01 invariant violation, cross-Household attachment, quantity/money approximation, historical mutation, ambiguous authorization or non-reproducible migration is material until closed and re-reviewed on the new exact HEAD.
