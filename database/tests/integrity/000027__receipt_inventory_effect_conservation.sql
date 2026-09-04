-- FridgeScanner DB-02 integrity checks for
-- 000027__receipt_inventory_effect_conservation.sql

begin;

insert into fridge.household (household_id, display_name)
values ('b1000000-1000-4000-8000-000000000001', 'Receipt effect household');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('RECEIPT_EFFECT_COUNT', 'Receipt effect count');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  'b2000000-1000-4000-8000-000000000001',
  'RECEIPT_EFFECT_EACH',
  'RECEIPT_EFFECT_COUNT',
  'Each'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values ('b3000000-1000-4000-8000-000000000001', 'GLOBAL', 'Receipt effect product');

insert into fridge.receipt (
  receipt_id,
  household_id,
  occurred_at
) values (
  'b4000000-1000-4000-8000-000000000001',
  'b1000000-1000-4000-8000-000000000001',
  '2026-02-06T10:00:00Z'
);

insert into fridge.receipt_item (
  receipt_item_id,
  household_id,
  receipt_id,
  product_id,
  received_quantity_num,
  received_quantity_den,
  received_unit_id
) values (
  'b5000000-1000-4000-8000-000000000001',
  'b1000000-1000-4000-8000-000000000001',
  'b4000000-1000-4000-8000-000000000001',
  'b3000000-1000-4000-8000-000000000001',
  2,
  1,
  'b2000000-1000-4000-8000-000000000001'
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
) values
  (
    'b6000000-1000-4000-8000-000000000001',
    'b1000000-1000-4000-8000-000000000001',
    'TEST_RECEIPT_EFFECT',
    'b3000000-1000-4000-8000-000000000001',
    1,
    1,
    'b2000000-1000-4000-8000-000000000001',
    '2026-02-06T10:00:00Z',
    'UNPLACED'
  ),
  (
    'b6000000-1000-4000-8000-000000000002',
    'b1000000-1000-4000-8000-000000000001',
    'TEST_RECEIPT_EFFECT',
    'b3000000-1000-4000-8000-000000000001',
    1,
    1,
    'b2000000-1000-4000-8000-000000000001',
    '2026-02-06T10:00:00Z',
    'UNPLACED'
  );

insert into fridge.receipt_item_inventory_effect (
  receipt_item_inventory_effect_id,
  household_id,
  receipt_item_id,
  inventory_movement_id,
  product_id,
  quantity_num,
  quantity_den,
  measurement_unit_id
) values
  (
    'b7000000-1000-4000-8000-000000000001',
    'b1000000-1000-4000-8000-000000000001',
    'b5000000-1000-4000-8000-000000000001',
    'b6000000-1000-4000-8000-000000000001',
    'b3000000-1000-4000-8000-000000000001',
    1,
    1,
    'b2000000-1000-4000-8000-000000000001'
  ),
  (
    'b7000000-1000-4000-8000-000000000002',
    'b1000000-1000-4000-8000-000000000001',
    'b5000000-1000-4000-8000-000000000001',
    'b6000000-1000-4000-8000-000000000002',
    'b3000000-1000-4000-8000-000000000001',
    1,
    1,
    'b2000000-1000-4000-8000-000000000001'
  );

select fridge_internal.assert_receipt_item_inventory_effects(
  'b1000000-1000-4000-8000-000000000001',
  'b5000000-1000-4000-8000-000000000001'
);

-- ReceiptItem with no inventory effects is incomplete.
do $$
begin
  begin
    insert into fridge.receipt_item (
      receipt_item_id,
      household_id,
      receipt_id,
      product_id,
      received_quantity_num,
      received_quantity_den,
      received_unit_id
    ) values (
      'b5000000-1000-4000-8000-000000000002',
      'b1000000-1000-4000-8000-000000000001',
      'b4000000-1000-4000-8000-000000000001',
      'b3000000-1000-4000-8000-000000000001',
      1,
      1,
      'b2000000-1000-4000-8000-000000000001'
    );

    perform fridge_internal.assert_receipt_item_inventory_effects(
      'b1000000-1000-4000-8000-000000000001',
      'b5000000-1000-4000-8000-000000000002'
    );
    raise exception 'ReceiptItem without inventory materialization unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Stock-decreasing movement cannot materialize received stock.
