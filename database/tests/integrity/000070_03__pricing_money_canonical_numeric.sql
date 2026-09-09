-- FridgeScanner DB-02 integrity checks for
-- 000070_03__pricing_money_canonical_numeric.sql

begin;

do $$
declare
  v_fact_guard text;
  v_discrepancy_guard text;
begin
  if has_function_privilege(
    'fridge_app',
    'fridge_internal.canonicalize_computed_line_gross()',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_app',
    'fridge_internal.canonicalize_pricing_discrepancy_money()',
    'EXECUTE'
  ) then
    raise exception 'runtime may directly execute pricing-money canonicalization helpers';
  end if;

  select pg_get_functiondef(
    'fridge_internal.canonicalize_computed_line_gross()'::regprocedure
  ) into v_fact_guard;
  select pg_get_functiondef(
    'fridge_internal.canonicalize_pricing_discrepancy_money()'::regprocedure
  ) into v_discrepancy_guard;

  if position('trim_scale(new.amount)' in v_fact_guard) = 0
     or position('trim_scale(new.source_amount)' in v_discrepancy_guard) = 0
     or position('trim_scale(new.computed_amount)' in v_discrepancy_guard) = 0 then
    raise exception 'pricing-money canonicalization does not use trim_scale at persistence boundary';
  end if;
end;
$$;

insert into fridge.household (household_id, display_name)
values ('c7900001-0b06-4790-8790-000000000001', 'BE06 canonical pricing money household');

insert into fridge.currency (currency_code, display_name)
values ('CMX', 'BE06 canonical pricing money currency');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('BE06_CANON_MONEY_DIM', 'BE06 canonical pricing money dimension');

insert into fridge.measurement_unit (
  measurement_unit_id, unit_code, dimension_code, display_name
) values (
  'c7900002-0b06-4790-8790-000000000002',
  'BE06_CANON_MONEY_UNIT',
  'BE06_CANON_MONEY_DIM',
  'BE06 canonical pricing money unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
values (
  'c7900003-0b06-4790-8790-000000000003',
  'GLOBAL',
  'BE06 canonical pricing money product',
  'ACTIVE'
);

insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at)
values (
  'c7900004-0b06-4790-8790-000000000004',
  'c7900001-0b06-4790-8790-000000000001',
  'CMX',
  '2026-09-09T12:00:00Z'
);

insert into fridge.money_rounding_policy (
  money_rounding_policy_id, policy_family_id, version_no, currency_code,
  decimal_scale, rounding_algorithm_code, rounding_algorithm_version,
  effective_from, lifecycle_status
) values (
  'c7900005-0b06-4790-8790-000000000005',
  'c7900006-0b06-4790-8790-000000000006',
  1, 'CMX', 2, 'DECIMAL_HALF_AWAY_FROM_ZERO', '1',
  '2026-09-01T00:00:00Z', 'ACTIVE'
);

insert into fridge.purchase_item (
  purchase_item_id, household_id, purchase_id, product_id,
  purchased_quantity_num, purchased_quantity_den, purchased_unit_id,
  pricing_basis_quantity_num, pricing_basis_quantity_den, pricing_basis_unit_id
) values (
  'c7900007-0b06-4790-8790-000000000007',
  'c7900001-0b06-4790-8790-000000000001',
  'c7900004-0b06-4790-8790-000000000004',
  'c7900003-0b06-4790-8790-000000000003',
  1, 1, 'c7900002-0b06-4790-8790-000000000002',
  1, 1, 'c7900002-0b06-4790-8790-000000000002'
);

insert into fridge.purchase_item_money_fact (
  purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
  semantic_role, amount, currency_code, is_source_fact,
  money_rounding_policy_id, provenance
) values (
  'c7900008-0b06-4790-8790-000000000008',
  'c7900001-0b06-4790-8790-000000000001',
  'c7900004-0b06-4790-8790-000000000004',
  'c7900007-0b06-4790-8790-000000000007',
  'LINE_GROSS', 20.0000000000000000, 'CMX', false,
  'c7900005-0b06-4790-8790-000000000005', 'computed canonical storage proof'
);

insert into fridge.purchase_item_pricing_discrepancy (
  purchase_item_pricing_discrepancy_id, household_id, purchase_id, purchase_item_id,
  source_amount, computed_amount, currency_code, money_rounding_policy_id,
  reason, resolution_status
) values (
  'c7900009-0b06-4790-8790-000000000009',
  'c7900001-0b06-4790-8790-000000000001',
  'c7900004-0b06-4790-8790-000000000004',
  'c7900007-0b06-4790-8790-000000000007',
  20.0100, 20.0000000000000000, 'CMX',
  'c7900005-0b06-4790-8790-000000000005',
  'SOURCE_LINE_GROSS_MISMATCH', 'OPEN'
);

do $$
declare
  v_fact text;
  v_source text;
  v_computed text;
begin
  select amount::text into v_fact
    from fridge.purchase_item_money_fact
   where purchase_item_money_fact_id = 'c7900008-0b06-4790-8790-000000000008';
  if v_fact is distinct from '20' then
    raise exception 'computed LINE_GROSS is not canonical: %', v_fact;
  end if;

  select source_amount::text, computed_amount::text
    into v_source, v_computed
    from fridge.purchase_item_pricing_discrepancy
   where purchase_item_pricing_discrepancy_id = 'c7900009-0b06-4790-8790-000000000009';
  if v_source is distinct from '20.01' or v_computed is distinct from '20' then
    raise exception 'pricing discrepancy amounts are not canonical: %, %', v_source, v_computed;
  end if;
end;
$$;

rollback;
