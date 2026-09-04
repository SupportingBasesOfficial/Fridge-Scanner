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

## Pass 3 — identifiers and measurement

### F2-005 — Global normalization-rule uniqueness was NULL-unsafe

**Severity:** canonical identifier collision risk.

The initial normalization-rule candidate key included nullable `issuer_namespace` in one ordinary UNIQUE constraint. PostgreSQL treats NULL values as distinct, so two GLOBAL rules with the same scheme/version could coexist.

**Resolution:** replaced the mixed UNIQUE with two partial unique indexes: `(scheme_code, rule_version)` for GLOBAL rules and `(scheme_code, issuer_namespace, rule_version)` for ISSUER_SCOPED rules.

**Status:** CLOSED.

### F2-006 — Money rounding scale had an invented upper bound

**Severity:** physical overconstraint.

The first money-rounding policy limited decimal scale to 18 even though DB-00/DB-01 define governed exact monetary boundaries, not that arbitrary limit.

**Resolution:** removed the invented maximum; physical validation now requires only non-negative scale within the PostgreSQL column type's representable range.

**Status:** CLOSED.

### F2-007 — Contextual conversion evidence omitted exact formula inputs

**Severity:** historical reproducibility gap.

The first contextual conversion model preserved the applied factor and contract identity/version but not the exact named rational inputs used to select/derive that factor, contrary to DB-00 conversion-evidence requirements.

**Resolution:** added `measurement_conversion_evidence_input`, one typed/named exact rational input per evidence record, optionally carrying MeasurementUnit. The governed commit routine validates the required input set against the referenced context contract version.

**Status:** CLOSED.

## Pass 4 — procurement and inventory ledger

### F2-008 — Monetary fact could pin a rounding policy for another currency

**Severity:** monetary reproducibility/integrity gap.

`purchase_money_fact`, `purchase_item_money_fact` and `purchase_item_pricing_discrepancy` initially referenced `money_rounding_policy_id` by identity only. That allowed a monetary fact in one currency to pin a policy governed for another currency.

**Resolution:** `000007_02__procurement_money_guards.sql` adds candidate key `(currency_code, money_rounding_policy_id)` and replaces all three rounding-policy references with composite FKs using the monetary fact's own `currency_code`. `000007_02__procurement_money_guards.sql` under `database/tests/integrity` adversarially proves that BRL purchase, line and discrepancy facts reject a USD rounding policy.

**Status:** CLOSED.

### F2-009 — Inventory correction reference was not Household/Product scoped

**Severity:** tenant-integrity and historical-correction gap.

The first `000007__inventory_ledger.sql` draft referenced `correction_of_movement_id` by movement identity alone, which could relate a correction in Household/Product A to historical movement in Household/Product B.

**Resolution:** the correction FK now uses `(household_id, correction_of_movement_id, product_id)` against the movement composite candidate key. `000007_01__inventory_correction_scope.sql` proves cross-Household and cross-Product correction attempts are rejected.

**Status:** CLOSED.

### F2-010 — Batch carried simplified expiration truth

**Severity:** historical shelf-life ambiguity.

The first ledger draft placed `source_expiration_date` directly on Batch. That would create a simplified expiration fact without the source precision, temporal anchor and provenance required by the accepted shelf-life model, while a later canonical SourceExpirationFact model is still planned.

**Resolution:** removed the Batch expiration column. Batch keeps manufacturer/commercial lot provenance only; source expiration is modeled in the shelf-life migration with explicit precision, anchors and provenance and may reference Batch without making Batch a second expiration authority.

**Status:** CLOSED.

## Current review state

Known findings F2-001 through F2-010 are closed on the branch. DB-02 is **not CLEAN**: the migration lineage is incomplete, rational execution proof is pending, cross-row conservation/mutation guards are not yet installed, and further physical-schema red-team remains required.

## Rule

Any finding that could permit a DB-00/DB-01 invariant violation, cross-Household attachment, quantity/money approximation, historical mutation, ambiguous authorization or non-reproducible migration is material until closed and re-reviewed on the new exact HEAD.
