-- FridgeScanner DB-02 integrity checks for 000028__catalog_scope_guards.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('d1000000-0000-4000-8000-000000000001', 'Catalog household A'),
  ('d1000000-0000-4000-8000-000000000002', 'Catalog household B');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('CAT_SCOPE_COUNT', 'Catalog scope count');

insert into fridge.measurement_unit (
  measurement_unit_id, unit_code, dimension_code, display_name
) values (
  'd2000000-0000-4000-8000-000000000001',
  'CAT_SCOPE_UNIT',
  'CAT_SCOPE_COUNT',
  'Catalog scope unit'
);

insert into fridge.storage_location_kind (kind_code, display_name)
values ('CAT_SCOPE_STORAGE', 'Catalog scope storage');

insert into fridge.storage_location (
  storage_location_id, household_id, kind_code, display_name
) values (
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'CAT_SCOPE_STORAGE',
  'Catalog scope location A'
);

insert into fridge.product (
  product_id, catalog_scope, owner_household_id, canonical_name
) values
  ('d4000000-0000-4000-8000-000000000001', 'GLOBAL', null, 'Global product'),
  ('d4000000-0000-4000-8000-000000000002', 'HOUSEHOLD', 'd1000000-0000-4000-8000-000000000001', 'Private A product'),
  ('d4000000-0000-4000-8000-000000000003', 'HOUSEHOLD', 'd1000000-0000-4000-8000-000000000002', 'Private B product');

insert into fridge.ingredient_concept (
  ingredient_concept_id, catalog_scope, owner_household_id, canonical_name
) values
  ('d5000000-0000-4000-8000-000000000001', 'GLOBAL', null, 'Global concept'),
  ('d5000000-0000-4000-8000-000000000002', 'HOUSEHOLD', 'd1000000-0000-4000-8000-000000000001', 'Private A concept'),
  ('d5000000-0000-4000-8000-000000000003', 'HOUSEHOLD', 'd1000000-0000-4000-8000-000000000002', 'Private B concept');

-- Fully GLOBAL compatibility mapping is valid.
insert into fridge.product_ingredient_compatibility (
  compatibility_mapping_id, mapping_family_id, version_no,
  catalog_scope, owner_household_id, product_id, ingredient_concept_id,
  effective_from
) values (
  'd6000000-0000-4000-8000-000000000001',
  'd6100000-0000-4000-8000-000000000001',
  1,
  'GLOBAL',
  null,
  'd4000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  '2026-01-01T00:00:00Z'
);
select fridge_internal.assert_compatibility_mapping_scope('d6000000-0000-4000-8000-000000000001');

-- Household mapping may combine GLOBAL and same-Household private endpoints.
insert into fridge.product_ingredient_compatibility (
  compatibility_mapping_id, mapping_family_id, version_no,
  catalog_scope, owner_household_id, product_id, ingredient_concept_id,
  effective_from
) values (
  'd6000000-0000-4000-8000-000000000002',
  'd6100000-0000-4000-8000-000000000002',
  1,
  'HOUSEHOLD',
  'd1000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  '2026-01-01T00:00:00Z'
);
select fridge_internal.assert_compatibility_mapping_scope('d6000000-0000-4000-8000-000000000002');

-- GLOBAL mapping cannot capture Household-private endpoint.
do $$
begin
  begin
    insert into fridge.product_ingredient_compatibility (
      compatibility_mapping_id, mapping_family_id, version_no,
      catalog_scope, owner_household_id, product_id, ingredient_concept_id,
      effective_from
    ) values (
      'd6000000-0000-4000-8000-000000000003',
      'd6100000-0000-4000-8000-000000000003',
      1,
      'GLOBAL',
      null,
      'd4000000-0000-4000-8000-000000000002',
      'd5000000-0000-4000-8000-000000000001',
      '2026-01-01T00:00:00Z'
    );
    perform fridge_internal.assert_compatibility_mapping_scope('d6000000-0000-4000-8000-000000000003');
    raise exception 'GLOBAL mapping to private Product unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Household A mapping cannot capture Household B private endpoint.
