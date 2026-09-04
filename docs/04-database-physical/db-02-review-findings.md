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

## Pass 5 — inventory count and reconciliation

### F2-011 — Count allocation FK had no matching candidate key

**Severity:** executable-schema blocker.

The first `000008__inventory_count.sql` draft made `inventory_count_allocation` reference `(household_id, inventory_count_item_id, product_id)` but did not declare that exact referenced column set as a candidate key on `inventory_count_item`. PostgreSQL would reject creation of the FK.

**Resolution:** added `inventory_count_item_household_product_identity_uq` on `(household_id, inventory_count_item_id, product_id)` before the allocation table is created. The structural Product equality between CountItem and target StockItem remains enforced through the two composite FKs.

**Status:** CLOSED.

### F2-012 — Physical count layer invented lifecycle/status defaults

**Severity:** domain-governance overreach.

The initial count draft defaulted session status to `OPEN` and line reconciliation status to `PENDING` even though DB-01 requires lifecycle/reconciliation state but does not canonically establish those concrete codes.

**Resolution:** removed both defaults. Status remains required and nonblank, but concrete business values must come from the governed mutation/reference contract rather than being invented by DB-02 DDL.

**Status:** CLOSED.

## Pass 6 — recipes and preparation

### F2-013 — Preparation input allocation was not bound to one execution

**Severity:** historical transformation integrity gap.

The first recipe/preparation draft could link a PreparationInput from one Preparation to a frozen RecipeRequirement from another Preparation in the same Household because the allocation FKs did not carry `preparation_id`.

**Resolution:** `000009_01__preparation_allocation_scope.sql` adds `preparation_id` to `preparation_input_allocation` and replaces both endpoint FKs with execution-scoped composite FKs. The integrity test intentionally attempts a cross-Preparation allocation and requires FK rejection.

**Status:** CLOSED.

### F2-014 — Preparation allocation correction migration referenced a non-candidate key

**Severity:** executable-schema blocker.

The first `000009_01` correction attempted a four-column FK to `preparation_input` before a matching four-column candidate key existed. A later `000009_02` file initially added the key, but migration ordering meant the earlier FK would still fail on a fresh install.

**Resolution:** moved `preparation_input_execution_product_identity_uq` into `000009_01` before the FK creation and removed the redundant later migration. The ordered lineage is again executable by construction.

**Status:** CLOSED.

## Pass 7 — shelf life and expiration

### F2-015 — LOCAL_CALENDAR rule could omit deterministic timezone selection

**Severity:** historical temporal-reproducibility gap.

The first shelf-life draft allowed `LOCAL_CALENDAR` duration semantics while leaving `timezone_selection_code` null. Calendar arithmetic cannot be reproduced deterministically without a governed rule for selecting timezone context. Conversely, `ELAPSED` duration is timezone-independent and should not carry a competing timezone policy.

**Resolution:** `000010_01__shelf_life_timezone_contract.sql` requires an explicit nonblank timezone-selection contract for `LOCAL_CALENDAR` and requires null timezone selection for `ELAPSED`. The matching integrity test proves both invalid shapes are rejected.

**Status:** CLOSED.

## Pass 8 — alerts and notifications

### F2-016 — Notification delivery could precede its attempt

**Severity:** historical delivery-evidence inconsistency.

The first notification-delivery constraint required `attempted_at` whenever `delivered_at` existed but did not require chronological ordering, so a delivery timestamp earlier than its attempt could be persisted.

**Resolution:** `000012_01__notification_delivery_time_guard.sql` replaces the constraint with `delivered_at >= attempted_at` whenever delivery exists. The alert/notification integrity test proves the invalid chronology is rejected.

**Status:** CLOSED.

## Pass 9 — integrations and security boundaries

### F2-017 — Nullable composite ImportRun FK could be bypassed by MATCH SIMPLE

**Severity:** provider-provenance integrity gap.

The first ExternalReference→ImportRun FK used `(integration_id, household_id, import_run_id)`. Under PostgreSQL `MATCH SIMPLE`, a NULL `household_id` makes the composite reference exempt from validation, so a global ExternalReference could name an ImportRun belonging to a different Integration.

