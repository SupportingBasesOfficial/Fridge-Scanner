-- FridgeScanner DB-02 integrity checks for
-- 000022__procurement_shopping_conservation.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('c1000000-0000-4000-8000-000000000001', 'Conservation household A'),
  ('c1000000-0000-4000-8000-000000000002', 'Conservation household B');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('CONSERVATION_COUNT', 'Conservation count');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values
  (
    'c2000000-0000-4000-8000-000000000001',
    'CONSERVATION_EACH',
    'CONSERVATION_COUNT',
    'Each'
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    'CONSERVATION_PAIR',
    'CONSERVATION_COUNT',
    'Pair'
  );

insert into fridge.measurement_conversion_rule (
  measurement_conversion_rule_id,
  rule_family_id,
  version_no,
  conversion_kind,
  source_unit_id,
  target_unit_id,
  factor_num,
  factor_den,
  effective_from
) values (
  'c2100000-0000-4000-8000-000000000001',
  'c2110000-0000-4000-8000-000000000001',
  1,
  'EXACT_FACTOR',
  'c2000000-0000-4000-8000-000000000002',
  'c2000000-0000-4000-8000-000000000001',
  2,
  1,
  '2026-01-01T00:00:00Z'
);

insert into fridge.measurement_conversion_evidence (
  measurement_conversion_evidence_id,
  household_id,
  measurement_conversion_rule_id,
  source_unit_id,
  source_quantity_num,
  source_quantity_den,
  target_unit_id,
  target_quantity_num,
  target_quantity_den,
  applied_factor_num,
  applied_factor_den,
  evaluation_anchor
) values
  (
    'c2200000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'c2100000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000002',
    1,
    1,
    'c2000000-0000-4000-8000-000000000001',
    2,
    1,
    2,
    1,
    '2026-02-01T00:00:00Z'
  ),
  (
    'c2200000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    'c2100000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000002',
    1,
    1,
    'c2000000-0000-4000-8000-000000000001',
    2,
    1,
    2,
    1,
    '2026-02-01T00:00:00Z'
  );

-- Same-unit quantity needs no evidence.
do $$
declare
  v_row record;
begin
  select *
    into v_row
    from fridge_internal.quantity_in_target_unit(
      'c1000000-0000-4000-8000-000000000001',
      1,
      3,
      'c2000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      null
    );

  if v_row.quantity_num <> 1 or v_row.quantity_den <> 3 then
    raise exception 'same-unit exact quantity changed unexpectedly';
  end if;
end;
$$;

-- Cross-unit quantity cannot be guessed without pinned evidence.
do $$
begin
  begin
    perform *
      from fridge_internal.quantity_in_target_unit(
        'c1000000-0000-4000-8000-000000000001',
        1,
        1,
        'c2000000-0000-4000-8000-000000000002',
        'c2000000-0000-4000-8000-000000000001',
        null
      );
    raise exception 'cross-unit quantity unexpectedly accepted without evidence';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Evidence must describe the exact source quantity, not only the unit pair.
do $$
begin
  begin
    perform *
      from fridge_internal.quantity_in_target_unit(
        'c1000000-0000-4000-8000-000000000001',
        1,
        2,
        'c2000000-0000-4000-8000-000000000002',
        'c2000000-0000-4000-8000-000000000001',
        'c2200000-0000-4000-8000-000000000001'
      );
    raise exception 'mismatched conversion evidence quantity unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Household-scoped conversion evidence cannot cross tenant boundaries.
do $$
begin
  begin
    perform *
      from fridge_internal.quantity_in_target_unit(
        'c1000000-0000-4000-8000-000000000001',
        1,
        1,
        'c2000000-0000-4000-8000-000000000002',
        'c2000000-0000-4000-8000-000000000001',
        'c2200000-0000-4000-8000-000000000002'
      );
    raise exception 'cross-Household conversion evidence unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.product (product_id, catalog_scope, canonical_name)
values
  ('c3000000-0000-4000-8000-000000000001', 'GLOBAL', 'Conservation product A'),
  ('c3000000-0000-4000-8000-000000000002', 'GLOBAL', 'Conservation product B');