do $$
begin
  begin
    insert into fridge.receipt_item (
      receipt_item_id,
      household_id,
      receipt_id,
      product_id,
      received_quantity_num,
      received_quantity_den,
      received_unit_id
    ) values (
      'b5000000-1000-4000-8000-000000000003',
      'b1000000-1000-4000-8000-000000000001',
      'b4000000-1000-4000-8000-000000000001',
      'b3000000-1000-4000-8000-000000000001',
      1,
      1,
      'b2000000-1000-4000-8000-000000000001'
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
      'b6000000-1000-4000-8000-000000000003',
      'b1000000-1000-4000-8000-000000000001',
      'TEST_BAD_RECEIPT_EFFECT',
      'b3000000-1000-4000-8000-000000000001',
      -1,
      1,
      'b2000000-1000-4000-8000-000000000001',
      '2026-02-06T10:00:00Z',
      'UNPLACED'
    );

    insert into fridge.receipt_item_inventory_effect (
      receipt_item_inventory_effect_id,
      household_id,
      receipt_item_id,
      inventory_movement_id,
      product_id,
      quantity_num,
      quantity_den,
      measurement_unit_id
    ) values (
      'b7000000-1000-4000-8000-000000000003',
      'b1000000-1000-4000-8000-000000000001',
      'b5000000-1000-4000-8000-000000000003',
      'b6000000-1000-4000-8000-000000000003',
      'b3000000-1000-4000-8000-000000000001',
      1,
      1,
      'b2000000-1000-4000-8000-000000000001'
    );

    perform fridge_internal.assert_receipt_item_inventory_effects(
      'b1000000-1000-4000-8000-000000000001',
      'b5000000-1000-4000-8000-000000000003'
    );
    raise exception 'negative ReceiptItem inventory movement unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Edge quantity must exactly equal the associated ledger increment.
do $$
begin
  begin
    insert into fridge.receipt_item (
      receipt_item_id,
      household_id,
      receipt_id,
      product_id,
      received_quantity_num,
      received_quantity_den,
      received_unit_id
    ) values (
      'b5000000-1000-4000-8000-000000000004',
      'b1000000-1000-4000-8000-000000000001',
      'b4000000-1000-4000-8000-000000000001',
      'b3000000-1000-4000-8000-000000000001',
      1,
      1,
      'b2000000-1000-4000-8000-000000000001'
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
      'b6000000-1000-4000-8000-000000000004',
      'b1000000-1000-4000-8000-000000000001',
      'TEST_BAD_RECEIPT_EFFECT',
      'b3000000-1000-4000-8000-000000000001',
      1,
      1,
      'b2000000-1000-4000-8000-000000000001',
      '2026-02-06T10:00:00Z',
      'UNPLACED'
    );

    insert into fridge.receipt_item_inventory_effect (
      receipt_item_inventory_effect_id,
      household_id,
      receipt_item_id,
      inventory_movement_id,
      product_id,
      quantity_num,
      quantity_den,
      measurement_unit_id
    ) values (
      'b7000000-1000-4000-8000-000000000004',
      'b1000000-1000-4000-8000-000000000001',
      'b5000000-1000-4000-8000-000000000004',
      'b6000000-1000-4000-8000-000000000004',
      'b3000000-1000-4000-8000-000000000001',
      1,
      2,
      'b2000000-1000-4000-8000-000000000001'
    );

    perform fridge_internal.assert_receipt_item_inventory_effects(
      'b1000000-1000-4000-8000-000000000001',
      'b5000000-1000-4000-8000-000000000004'
    );
    raise exception 'ReceiptItem inventory quantity mismatch unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Both parent and edge are deferred transaction-end guards.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_catalog.pg_trigger
   where tgname in (
     'receipt_item_parent_inventory_effects_ct',
     'receipt_item_inventory_effect_conservation_ct'
   )
     and tgconstraint <> 0
     and tgdeferrable
     and tginitdeferred;

  if v_count <> 2 then
    raise exception 'expected two deferred ReceiptItem inventory guards, found %', v_count;
  end if;
end;
$$;

rollback;
