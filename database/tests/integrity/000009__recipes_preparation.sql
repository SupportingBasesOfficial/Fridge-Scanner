-- FridgeScanner DB-02 integrity checks for 000009__recipes_preparation.sql
-- and 000009_01__preparation_allocation_scope.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('81000000-0000-4000-8000-000000000001', 'Preparation household A'),
  ('81000000-0000-4000-8000-000000000002', 'Preparation household B');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('PREP_COUNT_TEST', 'Preparation count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  '82000000-0000-4000-8000-000000000001',
  'PREP_UNIT_TEST',
  'PREP_COUNT_TEST',
  'Preparation unit'
);

insert into fridge.ingredient_concept (
  ingredient_concept_id,
  catalog_scope,
  canonical_name
) values (
  '83000000-0000-4000-8000-000000000001',
  'GLOBAL',
  'Preparation ingredient concept'
);

insert into fridge.product (
  product_id,
  catalog_scope,
  canonical_name
) values
  ('84000000-0000-4000-8000-000000000001', 'GLOBAL', 'Preparation product A'),
  ('84000000-0000-4000-8000-000000000002', 'GLOBAL', 'Preparation product B');

insert into fridge.storage_location_kind (kind_code, display_name)
values ('PREP_STORAGE_TEST', 'Preparation storage test');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values (
  '85000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'PREP_STORAGE_TEST',
  'Preparation location A'
);

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  placement_anchor_kind,
  storage_location_id
) values (
  '86000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  'LOCATION',
  '85000000-0000-4000-8000-000000000001'
);

insert into fridge.recipe (
  recipe_id,
  catalog_scope,
  canonical_name,
  lifecycle_status
) values (
  '87000000-0000-4000-8000-000000000001',
  'GLOBAL',
  'Preparation recipe',
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
  '88000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  'GLOBAL',
  1,
  'TEST_PUBLISHED',
  '2026-01-25T09:00:00Z'
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
  '89000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  2,
  1,
  '82000000-0000-4000-8000-000000000001',
  'line-1',
  false
);

-- Required recipe quantities must remain exact positive rationals.
do $$
begin
  begin
    insert into fridge.recipe_ingredient (
      recipe_ingredient_id,
      recipe_version_id,
      ingredient_concept_id,
      required_quantity_num,
      required_quantity_den,
      required_unit_id,
      stable_line_key,
      is_optional
    ) values (
      '89000000-0000-4000-8000-000000000002',
      '88000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001',
      2,
      2,
      '82000000-0000-4000-8000-000000000001',
      'invalid-line',
      false
    );

    raise exception 'non-normalized RecipeIngredient quantity unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.preparation (
  preparation_id,
  household_id,
  recipe_version_id,
  lifecycle_status,
  occurred_at,
  scaling_quantity_num,
  scaling_quantity_den,
  scaling_unit_id,
  scaling_method_code
) values
  (
    '8a000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000001',
    'TEST_COMMITTED',
    '2026-01-25T10:00:00Z',
    1,
    1,
    '82000000-0000-4000-8000-000000000001',
    'TEST_SCALE'
  ),
  (
    '8a000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000001',
    'TEST_COMMITTED',
    '2026-01-25T11:00:00Z',
    1,
    1,
    '82000000-0000-4000-8000-000000000001',
    'TEST_SCALE'
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
) values
  (
    '8b000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '8a000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000001',
    '89000000-0000-4000-8000-000000000001',
    2,
    1,
    '82000000-0000-4000-8000-000000000001',
    'frozen scaling evidence A'
  ),
  (
    '8b000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    '8a000000-0000-4000-8000-000000000002',
    '88000000-0000-4000-8000-000000000001',
    '89000000-0000-4000-8000-000000000001',
    2,
    1,
    '82000000-0000-4000-8000-000000000001',
    'frozen scaling evidence B'
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
  '8c000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  2,
  1,
  '82000000-0000-4000-8000-000000000001'
);

-- Input Product must equal the source StockItem Product.
do $$
begin
  begin
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
      '8c000000-0000-4000-8000-000000000002',
      '81000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000002',
      1,
      1,
      '82000000-0000-4000-8000-000000000001'
    );

    raise exception 'PreparationInput with wrong StockItem Product unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.inventory_movement (
  inventory_movement_id,
  household_id,
  movement_kind,
  product_id,
  stock_item_id,
  quantity_num,
  quantity_den,
  measurement_unit_id,
  occurred_at
) values
  (
    '8d000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'PREPARATION_INPUT_TEST',
    '84000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    -2,
    1,
    '82000000-0000-4000-8000-000000000001',
    '2026-01-25T10:00:00Z'
  ),
  (
    '8d000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    'PREPARATION_OUTPUT_TEST',
    '84000000-0000-4000-8000-000000000002',
    1,
    1,
    '82000000-0000-4000-8000-000000000001',
    '2026-01-25T10:00:00Z'
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
  '8e000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  '8d000000-0000-4000-8000-000000000001',
  2,
  1,
  '82000000-0000-4000-8000-000000000001'
);

-- One ledger movement cannot satisfy two preparation inputs.
do $$
begin
  begin
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
      '8e000000-0000-4000-8000-000000000002',
      '81000000-0000-4000-8000-000000000001',
      '8c000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000001',
      '8d000000-0000-4000-8000-000000000001',
      1,
      1,
      '82000000-0000-4000-8000-000000000001'
    );

    raise exception 'PreparationInput movement reuse unexpectedly accepted';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

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
  '8f000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000001',
  2,
  1,
  '82000000-0000-4000-8000-000000000001'
);

-- Input and frozen requirement must belong to the same Preparation execution.
do $$
begin
  begin
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
      '8f000000-0000-4000-8000-000000000002',
      '81000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      '8c000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000002',
      '89000000-0000-4000-8000-000000000001',
      1,
      1,
      '82000000-0000-4000-8000-000000000001'
    );

    raise exception 'cross-Preparation input allocation unexpectedly accepted';
  exception
    when foreign_key_violation then
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
  '90000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000002',
  1,
  1,
  '82000000-0000-4000-8000-000000000001'
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
  '91000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000002',
  '8d000000-0000-4000-8000-000000000002',
  1,
  1,
  '82000000-0000-4000-8000-000000000001'
);

-- Output movement Product must match the PreparationOutput Product.
do $$
begin
  begin
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
      '91000000-0000-4000-8000-000000000002',
      '81000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000001',
      '8d000000-0000-4000-8000-000000000001',
      1,
      1,
      '82000000-0000-4000-8000-000000000001'
    );

    raise exception 'PreparationOutput movement with wrong Product unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

rollback;
