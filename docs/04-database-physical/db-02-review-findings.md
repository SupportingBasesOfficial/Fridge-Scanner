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

### F2-023 — One Preparation movement evidence edge could imply two incompatible unit conversions

**Severity:** quantity-reproducibility ambiguity.

A Preparation input/output movement edge carries one `conversion_evidence_id`, but the edge participates both in reconciliation against its InventoryMovement and against the Preparation input/output aggregate. If those two targets use different units, one evidence row cannot prove two distinct conversions without ambiguity.

**Resolution:** `000024__preparation_movement_unit_alignment.sql` requires the InventoryMovement and Preparation input/output to share the same canonical reconciliation unit. The edge may still use a different source unit only when its single pinned conversion evidence converts exactly into that shared target unit.

**Status:** CLOSED.

### F2-024 — Alert primariness was implicit in unconstrained free-text role

**Severity:** explainability integrity ambiguity.

DB-01 requires at least one primary trigger subject, but `subject_role` is governed free text and no canonical literal such as `PRIMARY` had been accepted. Interpreting one magic string inside the guard would invent domain taxonomy.

**Resolution:** `000026__alert_trigger_completeness.sql` adds typed `is_primary boolean` evidence. Deferred postconditions require at least one trigger subject and at least one explicitly primary subject without redefining `subject_role` semantics.

**Status:** CLOSED.

### F2-025 — Naive lexical migration order could execute correction substeps before their base migration

**Severity:** fresh-install executable-schema blocker.

Files such as `000009_01__preparation_allocation_scope.sql`, `000010_01__shelf_life_timezone_contract.sql`, `000012_01__notification_delivery_time_guard.sql` and `000013_01__external_reference_import_context.sql` sort before their `000009__...`, `000010__...`, `000012__...`, `000013__...` base files under ordinary lexical ordering. Those substeps reference objects created by the base migration.

**Resolution:** the canonical migration ordering is now parsed as `(major_sequence, substep)`, where `NNNNNN__...` is substep `00` and `NNNNNN_01__...` is substep `01`. `database/scripts/run_db02_gate.py` rejects malformed names/duplicate slots and implements that exact order. `db-02-migration-strategy.md` now makes raw filesystem order explicitly non-authoritative.

**Status:** CLOSED.

## Pass 11 — catalog scope and identifier contracts

### F2-026 — Shelf-life activation draft overconstrained compatibility evidence to Household-only

**Severity:** catalog-reuse semantic overconstraint.

The first catalog-scope guard draft required concept-targeted ShelfLifeRuleActivation to use CompatibilityDecisionEvidence whose `household_id` exactly matched the activation Household. That incorrectly rejected valid GLOBAL compatibility evidence over GLOBAL Product/IngredientConcept/mapping endpoints.

**Resolution:** `000028__catalog_scope_guards.sql` accepts either GLOBAL compatibility evidence or same-Household evidence, while still requiring exact Product/IngredientConcept endpoint identity and rule visibility.

**Status:** CLOSED.

### F2-027 — ProductIdentifier could diverge from its normalization-rule namespace contract

**Severity:** canonical identifier integrity gap.

`product_identifier` originally referenced only `normalization_rule_id`; it could declare a different `scheme_code`, use an issuer namespace inconsistent with the rule, or attach a GLOBAL namespace identifier to a private Household Product. A staged claim could similarly persist a normalized value without an exact normalization rule.

**Resolution:** `000029__product_identifier_contract_guards.sql` pins scheme, namespace mode/issuer and GLOBAL Product applicability to the exact normalization rule, and requires staged normalized values to carry the exact rule. Matching adversarial tests cover scheme mismatch, GLOBAL→private Product rejection, issuer mismatch and staged normalization/candidate scope.

**Status:** CLOSED.

## Pass 12 — household catalog consumption and cross-row structure

### F2-028 — Household operational rows could reference another Household's private catalog

**Severity:** cross-Household integrity gap.

Several Household-scoped operational tables used ordinary Product/IngredientConcept FKs. Existence was enforced, but a row owned by Household A could still point to a private catalog object owned by Household B.

**Resolution:** `000030__household_catalog_visibility_guards.sql` adds reusable Product/IngredientConcept visibility assertions and deferred guards for procurement, receiving, StockItem/InventoryMovement, PreparationOutput, replenishment policy, shopping intent and alert Product subjects. GLOBAL and same-Household private catalog objects are accepted; cross-Household private references are rejected.

**Status:** CLOSED.

### F2-029 — Household timezone intervals had no transaction-safe non-overlap guard

**Severity:** historical temporal-authority gap.

DB-01 requires a deterministic versioned Household timezone history, but local row checks alone cannot prevent two effective intervals for the same Household from overlapping.