insert into fridge.currency (currency_code, display_name)
values ('TST', 'Test Currency');

insert into fridge.purchase (
  purchase_id,
  household_id,
  transaction_currency_code,
  occurred_at
) values (
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'TST',
  '2026-02-02T10:00:00Z'
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
  'c5000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  2,
  1,
  'c2000000-0000-4000-8000-000000000001'
);

insert into fridge.receipt (
  receipt_id,
  household_id,
  purchase_id,
  occurred_at
) values (
  'c6000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  '2026-02-02T11:00:00Z'
);

insert into fridge.receipt_item (
  receipt_item_id,
  household_id,
  receipt_id,
  product_id,
  received_quantity_num,
  received_quantity_den,
  received_unit_id
) values
  (
    'c7000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    2,
    1,
    'c2000000-0000-4000-8000-000000000001'
  ),
  (
    'c7000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    1,
    1,
    'c2000000-0000-4000-8000-000000000001'
  );

-- Exact 1/3 + 2/3 ordinary receiving is valid and consumes exactly one unit.
insert into fridge.purchase_item_receipt_allocation (
  purchase_item_receipt_allocation_id,
  household_id,
  purchase_item_id,
  receipt_item_id,
  product_id,
  allocated_quantity_num,
  allocated_quantity_den,
  allocation_unit_id
) values
  (
    'c8000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    1,
    3,
    'c2000000-0000-4000-8000-000000000001'
  );

-- The pair uniqueness means the second fraction uses a second physical ReceiptItem.
insert into fridge.receipt_item (
  receipt_item_id,
  household_id,
  receipt_id,
  product_id,
  received_quantity_num,
  received_quantity_den,
  received_unit_id
) values (
  'c7000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  'c6000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  2,
  3,
  'c2000000-0000-4000-8000-000000000001'
);

insert into fridge.purchase_item_receipt_allocation (
  purchase_item_receipt_allocation_id,
  household_id,
  purchase_item_id,
  receipt_item_id,
  product_id,
  allocated_quantity_num,
  allocated_quantity_den,
  allocation_unit_id
) values (
  'c8000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000003',
  'c3000000-0000-4000-8000-000000000001',
  2,
  3,
  'c2000000-0000-4000-8000-000000000001'
);

select fridge_internal.assert_purchase_receiving_pool(
  'c1000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001'
);

-- Ordinary + substitution share the same PurchaseItem receiving allowance.
do $$
begin
  begin
    insert into fridge.purchase_item_substitution_allocation (
      purchase_item_substitution_allocation_id,
      household_id,
      purchase_item_id,
      receipt_item_id,
      requested_product_id,
      received_product_id,
      substituted_quantity_num,
      substituted_quantity_den,
      allocation_unit_id,
      reason
    ) values (
      'c9000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000001',
      'c7000000-0000-4000-8000-000000000002',
      'c3000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000002',
      2,
      1,
      'c2000000-0000-4000-8000-000000000001',
      'test substitution'
    );

    perform fridge_internal.assert_purchase_receiving_pool(
      'c1000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000001'
    );

    raise exception 'receiving PurchaseItem over-allocation unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- ReceiptItem physical quantity is independently capped.
do $$
begin
  begin
    insert into fridge.purchase_item_substitution_allocation (
      purchase_item_substitution_allocation_id,
      household_id,
      purchase_item_id,
      receipt_item_id,
      requested_product_id,
      received_product_id,
      substituted_quantity_num,
      substituted_quantity_den,
      allocation_unit_id,
      reason
    ) values (
      'c9000000-0000-4000-8000-000000000002',
      'c1000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000001',
      'c7000000-0000-4000-8000-000000000002',
      'c3000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000002',
      2,
      1,
      'c2000000-0000-4000-8000-000000000001',
      'test substitution'
    );

    perform fridge_internal.assert_receipt_item_allocation_pool(
      'c1000000-0000-4000-8000-000000000001',
      'c7000000-0000-4000-8000-000000000002'
    );

    raise exception 'ReceiptItem physical over-allocation unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.shopping_list (
  shopping_list_id,
  household_id,
  lifecycle_status
) values (
  'ca000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'TEST_OPEN'
);

