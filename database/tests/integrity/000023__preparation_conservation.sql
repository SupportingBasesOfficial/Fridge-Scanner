-- FridgeScanner DB-02 integrity checks for
-- 000023__preparation_conservation.sql and
-- 000024__preparation_movement_unit_alignment.sql

begin;

insert into fridge.household (household_id, display_name)
values ('d1000000-0000-4000-8000-000000000001', 'Preparation conservation household');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('PREP_CONSERVATION_COUNT', 'Preparation conservation count');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values
  (
    'd2000000-0000-4000-8000-000000000001',
    'PREP_CONSERVATION_EACH',
    'PREP_CONSERVATION_COUNT',
    'Each'
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'PREP_CONSERVATION_OTHER',
    'PREP_CONSERVATION_COUNT',
    'Other unit'
  );

insert into fridge.ingredient_concept (
  ingredient_concept_id,
  catalog_scope,
  canonical_name
) values (
  'd3000000-0000-4000-8000-000000000001',
  'GLOBAL',
  'Preparation conservation ingredient'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values
  ('d4000000-0000-4000-8000-000000000001', 'GLOBAL', 'Preparation input product'),
  ('d4000000-0000-4000-8000-000000000002', 'GLOBAL', 'Preparation output product');

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  placement_anchor_kind
) values (
  'd5000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'UNPLACED'
);

insert into fridge.recipe (
  recipe_id,
  catalog_scope,
  canonical_name,
  lifecycle_status
) values (
  'd6000000-0000-4000-8000-000000000001',
  'GLOBAL',
  'Preparation conservation recipe',
  'TEST_ACTIVE'
);

insert into fridge.recipe_version (
  recipe_version_id,
  recipe_id,
  catalog_scope,
  version_no,
  lifecycle_status,
  published_at
) values (
  'd7000000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  'GLOBAL',
  1,
  'TEST_PUBLISHED',
  '2026-02-03T08:00:00Z'
);

insert into fridge.recipe_ingredient (
  recipe_ingredient_id,
  recipe_version_id,
  ingredient_concept_id,
  exact_product_id,
  required_quantity_num,
  required_quantity_den,
  required_unit_id,
  stable_line_key,
  is_optional
) values (
  'd8000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  2,
  1,
  'd2000000-0000-4000-8000-000000000001',
  'ingredient-1',
  false
);

insert into fridge.preparation (
  preparation_id,
  household_id,
  recipe_version_id,
  lifecycle_status,
  occurred_at
) values (
  'd9000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'TEST_COMMITTED',
  '2026-02-03T09:00:00Z'
);

insert into fridge.preparation_recipe_requirement (
  preparation_recipe_requirement_id,
  household_id,
  preparation_id,
  recipe_version_id,
  recipe_ingredient_id,
  effective_required_quantity_num,
  effective_required_quantity_den,
  effective_required_unit_id,
  scaling_evidence
) values (
  'da000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  2,
  1,
  'd2000000-0000-4000-8000-000000000001',
  'exact frozen requirement'
);

insert into fridge.preparation_input (
  preparation_input_id,
  household_id,
  preparation_id,
  stock_item_id,
  product_id,
  consumed_quantity_num,
  consumed_quantity_den,
  consumed_unit_id
) values (
  'db000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  2,
  1,
  'd2000000-0000-4000-8000-000000000001'
);

insert into fridge.inventory_movement (
  inventory_movement_id,
  household_id,
  movement_kind,
  product_id,
  stock_item_id,
  quantity_num,
  quantity_den,
  measurement_unit_id,
  occurred_at,
  placement_anchor_kind
) values
  (
    'dc000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'TEST_PREPARATION_INPUT',
    'd4000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    -1,
    1,
    'd2000000-0000-4000-8000-000000000001',
    '2026-02-03T09:00:00Z',
    'UNPLACED'
  ),
  (
    'dc000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    'TEST_PREPARATION_INPUT',
    'd4000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    -1,
    1,
    'd2000000-0000-4000-8000-000000000001',
    '2026-02-03T09:00:00Z',
    'UNPLACED'
  );

