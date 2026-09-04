-- FridgeScanner DB-02 integrity checks for 000010_01__shelf_life_timezone_contract.sql

begin;

insert into fridge.product (product_id, catalog_scope, canonical_name)
values ('ae000000-0000-4000-8000-000000000001', 'GLOBAL', 'Timezone contract product');

-- LOCAL_CALENDAR must declare how timezone is selected.
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
      'af000000-0000-4000-8000-000000000001',
      'af000000-0000-4000-8000-000000000010',
      1,
      'GLOBAL',
      'ae000000-0000-4000-8000-000000000001',
      'OPEN_TEST',
      'EXPIRY_TEST',
      1,
      1,
      'DAY',
      'LOCAL_CALENDAR',
      'TEST_ENDPOINT',
      '2026-01-01T00:00:00Z',
      'TEST_ACTIVE'
    );

    raise exception 'LOCAL_CALENDAR rule without timezone-selection contract unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- ELAPSED semantics are timezone-independent and cannot carry a competing timezone policy.
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
      'af000000-0000-4000-8000-000000000002',
      'af000000-0000-4000-8000-000000000020',
      1,
      'GLOBAL',
      'ae000000-0000-4000-8000-000000000001',
      'OPEN_TEST',
      'EXPIRY_TEST',
      24,
      1,
      'HOUR',
      'ELAPSED',
      'TEST_ENDPOINT',
      'HOUSEHOLD_VERSION_TEST',
      '2026-01-01T00:00:00Z',
      'TEST_ACTIVE'
    );

    raise exception 'ELAPSED rule with timezone-selection semantics unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

rollback;