**Resolution:** `000031__temporal_hierarchy_guards.sql` serializes interval writers through the Household row and rejects any pair of overlapping intervals while allowing adjacent boundaries and independent Household timelines.

**Status:** CLOSED.

### F2-030 — ProductCategory hierarchy could form indirect cycles

**Severity:** hierarchical integrity gap.

The base DDL rejected only direct self-parenting. A multi-row chain could still be reparented into an indirect cycle.

**Resolution:** `000031__temporal_hierarchy_guards.sql` adds a recursive ancestor validation under a hierarchy-writer lock and rejects any reparenting that makes the category its own ancestor.

**Status:** CLOSED.

## Pass 13 — executable PostgreSQL gate

### F2-031 — Batch was incorrectly treated as directly Household-scoped by RLS

**Severity:** fresh-install executable-schema blocker and confidentiality-model error.

The first executable `000017` RLS list included `batch` under the generic `household_id` policy even though Batch is Product-scoped and has no `household_id`. PostgreSQL 17/18 fresh install failed on the nonexistent column.

**Resolution:** Batch was removed from the direct-Household list and now has Product-derived RLS: GLOBAL Product batches are readable to tenant contexts; private Product batches are visible/writable only to the owning Household.

**Status:** CLOSED.

### F2-032 — Integration RLS referenced a nonexistent scope column

**Severity:** fresh-install executable-schema blocker.

The initial Integration policy used stale name `binding_scope`; the canonical physical column is `integration_scope`.

**Resolution:** `000017__security_context_rls.sql` now uses `integration_scope = 'HOUSEHOLD'` with exact Household context equality. PostgreSQL 17/18 migration execution subsequently passed.

**Status:** CLOSED.

### F2-033 — `--print-order` unexpectedly executed migrations when DATABASE_URL existed

**Severity:** migration-runner correctness gap.

The first DB-02 runner implementation printed canonical order and then continued into execution whenever the workflow environment already supplied `DATABASE_URL`, causing the diagnostic step to mutate the database.

**Resolution:** `--print-order` now always returns immediately after filename/order validation. The workflow's order step is side-effect free; the subsequent gate step is the single migration/test execution.

**Status:** CLOSED.

### F2-034 — Large rational test expected partial rather than canonical GCD reduction

**Severity:** test-oracle correctness gap.

The arbitrary-precision fixture multiplied both inputs by seven but the underlying pair already shared GCD nine. The implementation correctly removed total GCD 63 while the test expected only the injected factor.

**Resolution:** the test now asserts the fully canonical coprime result. PostgreSQL 17/18 subsequently pass the large-value rational case.

**Status:** CLOSED.

### F2-035 — Integrity fixtures had drifted behind the accepted physical schema

**Severity:** executable test-suite blocker.

Real PG17/18 execution exposed several stale fixtures: Preparation output omitted nullable `stock_item_id`; Shopping wrong-Product testing collided with pair uniqueness before reaching the intended FK; the idempotency test omitted trusted Household context after security hardening; and the immutability test used pre-final SourceExpirationFact column names.

**Resolution:** each fixture was updated to exercise the intended current invariant rather than weakening schema enforcement. By DB-02 Gate run #18 the complete integrity suite passed on both PostgreSQL versions.

**Status:** CLOSED.

### F2-036 — Privileged GLOBAL idempotency callers lacked internal-schema namespace usage

**Severity:** least-privilege boundary usability gap.

`fridge_owner`/`fridge_migrator` had EXECUTE on `acquire_global_idempotency()` and USAGE on its composite return type but lacked `USAGE ON SCHEMA fridge_internal`, so an authorized `SET ROLE fridge_migrator` caller could not name the function/type.

**Resolution:** `000020__global_idempotency_boundary.sql` grants only `USAGE ON SCHEMA fridge_internal` in addition to the already narrow type/function grants. No table, sequence or direct DML privilege is added. DB-02 Gate run #18 passed this boundary on PostgreSQL 17 and 18.

**Status:** CLOSED.

## Current review state

Known findings F2-001 through F2-036 are CLOSED. DB-02 PostgreSQL Gate run #18 (`33831776509`) passed the complete canonical migration lineage, integrity suite and RLS suite on both PostgreSQL 17 and PostgreSQL 18 at branch HEAD `c09d050af0bc99f20e7f650acb3ae9e43e1cdbd9`.

The branch has since received governance-only documentation updates, so DB-02 is **not yet declared CLEAN** until the new exact HEAD receives its own green PG17/PG18 gate and final panoramic/red-team review. No known material physical finding is currently open.

## Rule

Any finding that could permit a DB-00/DB-01 invariant violation, cross-Household attachment, quantity/money approximation, historical mutation, ambiguous authorization or non-reproducible migration is material until closed and re-reviewed on the new exact HEAD.