insert into fridge.preparation_input_movement (
  preparation_input_movement_id,
  household_id,
  preparation_input_id,
  product_id,
  inventory_movement_id,
  quantity_num,
  quantity_den,
  measurement_unit_id
) values
  (
    'dd000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'dc000000-0000-4000-8000-000000000001',
    1,
    1,
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'dd000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'dc000000-0000-4000-8000-000000000002',
    1,
    1,
    'd2000000-0000-4000-8000-000000000001'
  );

insert into fridge.preparation_input_allocation (
  preparation_input_allocation_id,
  household_id,
  preparation_id,
  preparation_input_id,
  product_id,
  preparation_recipe_requirement_id,
  recipe_ingredient_id,
  allocated_quantity_num,
  allocated_quantity_den,
  allocation_unit_id
) values (
  'de000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'db000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  2,
  1,
  'd2000000-0000-4000-8000-000000000001'
);

select fridge_internal.assert_preparation_input_movements(
  'd1000000-0000-4000-8000-000000000001',
  'db000000-0000-4000-8000-000000000001'
);
select fridge_internal.assert_preparation_input_accounting(
  'd1000000-0000-4000-8000-000000000001',
  'db000000-0000-4000-8000-000000000001'
);
select fridge_internal.assert_preparation_requirement_fulfillment(
  'd1000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001'
);

-- A positive movement cannot materialize a consumed PreparationInput.
do $$
begin
  begin
    insert into fridge.inventory_movement (
      inventory_movement_id,
      household_id,
      movement_kind,
      product_id,
      stock_item_id,
      quantity_num,
      quantity_den,
      measurement_unit_id,
      occurred_at,
      placement_anchor_kind
    ) values (
      'dc000000-0000-4000-8000-000000000003',
      'd1000000-0000-4000-8000-000000000001',
      'TEST_WRONG_SIGN',
      'd4000000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000001',
      1,
      1,
      'd2000000-0000-4000-8000-000000000001',
      '2026-02-03T09:00:00Z',
      'UNPLACED'
    );

    insert into fridge.preparation_input_movement (
      preparation_input_movement_id,
      household_id,
      preparation_input_id,
      product_id,
      inventory_movement_id,
      quantity_num,
      quantity_den,
      measurement_unit_id
    ) values (
      'dd000000-0000-4000-8000-000000000003',
      'd1000000-0000-4000-8000-000000000001',
      'db000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'dc000000-0000-4000-8000-000000000003',
      1,
      1,
      'd2000000-0000-4000-8000-000000000001'
    );

    perform fridge_internal.assert_preparation_input_movements(
      'd1000000-0000-4000-8000-000000000001',
      'db000000-0000-4000-8000-000000000001'
    );
    raise exception 'positive PreparationInput movement unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Source accounting must equal the input exactly; extra deviation is rejected.
do $$
begin
  begin
    insert into fridge.preparation_input_deviation (
      preparation_input_deviation_id,
      household_id,
      preparation_input_id,
      product_id,
      deviation_classification,
      quantity_num,
      quantity_den,
      measurement_unit_id,
      reason
    ) values (
      'df000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'db000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'TEST_EXTRA',
      1,
      3,
      'd2000000-0000-4000-8000-000000000001',
      'must not over-account input'
    );

    perform fridge_internal.assert_preparation_input_accounting(
      'd1000000-0000-4000-8000-000000000001',
      'db000000-0000-4000-8000-000000000001'
    );
    raise exception 'PreparationInput over-accounting unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Deviations cannot silently use another unit without typed conversion evidence.
