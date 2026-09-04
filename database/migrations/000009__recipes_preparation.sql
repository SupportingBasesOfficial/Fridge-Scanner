-- FridgeScanner DB-02
-- 000009__recipes_preparation.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create table fridge.recipe (
  recipe_id uuid primary key,
  catalog_scope fridge.catalog_scope not null,
  owner_household_id uuid,
  canonical_name text not null,
  lifecycle_status text not null,
  created_at timestamptz not null default clock_timestamp(),
  provenance text,
  constraint recipe_owner_fk
    foreign key (owner_household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint recipe_scope_owner_xor
    check (
      (catalog_scope = 'GLOBAL' and owner_household_id is null)
      or
      (catalog_scope = 'HOUSEHOLD' and owner_household_id is not null)
    ),
  constraint recipe_name_nonblank check (btrim(canonical_name) <> ''),
  constraint recipe_status_nonblank check (btrim(lifecycle_status) <> '')
);

comment on table fridge.recipe is
  'Versioned recipe aggregate root with explicit GLOBAL or HOUSEHOLD governance. Reusable recipe identity carries no concrete stock, Batch or placement truth.';

create index recipe_household_scope_idx
  on fridge.recipe (owner_household_id, lifecycle_status, recipe_id)
  where catalog_scope = 'HOUSEHOLD';

create table fridge.recipe_version (
  recipe_version_id uuid primary key,
  recipe_id uuid not null,
  catalog_scope fridge.catalog_scope not null,
  owner_household_id uuid,
  version_no integer not null,
  lifecycle_status text not null,
  published_at timestamptz,
  yield_quantity_num numeric,
  yield_quantity_den numeric,
  yield_unit_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint recipe_version_recipe_fk
    foreign key (recipe_id)
    references fridge.recipe (recipe_id)
    on update restrict on delete restrict,
  constraint recipe_version_owner_fk
    foreign key (owner_household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint recipe_version_yield_unit_fk
    foreign key (yield_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint recipe_version_scope_owner_xor
    check (
      (catalog_scope = 'GLOBAL' and owner_household_id is null)
      or
      (catalog_scope = 'HOUSEHOLD' and owner_household_id is not null)
    ),
  constraint recipe_version_version_positive check (version_no > 0),
  constraint recipe_version_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint recipe_version_yield_shape
    check (
      (yield_quantity_num is null and yield_quantity_den is null and yield_unit_id is null)
      or
      (
        yield_quantity_num is not null
        and yield_quantity_den is not null
        and yield_unit_id is not null
        and yield_quantity_num > 0
        and fridge_internal.assert_normalized_rational(yield_quantity_num, yield_quantity_den)
      )
    ),
  constraint recipe_version_recipe_version_uq unique (recipe_id, version_no),
  constraint recipe_version_identity_recipe_uq unique (recipe_version_id, recipe_id)
);

comment on table fridge.recipe_version is
  'Exact reusable recipe version. Scope/owner equality with Recipe, global/private catalog visibility and immutability after publication/use are enforced by governed recipe mutation boundaries plus later immutable guards.';

create index recipe_version_recipe_idx
  on fridge.recipe_version (recipe_id, version_no desc, recipe_version_id);

create table fridge.recipe_ingredient (
  recipe_ingredient_id uuid primary key,
  recipe_version_id uuid not null,
  ingredient_concept_id uuid not null,
  exact_product_id uuid,
  required_quantity_num numeric not null,
  required_quantity_den numeric not null,
  required_unit_id uuid not null,
  stable_line_key text not null,
  sort_order integer,
  is_optional boolean not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint recipe_ingredient_version_fk
    foreign key (recipe_version_id)
    references fridge.recipe_version (recipe_version_id)
    on update restrict on delete restrict,
  constraint recipe_ingredient_concept_fk
    foreign key (ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint recipe_ingredient_exact_product_fk
    foreign key (exact_product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint recipe_ingredient_unit_fk
    foreign key (required_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint recipe_ingredient_quantity_positive_normalized
    check (
      required_quantity_num > 0
      and fridge_internal.assert_normalized_rational(required_quantity_num, required_quantity_den)
    ),
  constraint recipe_ingredient_stable_line_nonblank check (btrim(stable_line_key) <> ''),
  constraint recipe_ingredient_version_line_uq unique (recipe_version_id, stable_line_key),
  constraint recipe_ingredient_identity_version_uq unique (recipe_ingredient_id, recipe_version_id)
);

comment on table fridge.recipe_ingredient is
  'Immutable measurable ingredient line of one RecipeVersion. Scope visibility, concept compatibility and any future tolerance policy are governed explicitly; invariant-bearing constraints may not be hidden in opaque metadata.';

create index recipe_ingredient_version_order_idx
  on fridge.recipe_ingredient (recipe_version_id, sort_order, recipe_ingredient_id);

create table fridge.preparation (
  preparation_id uuid primary key,
  household_id uuid not null,
  recipe_version_id uuid,
  lifecycle_status text not null,
  occurred_at timestamptz not null,
  scaling_quantity_num numeric,
  scaling_quantity_den numeric,
  scaling_unit_id uuid,
  scaling_method_code text,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint preparation_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint preparation_recipe_version_fk
    foreign key (recipe_version_id)
    references fridge.recipe_version (recipe_version_id)
    on update restrict on delete restrict,
  constraint preparation_scaling_unit_fk
    foreign key (scaling_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint preparation_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint preparation_scaling_shape
    check (
      (
        scaling_quantity_num is null
        and scaling_quantity_den is null
        and scaling_unit_id is null
        and scaling_method_code is null
      )
      or
      (
        recipe_version_id is not null
        and scaling_quantity_num is not null
        and scaling_quantity_den is not null
        and scaling_unit_id is not null
        and scaling_method_code is not null
        and btrim(scaling_method_code) <> ''
        and scaling_quantity_num > 0
        and fridge_internal.assert_normalized_rational(scaling_quantity_num, scaling_quantity_den)
      )
    ),
  constraint preparation_household_identity_uq unique (household_id, preparation_id),
  constraint preparation_household_recipe_identity_uq
    unique nulls not distinct (household_id, preparation_id, recipe_version_id)
);

comment on table fridge.preparation is
  'Concrete Household-scoped transformation execution. recipe_version_id is optional for ad-hoc preparation; recipe visibility and the exact version/scope admissibility are validated by the governed preparation commit boundary.';

create index preparation_household_occurred_idx
  on fridge.preparation (household_id, occurred_at desc, preparation_id);

create table fridge.preparation_recipe_requirement (
  preparation_recipe_requirement_id uuid primary key,
  household_id uuid not null,
  preparation_id uuid not null,
  recipe_version_id uuid not null,
  recipe_ingredient_id uuid not null,
  effective_required_quantity_num numeric not null,
  effective_required_quantity_den numeric not null,
  effective_required_unit_id uuid not null,
  scaling_evidence text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint preparation_requirement_preparation_version_fk
    foreign key (household_id, preparation_id, recipe_version_id)
    references fridge.preparation (household_id, preparation_id, recipe_version_id)
    on update restrict on delete restrict,
  constraint preparation_requirement_ingredient_version_fk
    foreign key (recipe_ingredient_id, recipe_version_id)
    references fridge.recipe_ingredient (recipe_ingredient_id, recipe_version_id)
    on update restrict on delete restrict,
  constraint preparation_requirement_unit_fk
    foreign key (effective_required_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint preparation_requirement_quantity_positive_normalized
    check (
      effective_required_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        effective_required_quantity_num,
        effective_required_quantity_den
      )
    ),
  constraint preparation_requirement_scaling_evidence_nonblank
    check (btrim(scaling_evidence) <> ''),
  constraint preparation_requirement_line_uq
    unique (preparation_id, recipe_ingredient_id),
  constraint preparation_requirement_household_identity_uq
    unique (household_id, preparation_recipe_requirement_id),
  constraint preparation_requirement_household_line_identity_uq
    unique (household_id, preparation_recipe_requirement_id, recipe_ingredient_id)
);

comment on table fridge.preparation_recipe_requirement is
  'Immutable per-execution effective requirement for one exact RecipeIngredient. It freezes scaling/yield outcome so historical fulfillment never depends on the current reusable recipe definition.';

create index preparation_requirement_preparation_idx
  on fridge.preparation_recipe_requirement (household_id, preparation_id, recipe_ingredient_id);

create table fridge.preparation_input (
  preparation_input_id uuid primary key,
  household_id uuid not null,
  preparation_id uuid not null,
  stock_item_id uuid not null,
  product_id uuid not null,
  consumed_quantity_num numeric not null,
  consumed_quantity_den numeric not null,
  consumed_unit_id uuid not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint preparation_input_preparation_fk
    foreign key (household_id, preparation_id)
    references fridge.preparation (household_id, preparation_id)
    on update restrict on delete restrict,
  constraint preparation_input_stock_product_fk
    foreign key (household_id, stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint preparation_input_unit_fk
    foreign key (consumed_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint preparation_input_quantity_positive_normalized
    check (
      consumed_quantity_num > 0
      and fridge_internal.assert_normalized_rational(consumed_quantity_num, consumed_quantity_den)
    ),
  constraint preparation_input_household_identity_uq
    unique (household_id, preparation_input_id),
  constraint preparation_input_household_product_identity_uq
    unique (household_id, preparation_input_id, product_id),
  constraint preparation_input_household_preparation_identity_uq
    unique (household_id, preparation_id, preparation_input_id)
);

comment on table fridge.preparation_input is
  'Concrete consumed holding/Product quantity for a Preparation. Quantity is reconciled to explicit stock-reducing InventoryMovement effects and source-side allocation/deviation evidence at governed commit.';

create index preparation_input_preparation_idx
  on fridge.preparation_input (household_id, preparation_id, preparation_input_id);

create table fridge.preparation_input_movement (
  preparation_input_movement_id uuid primary key,
  household_id uuid not null,
  preparation_input_id uuid not null,
  product_id uuid not null,
  inventory_movement_id uuid not null,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  conversion_evidence_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint preparation_input_movement_input_product_fk
    foreign key (household_id, preparation_input_id, product_id)
    references fridge.preparation_input (household_id, preparation_input_id, product_id)
    on update restrict on delete restrict,
  constraint preparation_input_movement_ledger_product_fk
    foreign key (household_id, inventory_movement_id, product_id)
    references fridge.inventory_movement (household_id, inventory_movement_id, product_id)
    on update restrict on delete restrict,
  constraint preparation_input_movement_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint preparation_input_movement_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint preparation_input_movement_quantity_positive_normalized
    check (
      quantity_num > 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint preparation_input_movement_ledger_uq unique (inventory_movement_id),
  constraint preparation_input_movement_household_identity_uq
    unique (household_id, preparation_input_movement_id)
);

comment on table fridge.preparation_input_movement is
  'Input-to-ledger materialization edge. One decrement movement cannot satisfy multiple PreparationInputs; exact sign and sum-to-input conservation are enforced by governed transaction/deferred guards.';

create index preparation_input_movement_input_idx
  on fridge.preparation_input_movement (household_id, preparation_input_id);

create table fridge.preparation_input_allocation (
  preparation_input_allocation_id uuid primary key,
  household_id uuid not null,
  preparation_input_id uuid not null,
  product_id uuid not null,
  preparation_recipe_requirement_id uuid not null,
  recipe_ingredient_id uuid not null,
  allocated_quantity_num numeric not null,
  allocated_quantity_den numeric not null,
  allocation_unit_id uuid not null,
  compatibility_evidence_id uuid,
  conversion_evidence_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint preparation_input_allocation_input_product_fk
    foreign key (household_id, preparation_input_id, product_id)
    references fridge.preparation_input (household_id, preparation_input_id, product_id)
    on update restrict on delete restrict,
  constraint preparation_input_allocation_requirement_line_fk
    foreign key (
      household_id,
      preparation_recipe_requirement_id,
      recipe_ingredient_id
    )
    references fridge.preparation_recipe_requirement (
      household_id,
      preparation_recipe_requirement_id,
      recipe_ingredient_id
    )
    on update restrict on delete restrict,
  constraint preparation_input_allocation_unit_fk
    foreign key (allocation_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint preparation_input_allocation_compatibility_fk
    foreign key (compatibility_evidence_id)
    references fridge.compatibility_decision_evidence (compatibility_evidence_id)
    on update restrict on delete restrict,
  constraint preparation_input_allocation_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint preparation_input_allocation_quantity_positive_normalized
    check (
      allocated_quantity_num > 0
      and fridge_internal.assert_normalized_rational(allocated_quantity_num, allocated_quantity_den)
    ),
  constraint preparation_input_allocation_pair_uq
    unique (preparation_input_id, preparation_recipe_requirement_id),
  constraint preparation_input_allocation_household_identity_uq
    unique (household_id, preparation_input_allocation_id)
);

comment on table fridge.preparation_input_allocation is
  'Measurable allocation from one concrete PreparationInput into one frozen effective recipe requirement. Compatibility evidence is pinned when concept-based fulfillment requires it; exact-product and compatibility applicability are verified by the governed commit boundary.';

create index preparation_input_allocation_input_idx
  on fridge.preparation_input_allocation (household_id, preparation_input_id);
create index preparation_input_allocation_requirement_idx
  on fridge.preparation_input_allocation (household_id, preparation_recipe_requirement_id);

create table fridge.preparation_input_deviation (
  preparation_input_deviation_id uuid primary key,
  household_id uuid not null,
  preparation_input_id uuid not null,
  product_id uuid not null,
  deviation_classification text not null,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  reason text not null,
  approved_by_user_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint preparation_input_deviation_input_product_fk
    foreign key (household_id, preparation_input_id, product_id)
    references fridge.preparation_input (household_id, preparation_input_id, product_id)
    on update restrict on delete restrict,
  constraint preparation_input_deviation_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint preparation_input_deviation_approver_fk
    foreign key (approved_by_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint preparation_input_deviation_class_nonblank
    check (btrim(deviation_classification) <> ''),
  constraint preparation_input_deviation_reason_nonblank
    check (btrim(reason) <> ''),
  constraint preparation_input_deviation_quantity_positive_normalized
    check (
      quantity_num > 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint preparation_input_deviation_household_identity_uq
    unique (household_id, preparation_input_deviation_id)
);

comment on table fridge.preparation_input_deviation is
  'Explicit source-side portion not allocated as ordinary recipe fulfillment, such as non-recipe addition, process loss or other governed deviation. Allocation plus deviations must exactly exhaust the input at commit.';

create index preparation_input_deviation_input_idx
  on fridge.preparation_input_deviation (household_id, preparation_input_id);

create table fridge.recipe_fulfillment_deviation (
  recipe_fulfillment_deviation_id uuid primary key,
  household_id uuid not null,
  preparation_recipe_requirement_id uuid not null,
  recipe_ingredient_id uuid not null,
  deviation_classification text not null,
  expected_quantity_num numeric not null,
  expected_quantity_den numeric not null,
  actual_quantity_num numeric not null,
  actual_quantity_den numeric not null,
  measurement_unit_id uuid not null,
  reason text not null,
  approved_by_user_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint recipe_fulfillment_deviation_requirement_fk
    foreign key (
      household_id,
      preparation_recipe_requirement_id,
      recipe_ingredient_id
    )
    references fridge.preparation_recipe_requirement (
      household_id,
      preparation_recipe_requirement_id,
      recipe_ingredient_id
    )
    on update restrict on delete restrict,
  constraint recipe_fulfillment_deviation_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint recipe_fulfillment_deviation_approver_fk
    foreign key (approved_by_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint recipe_fulfillment_deviation_class_nonblank
    check (btrim(deviation_classification) <> ''),
  constraint recipe_fulfillment_deviation_reason_nonblank
    check (btrim(reason) <> ''),
  constraint recipe_fulfillment_deviation_expected_positive_normalized
    check (
      expected_quantity_num > 0
      and fridge_internal.assert_normalized_rational(expected_quantity_num, expected_quantity_den)
    ),
  constraint recipe_fulfillment_deviation_actual_nonnegative_normalized
    check (
      actual_quantity_num >= 0
      and fridge_internal.assert_normalized_rational(actual_quantity_num, actual_quantity_den)
    ),
  constraint recipe_fulfillment_deviation_requirement_uq
    unique (preparation_recipe_requirement_id),
  constraint recipe_fulfillment_deviation_household_identity_uq
    unique (household_id, recipe_fulfillment_deviation_id)
);

comment on table fridge.recipe_fulfillment_deviation is
  'Explicit target-side underage/overage/tolerance/substitution decision against one frozen effective recipe requirement. Normal fulfillment may not silently diverge.';

create table fridge.preparation_output (
  preparation_output_id uuid primary key,
  household_id uuid not null,
  preparation_id uuid not null,
  product_id uuid not null,
  produced_quantity_num numeric not null,
  produced_quantity_den numeric not null,
  produced_unit_id uuid not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint preparation_output_preparation_fk
    foreign key (household_id, preparation_id)
    references fridge.preparation (household_id, preparation_id)
    on update restrict on delete restrict,
  constraint preparation_output_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint preparation_output_unit_fk
    foreign key (produced_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint preparation_output_quantity_positive_normalized
    check (
      produced_quantity_num > 0
      and fridge_internal.assert_normalized_rational(produced_quantity_num, produced_quantity_den)
    ),
  constraint preparation_output_household_identity_uq
    unique (household_id, preparation_output_id),
  constraint preparation_output_household_product_identity_uq
    unique (household_id, preparation_output_id, product_id)
);

comment on table fridge.preparation_output is
  'Concrete Product quantity produced by a Preparation and remaining available for later inventory semantics. It materializes only through explicit stock-increasing InventoryMovement effects.';

create index preparation_output_preparation_idx
  on fridge.preparation_output (household_id, preparation_id, preparation_output_id);

create table fridge.preparation_output_movement (
  preparation_output_movement_id uuid primary key,
  household_id uuid not null,
  preparation_output_id uuid not null,
  product_id uuid not null,
  inventory_movement_id uuid not null,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  conversion_evidence_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint preparation_output_movement_output_product_fk
    foreign key (household_id, preparation_output_id, product_id)
    references fridge.preparation_output (household_id, preparation_output_id, product_id)
    on update restrict on delete restrict,
  constraint preparation_output_movement_ledger_product_fk
    foreign key (household_id, inventory_movement_id, product_id)
    references fridge.inventory_movement (household_id, inventory_movement_id, product_id)
    on update restrict on delete restrict,
  constraint preparation_output_movement_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint preparation_output_movement_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint preparation_output_movement_quantity_positive_normalized
    check (
      quantity_num > 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint preparation_output_movement_ledger_uq unique (inventory_movement_id),
  constraint preparation_output_movement_household_identity_uq
    unique (household_id, preparation_output_movement_id)
);

comment on table fridge.preparation_output_movement is
  'Output-to-ledger materialization edge. One increment movement cannot materialize multiple PreparationOutputs; exact sign and sum-to-output conservation are enforced by governed transaction/deferred guards.';

create index preparation_output_movement_output_idx
  on fridge.preparation_output_movement (household_id, preparation_output_id);

commit;
