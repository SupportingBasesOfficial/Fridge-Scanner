-- FridgeScanner DB-02 integrity checks for 000006__procurement_receiving.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('41000000-0000-4000-8000-000000000001', 'Procurement household A'),
  ('41000000-0000-4000-8000-000000000002', 'Procurement household B');

insert into fridge.currency (currency_code, display_name)
values
  ('BRL', 'Brazilian Real'),
  ('USD', 'US Dollar');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('PROC_COUNT_TEST', 'Procurement count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  symbol,
  display_name
) values (
  '42000000-0000-4000-8000-000000000001',
  'PROC_UNIT_TEST',
  'PROC_COUNT_TEST',
  'u',
  'Procurement unit'
);

insert into fridge.product (
  product_id,
  catalog_scope,
  canonical_name
) values
  ('43000000-0000-4000-8000-000000000001', 'GLOBAL', 'Requested product'),
  ('43000000-0000-4000-8000-000000000002', 'GLOBAL', 'Substitute product');

insert into fridge.purchase (
  purchase_id,
  household_id,
  transaction_currency_code,
  source_identity,
  occurred_at
) values (
  '44000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'BRL',
  'purchase-test-1',
  '2026-01-10T12:00:00Z'
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
  '45000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  2,
  1,
  '42000000-0000-4000-8000-000000000001'
);

-- Purchased quantity must be positive and canonically normalized.
do $$
begin
  begin
    insert into fridge.purchase_item (
      purchase_item_id,
      household_id,
      purchase_id,
      product_id,
      purchased_quantity_num,
      purchased_quantity_den,
      purchased_unit_id
    ) values (
      '45000000-0000-4000-8000-000000000002',
      '41000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000001',
      2,
      2,
      '42000000-0000-4000-8000-000000000001'
    );

    raise exception 'non-normalized purchased quantity unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- PurchaseItem Household must equal its Purchase Household.
do $$
begin
  begin
    insert into fridge.purchase_item (
      purchase_item_id,
      household_id,
      purchase_id,
      product_id,
      purchased_quantity_num,
      purchased_quantity_den,
      purchased_unit_id
    ) values (
      '45000000-0000-4000-8000-000000000003',
      '41000000-0000-4000-8000-000000000002',
      '44000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000001',
      1,
      1,
      '42000000-0000-4000-8000-000000000001'
    );

    raise exception 'cross-household PurchaseItem unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Monetary facts are exact numeric values and must use the Purchase transaction currency.
insert into fridge.purchase_money_fact (
  purchase_money_fact_id,
  household_id,
  purchase_id,
  semantic_role,
  amount,
  currency_code,
  is_source_fact
) values (
  '46000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  'SOURCE_TOTAL_TEST',
  19.99,
  'BRL',
  true
);

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
      is_source_fact
    ) values (
      '46000000-0000-4000-8000-000000000002',
      '41000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000001',
      'WRONG_CURRENCY_TEST',
      19.99,
      'USD',
      true
    );

    raise exception 'Purchase money fact with a different transaction currency unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.purchase_item_money_fact (
  purchase_item_money_fact_id,
  household_id,
  purchase_id,
  purchase_item_id,
  semantic_role,
  amount,
  currency_code,
  is_source_fact
) values (
  '47000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000001',
  'LINE_NET_TEST',
  19.99,
  'BRL',
  true
);

insert into fridge.receipt (
  receipt_id,
  household_id,
  purchase_id,
  source_identity,
  occurred_at
) values (
  '48000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  'receipt-test-1',
  '2026-01-10T13:00:00Z'
);

-- Receipt without Purchase provenance remains valid.
insert into fridge.receipt (
  receipt_id,
  household_id,
  occurred_at
) values (
  '48000000-0000-4000-8000-000000000002',
  '41000000-0000-4000-8000-000000000001',
  '2026-01-11T13:00:00Z'
);

-- A Receipt cannot claim another Household's Purchase.
do $$
begin
  begin
    insert into fridge.receipt (
      receipt_id,
      household_id,
      purchase_id,
      occurred_at
    ) values (
      '48000000-0000-4000-8000-000000000003',
      '41000000-0000-4000-8000-000000000002',
      '44000000-0000-4000-8000-000000000001',
      '2026-01-10T13:00:00Z'
    );

    raise exception 'cross-household Receipt/Purchase provenance unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

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
    '49000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000001',
    2,
    1,
    '42000000-0000-4000-8000-000000000001'
  ),
  (
    '49000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000002',
    1,
    1,
    '42000000-0000-4000-8000-000000000001'
  );

-- Ordinary receiving allocation structurally requires Product equality.
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
  '4a000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  1,
  1,
  '42000000-0000-4000-8000-000000000001'
);

do $$
begin
  begin
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
      '4a000000-0000-4000-8000-000000000002',
      '41000000-0000-4000-8000-000000000001',
      '45000000-0000-4000-8000-000000000001',
      '49000000-0000-4000-8000-000000000002',
      '43000000-0000-4000-8000-000000000001',
      1,
      1,
      '42000000-0000-4000-8000-000000000001'
    );

    raise exception 'ordinary allocation across different Products unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Different-Product receiving uses the explicit substitution pool.
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
  '4b000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000002',
  1,
  1,
  '42000000-0000-4000-8000-000000000001',
  'approved substitution test'
);

-- Substitution cannot disguise same-Product ordinary fulfillment.
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
      '4b000000-0000-4000-8000-000000000002',
      '41000000-0000-4000-8000-000000000001',
      '45000000-0000-4000-8000-000000000001',
      '49000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000001',
      1,
      1,
      '42000000-0000-4000-8000-000000000001',
      'invalid same-product substitution'
    );

    raise exception 'same-Product substitution unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Allocation quantities also require canonical positive rationals.
do $$
begin
  begin
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
      '4a000000-0000-4000-8000-000000000003',
      '41000000-0000-4000-8000-000000000001',
      '45000000-0000-4000-8000-000000000001',
      '49000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000001',
      2,
      2,
      '42000000-0000-4000-8000-000000000001'
    );

    raise exception 'non-normalized receiving allocation unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Over-receipt is represented explicitly rather than silently treated as ordinary fulfillment.
insert into fridge.purchase_receiving_exception (
  purchase_receiving_exception_id,
  household_id,
  purchase_item_id,
  receipt_item_id,
  discrepant_quantity_num,
  discrepant_quantity_den,
  discrepant_unit_id,
  exception_kind,
  resolution_status,
  reason
) values (
  '4c000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000001',
  1,
  2,
  '42000000-0000-4000-8000-000000000001',
  'OVER_RECEIPT_TEST',
  'OPEN_TEST',
  'explicit discrepancy test'
);

rollback;
