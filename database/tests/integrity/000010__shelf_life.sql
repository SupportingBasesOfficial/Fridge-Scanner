-- FridgeScanner DB-02 integrity checks for 000010__shelf_life.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('a1000000-0000-4000-8000-000000000001', 'Shelf household A'),
  ('a1000000-0000-4000-8000-000000000002', 'Shelf household B');

insert into fridge.household_timezone_version (
  household_timezone_version_id,
  household_id,
  version_no,
  iana_timezone,
  effective_from
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    1,
    'America/Sao_Paulo',
    '2026-01-01T00:00:00Z'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    1,
    'UTC',
    '2026-01-01T00:00:00Z'
  );

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('SHELF_COUNT_TEST', 'Shelf count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  'a3000000-0000-4000-8000-000000000001',
  'SHELF_UNIT_TEST',
  'SHELF_COUNT_TEST',
  'Shelf unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values
  ('a4000000-0000-4000-8000-000000000001', 'GLOBAL', 'Shelf product A'),
  ('a4000000-0000-4000-8000-000000000002', 'GLOBAL', 'Shelf product B');

insert into fridge.ingredient_concept (
  ingredient_concept_id,
  catalog_scope,
  canonical_name
) values (
  'a5000000-0000-4000-8000-000000000001',
  'GLOBAL',
  'Shelf concept'
);

insert into fridge.storage_location_kind (kind_code, display_name)
values ('SHELF_STORAGE_TEST', 'Shelf storage test');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'SHELF_STORAGE_TEST',
  'Shelf location A'
);

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  placement_anchor_kind,
  storage_location_id
) values
  (
    'a7000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'LOCATION',
    'a6000000-0000-4000-8000-000000000001'
  ),
  (
    'a7000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000002',
    'LOCATION',
    'a6000000-0000-4000-8000-000000000001'
  );

insert into fridge.source_expiration_fact (
  source_expiration_fact_id,
  household_id,
  stock_item_id,
  product_id,
  expiration_precision,
  source_expiration_date,
  household_timezone_version_id,
  observed_at,
  provenance
) values (
  'a8000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'DATE',
  '2026-02-01',
  'a2000000-0000-4000-8000-000000000001',
  '2026-01-25T12:00:00Z',
  'source date test'
);

-- DATE and INSTANT representations are mutually exclusive.
do $$
begin
  begin
    insert into fridge.source_expiration_fact (
      source_expiration_fact_id,
      household_id,
      stock_item_id,
      product_id,
      expiration_precision,
      source_expiration_date,
      source_expiration_instant,
      observed_at,
      provenance
    ) values (
      'a8000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000001',
      'a4000000-0000-4000-8000-000000000001',
      'DATE',
      '2026-02-01',
      '2026-02-01T00:00:00Z',
      '2026-01-25T12:01:00Z',
      'invalid dual precision'
    );

    raise exception 'dual DATE/INSTANT source expiration unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Historical timezone evidence cannot cross Household scope.
do $$
begin
  begin
    insert into fridge.source_expiration_fact (
      source_expiration_fact_id,
      household_id,
      stock_item_id,
      product_id,
      expiration_precision,
      source_expiration_date,
      household_timezone_version_id,
      observed_at,
      provenance
    ) values (
      'a8000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000001',
      'a4000000-0000-4000-8000-000000000001',
      'DATE',
      '2026-02-01',
      'a2000000-0000-4000-8000-000000000002',
      '2026-01-25T12:02:00Z',
      'wrong household timezone test'
    );

    raise exception 'cross-Household expiration timezone unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- ShelfLifeRule has exactly one typed applicability target.
do $$
begin
  begin
    insert into fridge.shelf_life_rule (
      shelf_life_rule_id,
      rule_family_id,
      version_no,
      catalog_scope,
      target_product_id,
      target_ingredient_concept_id,
      trigger_code,
      deadline_group_code,
      duration_num,
      duration_den,
      duration_unit,
      temporal_basis,
      endpoint_semantics,
      effective_from,
      lifecycle_status
    ) values (
      'a9000000-0000-4000-8000-000000000001',
      'a9000000-0000-4000-8000-000000000010',
      1,
      'GLOBAL',
      'a4000000-0000-4000-8000-000000000001',
      'a5000000-0000-4000-8000-000000000001',
      'OPEN_TEST',
      'EXPIRY_TEST',
      1,
      1,
      'DAY',
      'ELAPSED',
      'TEST_ENDPOINT',
      '2026-01-01T00:00:00Z',
      'TEST_ACTIVE'
    );

    raise exception 'ShelfLifeRule with two targets unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- ELAPSED semantics cannot use calendar MONTH/YEAR.
do $$
begin
  begin
    insert into fridge.shelf_life_rule (
      shelf_life_rule_id,
      rule_family_id,
      version_no,
      catalog_scope,
      target_product_id,
      trigger_code,
      deadline_group_code,
      duration_num,
      duration_den,
      duration_unit,
      temporal_basis,
      endpoint_semantics,
      effective_from,
      lifecycle_status
    ) values (
      'a9000000-0000-4000-8000-000000000002',
      'a9000000-0000-4000-8000-000000000020',
      1,
      'GLOBAL',
      'a4000000-0000-4000-8000-000000000001',
      'OPEN_TEST',
      'EXPIRY_TEST',
      1,
      1,
      'MONTH',
      'ELAPSED',
      'TEST_ENDPOINT',
      '2026-01-01T00:00:00Z',
      'TEST_ACTIVE'
    );

    raise exception 'ELAPSED month duration unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- LOCAL_CALENDAR duration must be integral.