**Resolution:** `000013_01__external_reference_import_context.sql` adds an unconditional `(integration_id, import_run_id)` candidate key/FK while retaining the Household-aware composite FK for tenant-bound runs. The matching adversarial test proves the NULL path cannot switch Integration identity.

**Status:** CLOSED.

### F2-018 — RLS migration contained relation-name drift

**Severity:** fresh-install executable-schema blocker.

The first `000017__security_context_rls.sql` draft referenced stale/nonexistent relation names (`product_identifier_staged_claim` and `inventory_shelf_life_lineage`). An ordered install from zero would fail when applying RLS.

**Resolution:** corrected the names to the canonical physical relations `staged_identifier_claim` and `quantity_lineage_shelf_life_fact` before RLS testing.

**Status:** CLOSED.

### F2-019 — Mixed GLOBAL/HOUSEHOLD catalog rows lacked tenant-aware RLS

**Severity:** cross-Household confidentiality gap.

Applying RLS only to direct `household_id` tables would still leave mixed-scope Product, IngredientConcept, compatibility, Recipe/RecipeVersion and ShelfLifeRule relations exposed by ordinary SELECT grants. That could reveal another Household's private catalog rows.

**Resolution:** `000017__security_context_rls.sql` now installs read policies allowing GLOBAL rows plus only the current Household's private rows, with write checks limited to current-Household private rows. RecipeIngredient visibility is inherited through visible RecipeVersion membership.

**Status:** CLOSED.

### F2-020 — Idempotency boundary could not be both function-only and SECURITY INVOKER

**Severity:** privilege-boundary design conflict.

The initial `acquire_idempotency()` routine was SECURITY INVOKER. Granting only EXECUTE would make it unable to write `idempotency_record`; granting table DML so it could work would defeat the intended function-only mutation boundary.

**Resolution:** `000018__idempotency_security_hardening.sql` converts the routine to hardened SECURITY DEFINER, keeps PUBLIC revoked, validates the trusted Household transaction context and allows ordinary app/worker execution without direct table DML.

**Status:** CLOSED.

### F2-021 — Tenant/global idempotency authorization was ambiguous under SET ROLE

**Severity:** authority-escalation/test-validity ambiguity.

The first hardened routine attempted to authorize GLOBAL idempotency by inspecting `session_user` role membership. `SET ROLE fridge_app` does not change `session_user`, so a privileged test/bootstrap session could make an ordinary-role test appear authorized and the same API surface mixed tenant/global authority classes.

**Resolution:** the ordinary `acquire_idempotency()` boundary is now strictly HOUSEHOLD-only. `000020__global_idempotency_boundary.sql` introduces a separate GLOBAL boundary granted only to owner/migrator capabilities, so tenant callers cannot elevate scope by changing a parameter.

**Status:** CLOSED.

### F2-022 — Pre-existing unsafe capability roles could be silently reused

**Severity:** database privilege-escalation gap.

The first capability-role migration created secure roles only when they did not already exist. A pre-existing role named `fridge_app`/`fridge_worker`/etc. with LOGIN, SUPERUSER, CREATEDB, CREATEROLE, INHERIT, REPLICATION or BYPASSRLS could therefore be silently accepted.

**Resolution:** `000019__capability_roles_privileges.sql` now fails fast unless every pre-existing capability role matches the expected NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOREPLICATION/NOBYPASSRLS posture.

**Status:** CLOSED.

## Pass 10 — exact conservation guards

No new defect finding is open in this pass yet. `000021__inventory_transfer_conservation.sql` and `000022__procurement_shopping_conservation.sql` add deferred exact-rational postconditions and parent-row serialization while preserving the deliberate separation between physical receiving and shopping-intent pools.

## Current review state

Known findings F2-001 through F2-022 are closed on the branch. DB-02 is **not CLEAN**: PostgreSQL 17 execution proof is still pending; PostgreSQL 18 compatibility proof is still pending; Preparation, lineage, waste, alert-primary-trigger and remaining catalog/rule mutation guards are not yet complete; RLS/privilege tests have not yet been executed by CI; and further exact-HEAD red-team remains required.

## Rule

Any finding that could permit a DB-00/DB-01 invariant violation, cross-Household attachment, quantity/money approximation, historical mutation, ambiguous authorization or non-reproducible migration is material until closed and re-reviewed on the new exact HEAD.