do $$
begin
  begin
    insert into fridge.preparation_input_deviation (
      preparation_input_deviation_id,
      household_id,
      preparation_input_id,
      product_id,
      deviation_classification,
      quantity_num,
      quantity_den,
      measurement_unit_id,
      reason
    ) values (
      'df000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000001',
      'db000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'TEST_OTHER_UNIT',
      1,
      1,
      'd2000000-0000-4000-8000-000000000002',
      'no implicit conversion'
    );

    perform fridge_internal.assert_preparation_input_accounting(
      'd1000000-0000-4000-8000-000000000001',
      'db000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-unit PreparationInput deviation unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Fulfillment deviation cannot falsify the frozen expected requirement.
do $$
begin
  begin
    insert into fridge.recipe_fulfillment_deviation (
      recipe_fulfillment_deviation_id,
      household_id,
      preparation_recipe_requirement_id,
      recipe_ingredient_id,
      deviation_classification,
      expected_quantity_num,
      expected_quantity_den,
      actual_quantity_num,
      actual_quantity_den,
      measurement_unit_id,
      reason
    ) values (
      'e0000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000001',
      'd8000000-0000-4000-8000-000000000001',
      'TEST_MISMATCH',
      3,
      1,
      2,
      1,
      'd2000000-0000-4000-8000-000000000001',
      'expected must equal frozen requirement'
    );

    perform fridge_internal.assert_preparation_requirement_fulfillment(
      'd1000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000001'
    );
    raise exception 'falsified RecipeFulfillmentDeviation expected quantity unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.preparation_output (
  preparation_output_id,
  household_id,
  preparation_id,
  product_id,
  produced_quantity_num,
  produced_quantity_den,
  produced_unit_id
) values (
  'e1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000002',
  1,
  1,
  'd2000000-0000-4000-8000-000000000001'
);

insert into fridge.inventory_movement (
  inventory_movement_id,
  household_id,
  movement_kind,
  product_id,
  quantity_num,
  quantity_den,
  measurement_unit_id,
  occurred_at,
  placement_anchor_kind
) values (
  'e2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'TEST_PREPARATION_OUTPUT',
  'd4000000-0000-4000-8000-000000000002',
  1,
  1,
  'd2000000-0000-4000-8000-000000000001',
  '2026-02-03T09:00:00Z',
  'UNPLACED'
);

insert into fridge.preparation_output_movement (
  preparation_output_movement_id,
  household_id,
  preparation_output_id,
  product_id,
  inventory_movement_id,
  quantity_num,
  quantity_den,
  measurement_unit_id
) values (
  'e3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000002',
  'e2000000-0000-4000-8000-000000000001',
  1,
  1,
  'd2000000-0000-4000-8000-000000000001'
);

select fridge_internal.assert_preparation_output_movements(
  'd1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001'
);

-- Output materialization cannot use a stock-decreasing movement.
do $$
begin
  begin
    insert into fridge.preparation_output (
      preparation_output_id,
      household_id,
      preparation_id,
      product_id,
      produced_quantity_num,
      produced_quantity_den,
      produced_unit_id
    ) values (
      'e1000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000001',
      'd9000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000002',
      1,
      1,
      'd2000000-0000-4000-8000-000000000001'
    );

    insert into fridge.inventory_movement (
      inventory_movement_id,
      household_id,
      movement_kind,
      product_id,
      quantity_num,
      quantity_den,
      measurement_unit_id,
      occurred_at,
      placement_anchor_kind
    ) values (
      'e2000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000001',
      'TEST_WRONG_OUTPUT_SIGN',
      'd4000000-0000-4000-8000-000000000002',
      -1,
      1,
      'd2000000-0000-4000-8000-000000000001',
      '2026-02-03T09:00:00Z',
      'UNPLACED'
    );

    insert into fridge.preparation_output_movement (
      preparation_output_movement_id,
      household_id,
      preparation_output_id,
      product_id,
      inventory_movement_id,
      quantity_num,
      quantity_den,
      measurement_unit_id
    ) values (
      'e3000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000002',
      'd4000000-0000-4000-8000-000000000002',
      'e2000000-0000-4000-8000-000000000002',
      1,
      1,
      'd2000000-0000-4000-8000-000000000001'
    );

    perform fridge_internal.assert_preparation_output_movements(
      'd1000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000002'
    );
    raise exception 'negative PreparationOutput movement unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Parent rows themselves are guarded, preventing incomplete committed executions.
do $$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from pg_catalog.pg_trigger
   where tgname in (
     'preparation_input_parent_conservation_ct',
     'preparation_requirement_parent_conservation_ct',
     'preparation_output_parent_conservation_ct',
     'preparation_input_movement_unit_alignment_ct',
     'preparation_output_movement_unit_alignment_ct'
   )
     and tgconstraint <> 0
     and tgdeferrable
     and tginitdeferred;

  if v_count <> 5 then
    raise exception 'expected five deferred Preparation parent/unit guards, found %', v_count;
  end if;
end;
$$;

rollback;
