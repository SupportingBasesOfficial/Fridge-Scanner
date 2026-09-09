-- FridgeScanner DB-02 integrity checks for
-- 000070_02__late_source_pricing_reconciliation.sql

begin;

do $$
declare
  v_trigger text;
begin
  if has_function_privilege(
    'fridge_app',
    'fridge_internal.reconcile_late_source_line_gross()',
    'EXECUTE'
  ) then
    raise exception 'runtime may directly execute late pricing reconciliation helper';
  end if;

  select pg_get_functiondef(
    'fridge_internal.reconcile_late_source_line_gross()'::regprocedure
  ) into v_trigger;

  if position("new.semantic_role <> 'LINE_GROSS'" in v_trigger) = 0
     or position('not mf.is_source_fact' in v_trigger) = 0
     or position('SOURCE_LINE_GROSS_MISMATCH' in v_trigger) = 0
     or position('new.purchase_item_money_fact_id' in v_trigger) = 0 then
    raise exception 'late pricing reconciliation helper lacks required arrival-order semantics';
  end if;
end;
$$;

insert into fridge.household (household_id, display_name)
values ('c7700001-0b06-4770-8770-000000000001', 'BE06 late reconciliation household');

insert into fridge.currency (currency_code, display_name)
values ('LRX', 'BE06 late reconciliation currency');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('BE06_LATE_DIM', 'BE06 late dimension');

insert into fridge.measurement_unit (
  measurement_unit_id, unit_code, dimension_code, display_name
) values (
  'c7700002-0b06-4770-8770-000000000002',
  'BE06_LATE_UNIT',
  'BE06_LATE_DIM',
  'BE06 late unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
values (
  'c7700003-0b06-4770-8770-000000000003',
  'GLOBAL',
  'BE06 late reconciliation product',
  'ACTIVE'
);

insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at)
values (
  'c7700004-0b06-4770-8770-000000000004',
  'c7700001-0b06-4770-8770-000000000001',
  'LRX',
  '2026-09-09T12:00:00Z'
);

insert into fridge.money_rounding_policy (
  money_rounding_policy_id, policy_family_id, version_no, currency_code,
  decimal_scale, rounding_algorithm_code, rounding_algorithm_version,
  effective_from, lifecycle_status
) values (
  'c7700005-0b06-4770-8770-000000000005',
  'c7700006-0b06-4770-8770-000000000006',
  1,
  'LRX',
  2,
  'DECIMAL_HALF_AWAY_FROM_ZERO',
  '1',
  '2026-09-01T00:00:00Z',
  'ACTIVE'
);

insert into fridge.purchase_item (
  purchase_item_id, household_id, purchase_id, product_id,
  purchased_quantity_num, purchased_quantity_den, purchased_unit_id,
  pricing_basis_quantity_num, pricing_basis_quantity_den, pricing_basis_unit_id
) values
  (
    'c7700007-0b06-4770-8770-000000000007',
    'c7700001-0b06-4770-8770-000000000001',
    'c7700004-0b06-4770-8770-000000000004',
    'c7700003-0b06-4770-8770-000000000003',
    1, 1, 'c7700002-0b06-4770-8770-000000000002',
    1, 1, 'c7700002-0b06-4770-8770-000000000002'
  ),
  (
    'c7700008-0b06-4770-8770-000000000008',
    'c7700001-0b06-4770-8770-000000000001',
    'c7700004-0b06-4770-8770-000000000004',
    'c7700003-0b06-4770-8770-000000000003',
    1, 1, 'c7700002-0b06-4770-8770-000000000002',
    1, 1, 'c7700002-0b06-4770-8770-000000000002'
  );

-- Computed gross exists first.
insert into fridge.purchase_item_money_fact (
  purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
  semantic_role, amount, currency_code, is_source_fact,
  money_rounding_policy_id, provenance
) values
  (
    'c7700009-0b06-4770-8770-000000000009',
    'c7700001-0b06-4770-8770-000000000001',
    'c7700004-0b06-4770-8770-000000000004',
    'c7700007-0b06-4770-8770-000000000007',
    'LINE_GROSS', 10.00, 'LRX', false,
    'c7700005-0b06-4770-8770-000000000005', 'computed mismatch'
  ),
  (
    'c7700010-0b06-4770-8770-000000000010',
    'c7700001-0b06-4770-8770-000000000001',
    'c7700004-0b06-4770-8770-000000000004',
    'c7700008-0b06-4770-8770-000000000008',
    'LINE_GROSS', 20.00, 'LRX', false,
    'c7700005-0b06-4770-8770-000000000005', 'computed match'
  );

-- Late mismatching source must atomically create discrepancy using source fact identity.
insert into fridge.purchase_item_money_fact (
  purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
  semantic_role, amount, currency_code, is_source_fact,
  money_rounding_policy_id, provenance
) values (
  'c7700011-0b06-4770-8770-000000000011',
  'c7700001-0b06-4770-8770-000000000001',
  'c7700004-0b06-4770-8770-000000000004',
  'c7700007-0b06-4770-8770-000000000007',
  'LINE_GROSS', 10.01, 'LRX', true, null, 'late source mismatch'
);

-- Late matching source must preserve both facts without discrepancy.
insert into fridge.purchase_item_money_fact (
  purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
  semantic_role, amount, currency_code, is_source_fact,
  money_rounding_policy_id, provenance
) values (
  'c7700012-0b06-4770-8770-000000000012',
  'c7700001-0b06-4770-8770-000000000001',
  'c7700004-0b06-4770-8770-000000000004',
  'c7700008-0b06-4770-8770-000000000008',
  'LINE_GROSS', 20.00, 'LRX', true, null, 'late source match'
);

do $$
declare
  v_source numeric;
  v_computed numeric;
  v_reason text;
  v_status text;
  v_count integer;
begin
  select d.source_amount, d.computed_amount, d.reason, d.resolution_status
    into v_source, v_computed, v_reason, v_status
    from fridge.purchase_item_pricing_discrepancy d
   where d.household_id = 'c7700001-0b06-4770-8770-000000000001'
     and d.purchase_item_pricing_discrepancy_id = 'c7700011-0b06-4770-8770-000000000011';

  if v_source is distinct from 10.01
     or v_computed is distinct from 10.00
     or v_reason is distinct from 'SOURCE_LINE_GROSS_MISMATCH'
     or v_status is distinct from 'OPEN' then
    raise exception 'late mismatching source did not create exact discrepancy evidence';
  end if;

  select count(*)::integer
    into v_count
    from fridge.purchase_item_pricing_discrepancy d
   where d.household_id = 'c7700001-0b06-4770-8770-000000000001'
     and d.purchase_item_id = 'c7700008-0b06-4770-8770-000000000008';
  if v_count <> 0 then
    raise exception 'late matching source unexpectedly created discrepancy';
  end if;
end;
$$;

rollback;