do $$
begin
  begin
    insert into fridge.shelf_life_rule (
      shelf_life_rule_id,
      rule_family_id,
      version_no,
      catalog_scope,
      target_product_id,
      trigger_code,
      deadline_group_code,
      duration_num,
      duration_den,
      duration_unit,
      temporal_basis,
      endpoint_semantics,
      timezone_selection_code,
      effective_from,
      lifecycle_status
    ) values (
      'a9000000-0000-4000-8000-000000000003',
      'a9000000-0000-4000-8000-000000000030',
      1,
      'GLOBAL',
      'a4000000-0000-4000-8000-000000000001',
      'OPEN_TEST',
      'EXPIRY_TEST',
      3,
      2,
      'DAY',
      'LOCAL_CALENDAR',
      'TEST_ENDPOINT',
      'HOUSEHOLD_VERSION_TEST',
      '2026-01-01T00:00:00Z',
      'TEST_ACTIVE'
    );

    raise exception 'fractional LOCAL_CALENDAR duration unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.shelf_life_rule (
  shelf_life_rule_id,
  rule_family_id,
  version_no,
  catalog_scope,
  target_product_id,
  trigger_code,
  deadline_group_code,
  duration_num,
  duration_den,
  duration_unit,
  temporal_basis,
  endpoint_semantics,
  effective_from,
  lifecycle_status
) values (
  'a9000000-0000-4000-8000-000000000004',
  'a9000000-0000-4000-8000-000000000040',
  1,
  'GLOBAL',
  'a4000000-0000-4000-8000-000000000001',
  'OPEN_TEST',
  'EXPIRY_TEST',
  48,
  1,
  'HOUR',
  'ELAPSED',
  'TEST_ENDPOINT',
  '2026-01-01T00:00:00Z',
  'TEST_ACTIVE'
);

insert into fridge.food_lifecycle_event (
  food_lifecycle_event_id,
  household_id,
  stock_item_id,
  product_id,
  event_kind,
  occurred_at,
  provenance
) values (
  'aa000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'OPEN_TEST',
  '2026-01-25T13:00:00Z',
  'lifecycle event test'
);

insert into fridge.shelf_life_rule_activation (
  shelf_life_rule_activation_id,
  household_id,
  shelf_life_rule_id,
  stock_item_id,
  product_id,
  activation_anchor,
  food_lifecycle_event_id,
  evaluation_context_version,
  provenance
) values (
  'ab000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000004',
  'a7000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  '2026-01-25T13:00:00Z',
  'aa000000-0000-4000-8000-000000000001',
  '1',
  'activation test'
);

-- Lifecycle event used by activation must belong to the same StockItem.
do $$
begin
  begin
    insert into fridge.shelf_life_rule_activation (
      shelf_life_rule_activation_id,
      household_id,
      shelf_life_rule_id,
      stock_item_id,
      product_id,
      activation_anchor,
      food_lifecycle_event_id,
      evaluation_context_version,
      provenance
    ) values (
      'ab000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000001',
      'a9000000-0000-4000-8000-000000000004',
      'a7000000-0000-4000-8000-000000000002',
      'a4000000-0000-4000-8000-000000000002',
      '2026-01-25T13:00:00Z',
      'aa000000-0000-4000-8000-000000000001',
      '1',
      'wrong stock activation test'
    );

    raise exception 'activation with lifecycle event from another StockItem unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.effective_expiration (
  effective_expiration_id,
  household_id,
  stock_item_id,
  product_id,
  derivation_contract_code,
  derivation_contract_version,
  expiration_precision,
  effective_expiration_date,
  projection_status,
  is_current,
  recomputation_provenance
) values (
  'ac000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'EARLIEST_APPLICABLE_TEST',
  '1',
  'DATE',
  '2026-02-01',
  'TEST_CURRENT',
  true,
  'projection test'
);

insert into fridge.effective_expiration_candidate (
  effective_expiration_candidate_id,
  household_id,
  effective_expiration_id,
  stock_item_id,
  source_expiration_fact_id,
  expiration_precision,
  candidate_expiration_date,
  candidate_outcome,
  outcome_reason
) values (
  'ad000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'a8000000-0000-4000-8000-000000000001',
  'DATE',
  '2026-02-01',
  'TEST_SELECTED',
  'earliest source test'
);

-- Candidate cannot import expiration evidence from another StockItem.
do $$
begin
  begin
    insert into fridge.effective_expiration_candidate (
      effective_expiration_candidate_id,
      household_id,
      effective_expiration_id,
      stock_item_id,
      shelf_life_rule_activation_id,
      expiration_precision,
      candidate_expiration_instant,
      candidate_outcome,
      outcome_reason
    ) values (
      'ad000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000001',
      'ac000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000002',
      'ab000000-0000-4000-8000-000000000001',
      'INSTANT',
      '2026-01-27T13:00:00Z',
      'TEST_SELECTED',
      'wrong stock candidate test'
    );

    raise exception 'EffectiveExpiration candidate for another StockItem unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

rollback;