insert into fridge.shopping_list_item (
  shopping_list_item_id,
  household_id,
  shopping_list_id,
  requested_product_id,
  requested_quantity_num,
  requested_quantity_den,
  requested_unit_id,
  lifecycle_status
) values
  (
    'cb000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    2,
    1,
    'c2000000-0000-4000-8000-000000000001',
    'TEST_OPEN'
  ),
  (
    'cb000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    1,
    1,
    'c2000000-0000-4000-8000-000000000001',
    'TEST_OPEN'
  );

-- Shopping pool is independent from receiving: a fully received PurchaseItem
-- may still fulfill shopping intent up to the purchased quantity.
insert into fridge.shopping_list_fulfillment (
  shopping_list_fulfillment_id,
  household_id,
  shopping_list_item_id,
  purchase_item_id,
  purchase_product_id,
  allocated_quantity_num,
  allocated_quantity_den,
  allocation_unit_id,
  provenance
) values (
  'cc000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'cb000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  2,
  1,
  'c2000000-0000-4000-8000-000000000001',
  'independent shopping pool'
);

select fridge_internal.assert_shopping_purchase_pool(
  'c1000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001'
);

-- A second shopping allocation would exceed the independent shopping pool.
do $$
begin
  begin
    insert into fridge.shopping_list_fulfillment (
      shopping_list_fulfillment_id,
      household_id,
      shopping_list_item_id,
      purchase_item_id,
      purchase_product_id,
      allocated_quantity_num,
      allocated_quantity_den,
      allocation_unit_id
    ) values (
      'cc000000-0000-4000-8000-000000000002',
      'c1000000-0000-4000-8000-000000000001',
      'cb000000-0000-4000-8000-000000000002',
      'c5000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      1,
      3,
      'c2000000-0000-4000-8000-000000000001'
    );

    perform fridge_internal.assert_shopping_purchase_pool(
      'c1000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000001'
    );

    raise exception 'shopping PurchaseItem over-allocation unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- One pair converts exactly to two EACH and therefore exactly consumes a
-- two-EACH PurchaseItem allowance.
insert into fridge.purchase_item (
  purchase_item_id,
  household_id,
  purchase_id,
  product_id,
  purchased_quantity_num,
  purchased_quantity_den,
  purchased_unit_id
) values (
  'c5000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  2,
  1,
  'c2000000-0000-4000-8000-000000000001'
);

insert into fridge.shopping_list_item (
  shopping_list_item_id,
  household_id,
  shopping_list_id,
  requested_product_id,
  requested_quantity_num,
  requested_quantity_den,
  requested_unit_id,
  lifecycle_status
) values (
  'cb000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  'ca000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  1,
  1,
  'c2000000-0000-4000-8000-000000000002',
  'TEST_OPEN'
);

insert into fridge.shopping_list_fulfillment (
  shopping_list_fulfillment_id,
  household_id,
  shopping_list_item_id,
  purchase_item_id,
  purchase_product_id,
  allocated_quantity_num,
  allocated_quantity_den,
  allocation_unit_id,
  conversion_evidence_id
) values (
  'cc000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  'cb000000-0000-4000-8000-000000000003',
  'c5000000-0000-4000-8000-000000000002',
  'c3000000-0000-4000-8000-000000000001',
  1,
  1,
  'c2000000-0000-4000-8000-000000000002',
  'c2200000-0000-4000-8000-000000000001'
);

select fridge_internal.assert_shopping_purchase_pool(
  'c1000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000002'
);

-- Guards are true deferred constraint triggers, not advisory comments.
do $$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from pg_catalog.pg_trigger
   where tgname in (
     'ordinary_receiving_conservation_ct',
     'substitution_receiving_conservation_ct',
     'shopping_purchase_conservation_ct'
   )
     and tgconstraint <> 0
     and tgdeferrable
     and tginitdeferred;

  if v_count <> 3 then
    raise exception 'expected three deferred conservation constraint triggers, found %', v_count;
  end if;
end;
$$;

rollback;