do $$
begin
  begin
    insert into fridge.product_ingredient_compatibility (
      compatibility_mapping_id, mapping_family_id, version_no,
      catalog_scope, owner_household_id, product_id, ingredient_concept_id,
      effective_from
    ) values (
      'd6000000-0000-4000-8000-000000000004',
      'd6100000-0000-4000-8000-000000000004',
      1,
      'HOUSEHOLD',
      'd1000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000003',
      '2026-01-01T00:00:00Z'
    );
    perform fridge_internal.assert_compatibility_mapping_scope('d6000000-0000-4000-8000-000000000004');
    raise exception 'Household A mapping to private B concept unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- GLOBAL compatibility evidence is valid only over the exact GLOBAL mapping endpoints.
insert into fridge.compatibility_decision_evidence (
  compatibility_evidence_id, household_id, product_id,
  ingredient_concept_id, compatibility_mapping_id, evaluation_anchor
) values (
  'd6200000-0000-4000-8000-000000000001',
  null,
  'd4000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  '2026-01-02T00:00:00Z'
);
select fridge_internal.assert_compatibility_evidence_scope('d6200000-0000-4000-8000-000000000001');

-- Evidence cannot rewrite the endpoints of its pinned mapping.
do $$
begin
  begin
    insert into fridge.compatibility_decision_evidence (
      compatibility_evidence_id, household_id, product_id,
      ingredient_concept_id, compatibility_mapping_id, evaluation_anchor
    ) values (
      'd6200000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000002',
      'd5000000-0000-4000-8000-000000000002',
      'd6000000-0000-4000-8000-000000000002',
      '2026-01-02T00:00:00Z'
    );
    perform fridge_internal.assert_compatibility_evidence_scope('d6200000-0000-4000-8000-000000000002');
    raise exception 'compatibility evidence endpoint rewrite unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

insert into fridge.recipe (
  recipe_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status
) values
  ('d7000000-0000-4000-8000-000000000001', 'GLOBAL', null, 'Global recipe', 'TEST_ACTIVE'),
  ('d7000000-0000-4000-8000-000000000002', 'HOUSEHOLD', 'd1000000-0000-4000-8000-000000000001', 'Private A recipe', 'TEST_ACTIVE'),
  ('d7000000-0000-4000-8000-000000000003', 'HOUSEHOLD', 'd1000000-0000-4000-8000-000000000002', 'Private B recipe', 'TEST_ACTIVE');

