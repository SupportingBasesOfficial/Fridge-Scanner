-- FridgeScanner DB-02 integrity checks for 000007_02__procurement_money_guards.sql

begin;

insert into fridge.household (household_id, display_name)
values ('67000000-0000-4000-8000-000000000001', 'Money guard household');

insert into fridge.currency (currency_code, display_name)
values
  ('BRL', 'Brazilian Real'),
  ('USD', 'US Dollar');

insert into fridge.money_rounding_policy (
  money_rounding_policy_id,
  policy_family_id,
  version_no,
  currency_code,
  decimal_scale,
  rounding_algorithm_code,
  rounding_algorithm_version,
  effective_from
) values (
  '68000000-0000-4000-8000-000000000001',
  '68000000-0000-4000-8000-000000000010',
  1,
  'USD',
  2,
  'HALF_UP_TEST',
  '1',
  '2026-01-01T00:00:00Z'
);

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('MONEY_GUARD_COUNT_TEST', 'Money guard count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  '69000000-0000-4000-8000-000000000001',
  'MONEY_GUARD_UNIT_TEST',
  'MONEY_GUARD_COUNT_TEST',
  'Money guard unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values (
  '6a000000-0000-4000-8000-000000000001',
  'GLOBAL',
  'Money guard product'
);

insert into fridge.purchase (
  purchase_id,
  household_id,
  transaction_currency_code,
  occurred_at
) values (
  '6b000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-000000000001',
  'BRL',
  '2026-01-20T12:00:00Z'
);

insert into fridge.purchase_item (
  purchase_item_id,
  household_id,
  purchase_id,
  product_id,
  purchased_quantity_num,
  purchased_quantity_den,
  purchased_unit_id
) values (
  '6c000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-000000000001',
  '6b000000-0000-4000-8000-000000000001',
  '6a000000-0000-4000-8000-000000000001',
  1,
  1,
  '69000000-0000-4000-8000-000000000001'
);

-- Purchase-level BRL fact cannot pin a USD rounding policy.
do $$
begin
  begin
    insert into fridge.purchase_money_fact (
      purchase_money_fact_id,
      household_id,
      purchase_id,
      semantic_role,
      amount,
      currency_code,
      is_source_fact,
      money_rounding_policy_id
    ) values (
      '6d000000-0000-4000-8000-000000000001',
      '67000000-0000-4000-8000-000000000001',
      '6b000000-0000-4000-8000-000000000001',
      'LINE_TOTAL_TEST',
      10.00,
      'BRL',
      false,
      '68000000-0000-4000-8000-000000000001'
    );

    raise exception 'BRL purchase money fact unexpectedly accepted USD rounding policy';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Line-level BRL fact cannot pin a USD rounding policy.
do $$
begin
  begin
    insert into fridge.purchase_item_money_fact (
      purchase_item_money_fact_id,
      household_id,
      purchase_id,
      purchase_item_id,
      semantic_role,
      amount,
      currency_code,
      is_source_fact,
      money_rounding_policy_id
    ) values (
      '6e000000-0000-4000-8000-000000000001',
      '67000000-0000-4000-8000-000000000001',
      '6b000000-0000-4000-8000-000000000001',
      '6c000000-0000-4000-8000-000000000001',
      'LINE_GROSS_TEST',
      10.00,
      'BRL',
      false,
      '68000000-0000-4000-8000-000000000001'
    );

    raise exception 'BRL purchase item money fact unexpectedly accepted USD rounding policy';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Pricing discrepancy evidence is subject to the same currency pinning rule.
do $$
begin
  begin
    insert into fridge.purchase_item_pricing_discrepancy (
      purchase_item_pricing_discrepancy_id,
      household_id,
      purchase_id,
      purchase_item_id,
      source_amount,
      computed_amount,
      currency_code,
      money_rounding_policy_id,
      reason,
      resolution_status
    ) values (
      '6f000000-0000-4000-8000-000000000001',
      '67000000-0000-4000-8000-000000000001',
      '6b000000-0000-4000-8000-000000000001',
      '6c000000-0000-4000-8000-000000000001',
      10.00,
      9.99,
      'BRL',
      '68000000-0000-4000-8000-000000000001',
      'currency mismatch rejection test',
      'OPEN_TEST'
    );

    raise exception 'BRL pricing discrepancy unexpectedly accepted USD rounding policy';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

rollback;