insert into fridge.recipe_version (
  recipe_version_id, recipe_id, catalog_scope, owner_household_id,
  version_no, lifecycle_status
) values
  ('d7100000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'GLOBAL', null, 1, 'TEST_ACTIVE'),
  ('d7100000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', 'HOUSEHOLD', 'd1000000-0000-4000-8000-000000000001', 1, 'TEST_ACTIVE'),
  ('d7100000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000003', 'HOUSEHOLD', 'd1000000-0000-4000-8000-000000000002', 1, 'TEST_ACTIVE');

select fridge_internal.assert_recipe_version_scope('d7100000-0000-4000-8000-000000000001');
select fridge_internal.assert_recipe_version_scope('d7100000-0000-4000-8000-000000000002');

-- RecipeVersion cannot claim a different scope/owner than Recipe.
do $$
begin
  begin
    insert into fridge.recipe_version (
      recipe_version_id, recipe_id, catalog_scope, owner_household_id,
      version_no, lifecycle_status
    ) values (
      'd7100000-0000-4000-8000-000000000004',
      'd7000000-0000-4000-8000-000000000001',
      'HOUSEHOLD',
      'd1000000-0000-4000-8000-000000000001',
      2,
      'TEST_ACTIVE'
    );
    perform fridge_internal.assert_recipe_version_scope('d7100000-0000-4000-8000-000000000004');
    raise exception 'RecipeVersion scope mismatch unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Global recipe line can use only global catalog endpoints.
insert into fridge.recipe_ingredient (
  recipe_ingredient_id, recipe_version_id, ingredient_concept_id,
  exact_product_id, required_quantity_num, required_quantity_den,
  required_unit_id, stable_line_key, is_optional
) values (
  'd7200000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  1, 1,
  'd2000000-0000-4000-8000-000000000001',
  'global-line',
  false
);
select fridge_internal.assert_recipe_ingredient_scope('d7200000-0000-4000-8000-000000000001');

-- Household recipe may use same-Household private catalog.
insert into fridge.recipe_ingredient (
  recipe_ingredient_id, recipe_version_id, ingredient_concept_id,
  exact_product_id, required_quantity_num, required_quantity_den,
  required_unit_id, stable_line_key, is_optional
) values (
  'd7200000-0000-4000-8000-000000000002',
  'd7100000-0000-4000-8000-000000000002',
  'd5000000-0000-4000-8000-000000000002',
  'd4000000-0000-4000-8000-000000000002',
  1, 1,
  'd2000000-0000-4000-8000-000000000001',
  'private-a-line',
  false
);
select fridge_internal.assert_recipe_ingredient_scope('d7200000-0000-4000-8000-000000000002');

-- Household A recipe cannot use Household B private concept.
do $$
begin
  begin
    insert into fridge.recipe_ingredient (
      recipe_ingredient_id, recipe_version_id, ingredient_concept_id,
      required_quantity_num, required_quantity_den,
      required_unit_id, stable_line_key, is_optional
    ) values (
      'd7200000-0000-4000-8000-000000000003',
      'd7100000-0000-4000-8000-000000000002',
      'd5000000-0000-4000-8000-000000000003',
      1, 1,
      'd2000000-0000-4000-8000-000000000001',
      'invalid-b-line',
      false
    );
    perform fridge_internal.assert_recipe_ingredient_scope('d7200000-0000-4000-8000-000000000003');
    raise exception 'Household A RecipeIngredient using private B concept unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Household A Preparation may use GLOBAL or private-A RecipeVersion, never private-B.
insert into fridge.preparation (
  preparation_id, household_id, recipe_version_id, lifecycle_status, occurred_at
) values (
  'd7300000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001',
  'TEST',
  '2026-01-03T00:00:00Z'
);
select fridge_internal.assert_preparation_recipe_visibility('d1000000-0000-4000-8000-000000000001','d7300000-0000-4000-8000-000000000001');

do $$
begin
  begin
    insert into fridge.preparation (
      preparation_id, household_id, recipe_version_id, lifecycle_status, occurred_at
    ) values (
      'd7300000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000001',
      'd7100000-0000-4000-8000-000000000003',
      'TEST',
      '2026-01-03T00:00:00Z'
    );
    perform fridge_internal.assert_preparation_recipe_visibility('d1000000-0000-4000-8000-000000000001','d7300000-0000-4000-8000-000000000002');
    raise exception 'Preparation using another Household private RecipeVersion unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Shelf-life rule target follows the same catalog scope contract.
insert into fridge.shelf_life_rule (
  shelf_life_rule_id, rule_family_id, version_no,
  catalog_scope, owner_household_id, target_product_id,
  trigger_code, deadline_group_code, duration_num, duration_den,
  duration_unit, temporal_basis, endpoint_semantics,
  effective_from, lifecycle_status
) values (
  'd8000000-0000-4000-8000-000000000001',
  'd8100000-0000-4000-8000-000000000001',
  1,
  'HOUSEHOLD',
  'd1000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000002',
  'TEST_TRIGGER', 'TEST_DEADLINE', 1, 1, 'DAY', 'ELAPSED', 'TEST_ENDPOINT',
  '2026-01-01T00:00:00Z', 'TEST_ACTIVE'
);
select fridge_internal.assert_shelf_life_rule_scope('d8000000-0000-4000-8000-000000000001');

do $$
begin
  begin
    insert into fridge.shelf_life_rule (
      shelf_life_rule_id, rule_family_id, version_no,
      catalog_scope, owner_household_id, target_product_id,
      trigger_code, deadline_group_code, duration_num, duration_den,
      duration_unit, temporal_basis, endpoint_semantics,
      effective_from, lifecycle_status
    ) values (
      'd8000000-0000-4000-8000-000000000002',
      'd8100000-0000-4000-8000-000000000002',
      1,
      'GLOBAL', null,
      'd4000000-0000-4000-8000-000000000002',
      'TEST_TRIGGER', 'TEST_DEADLINE', 1, 1, 'DAY', 'ELAPSED', 'TEST_ENDPOINT',
      '2026-01-01T00:00:00Z', 'TEST_ACTIVE'
    );
    perform fridge_internal.assert_shelf_life_rule_scope('d8000000-0000-4000-8000-000000000002');
    raise exception 'GLOBAL ShelfLifeRule targeting private Product unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Concept-target GLOBAL rule + GLOBAL compatibility evidence can activate for Household stock.
insert into fridge.shelf_life_rule (
  shelf_life_rule_id, rule_family_id, version_no,
  catalog_scope, target_ingredient_concept_id,
  trigger_code, deadline_group_code, duration_num, duration_den,
  duration_unit, temporal_basis, endpoint_semantics,
  effective_from, lifecycle_status
) values (
  'd8000000-0000-4000-8000-000000000003',
  'd8100000-0000-4000-8000-000000000003',
  1,
  'GLOBAL',
  'd5000000-0000-4000-8000-000000000001',
  'TEST_TRIGGER', 'TEST_DEADLINE', 1, 1, 'DAY', 'ELAPSED', 'TEST_ENDPOINT',
  '2026-01-01T00:00:00Z', 'TEST_ACTIVE'
);
select fridge_internal.assert_shelf_life_rule_scope('d8000000-0000-4000-8000-000000000003');

insert into fridge.stock_item (
  stock_item_id, household_id, product_id,
  placement_anchor_kind, storage_location_id
) values (
  'd8200000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'LOCATION',
  'd3000000-0000-4000-8000-000000000001'
);

insert into fridge.shelf_life_rule_activation (
  shelf_life_rule_activation_id, household_id, shelf_life_rule_id,
  stock_item_id, product_id, activation_anchor,
  compatibility_evidence_id, evaluation_context_version, provenance
) values (
  'd8300000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000003',
  'd8200000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  '2026-01-04T00:00:00Z',
  'd6200000-0000-4000-8000-000000000001',
  'test-v1',
  'global evidence reuse test'
);
select fridge_internal.assert_shelf_life_activation_scope('d1000000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000001');

-- Product-target activation cannot use the wrong stock Product.
do $$
begin
  begin
    insert into fridge.shelf_life_rule_activation (
      shelf_life_rule_activation_id, household_id, shelf_life_rule_id,
      stock_item_id, product_id, activation_anchor,
      evaluation_context_version, provenance
    ) values (
      'd8300000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000001',
      'd8000000-0000-4000-8000-000000000001',
      'd8200000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      '2026-01-04T00:00:00Z',
      'test-v1',
      'wrong target test'
    );
    perform fridge_internal.assert_shelf_life_activation_scope('d1000000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000002');
    raise exception 'ShelfLifeRuleActivation with wrong Product target unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Guard triggers are constraint triggers and deferred to transaction end.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from pg_catalog.pg_trigger
   where tgname in (
     'compatibility_mapping_scope_guard',
     'compatibility_evidence_scope_guard',
     'recipe_version_scope_guard',
     'recipe_ingredient_scope_guard',
     'preparation_recipe_visibility_guard',
     'shelf_life_rule_scope_guard',
     'shelf_life_activation_scope_guard'
   )
     and (not tgconstraint <> 0 or not tgdeferrable or not tginitdeferred);

  if v_bad <> 0 then
    raise exception 'one or more catalog scope guards are not deferred constraint triggers';
  end if;
end;
$$;

rollback;
