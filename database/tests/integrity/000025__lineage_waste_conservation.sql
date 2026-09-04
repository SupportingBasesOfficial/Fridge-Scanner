-- FridgeScanner DB-02 integrity checks for
-- 000025__lineage_waste_conservation.sql

begin;

insert into fridge.household (household_id, display_name)
values ('f1000000-0000-4000-8000-000000000001', 'Lineage waste household');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('LINEAGE_COUNT_TEST', 'Lineage count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  'f2000000-0000-4000-8000-000000000001',
  'LINEAGE_UNIT_TEST',
  'LINEAGE_COUNT_TEST',
  'Lineage unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values ('f3000000-0000-4000-8000-000000000001', 'GLOBAL', 'Lineage product');

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  placement_anchor_kind
) values
  (
    'f4000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'UNPLACED'
  ),
  (
    'f4000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'UNPLACED'
  ),
  (
    'f4000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'UNPLACED'
  );

insert into fridge.inventory_movement (
  inventory_movement_id,
  household_id,
  movement_kind,
  product_id,
  stock_item_id,
  quantity_num,
  quantity_den,
  measurement_unit_id,
  occurred_at,
  placement_anchor_kind
) values
  (
    'f5000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'TEST_SPLIT_SOURCE',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    -2,
    1,
    'f2000000-0000-4000-8000-000000000001',
    '2026-02-04T10:00:00Z',
    'UNPLACED'
  ),
  (
    'f5000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'TEST_SPLIT_DESTINATION',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000002',
    1,
    1,
    'f2000000-0000-4000-8000-000000000001',
    '2026-02-04T10:00:00Z',
    'UNPLACED'
  ),
  (
    'f5000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000001',
    'TEST_SPLIT_DESTINATION',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000003',
    1,
    1,
    'f2000000-0000-4000-8000-000000000001',
    '2026-02-04T10:00:00Z',
    'UNPLACED'
  );

insert into fridge.inventory_quantity_lineage (
  inventory_quantity_lineage_id,
  household_id,
  source_inventory_movement_id,
  destination_inventory_movement_id,
  source_stock_item_id,
  destination_stock_item_id,
  product_id,
  quantity_num,
  quantity_den,
  measurement_unit_id,
  lineage_operation_code,
  causation_identity
) values
  (
    'f6000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000002',
    'f4000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000002',
    'f3000000-0000-4000-8000-000000000001',
    1,
    1,
    'f2000000-0000-4000-8000-000000000001',
    'TEST_SPLIT',
    'split-1'
  ),
  (
    'f6000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000003',
    'f4000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000003',
    'f3000000-0000-4000-8000-000000000001',
    1,
    1,
    'f2000000-0000-4000-8000-000000000001',
    'TEST_SPLIT',
    'split-1'
  );

select fridge_internal.assert_inventory_lineage_movement(
  'f1000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  'SOURCE'
);
select fridge_internal.assert_inventory_lineage_movement(
  'f1000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000002',
  'DESTINATION'
);
select fridge_internal.assert_inventory_lineage_movement(
  'f1000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000003',
  'DESTINATION'
);

-- A third outgoing edge would over-consume the source movement.
do $$
begin
  begin
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
      'f5000000-0000-4000-8000-000000000004',
      'f1000000-0000-4000-8000-000000000001',
      'TEST_EXTRA_DESTINATION',
      'f3000000-0000-4000-8000-000000000001',
      1,
      2,
      'f2000000-0000-4000-8000-000000000001',
      '2026-02-04T10:00:00Z',
      'UNPLACED'
    );

    insert into fridge.inventory_quantity_lineage (
      inventory_quantity_lineage_id,
      household_id,
      source_inventory_movement_id,
      destination_inventory_movement_id,
      product_id,
      quantity_num,
      quantity_den,
      measurement_unit_id,
      lineage_operation_code,
      causation_identity
    ) values (
      'f6000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      'f5000000-0000-4000-8000-000000000001',
      'f5000000-0000-4000-8000-000000000004',
      'f3000000-0000-4000-8000-000000000001',
      1,
      2,
      'f2000000-0000-4000-8000-000000000001',
      'TEST_SPLIT',
      'split-overage'
    );

    perform fridge_internal.assert_inventory_lineage_movement(
      'f1000000-0000-4000-8000-000000000001',
      'f5000000-0000-4000-8000-000000000001',
      'SOURCE'
    );
    raise exception 'lineage source over-consumption unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Destination must be stock-increasing.
do $$
begin
  begin
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
        'f5000000-0000-4000-8000-000000000005',
        'f1000000-0000-4000-8000-000000000001',
        'TEST_BAD_SOURCE',
        'f3000000-0000-4000-8000-000000000001',
        -1,
        1,
        'f2000000-0000-4000-8000-000000000001',
        '2026-02-04T11:00:00Z',
        'UNPLACED'
      ),
      (
        'f5000000-0000-4000-8000-000000000006',
        'f1000000-0000-4000-8000-000000000001',
        'TEST_BAD_DESTINATION',
        'f3000000-0000-4000-8000-000000000001',
        -1,
        1,
        'f2000000-0000-4000-8000-000000000001',
        '2026-02-04T11:00:00Z',
        'UNPLACED'
      );

    insert into fridge.inventory_quantity_lineage (
      inventory_quantity_lineage_id,
      household_id,
      source_inventory_movement_id,
      destination_inventory_movement_id,
      product_id,
      quantity_num,
      quantity_den,
      measurement_unit_id,
      lineage_operation_code,
      causation_identity
    ) values (
      'f6000000-0000-4000-8000-000000000004',
      'f1000000-0000-4000-8000-000000000001',
      'f5000000-0000-4000-8000-000000000005',
      'f5000000-0000-4000-8000-000000000006',
      'f3000000-0000-4000-8000-000000000001',
      1,
      1,
      'f2000000-0000-4000-8000-000000000001',
      'TEST_BAD_DESTINATION',
      'bad-destination'
    );

    perform fridge_internal.assert_inventory_lineage_movement(
      'f1000000-0000-4000-8000-000000000001',
      'f5000000-0000-4000-8000-000000000006',
      'DESTINATION'
    );
    raise exception 'negative lineage destination unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.waste_record (
  waste_record_id,
  household_id,
  occurred_at,
  waste_classification,
  reason
) values (
  'f7000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  '2026-02-04T12:00:00Z',
  'TEST_WASTE',
  'valid waste'
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
  'f8000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'TEST_WASTE',
  'f3000000-0000-4000-8000-000000000001',
  -1,
  1,
  'f2000000-0000-4000-8000-000000000001',
  '2026-02-04T12:00:00Z',
  'UNPLACED'
);

insert into fridge.waste_record_movement (
  waste_record_movement_id,
  household_id,
  waste_record_id,
  inventory_movement_id,
  quantity_num,
  quantity_den,
  measurement_unit_id
) values (
  'f9000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001',
  1,
  1,
  'f2000000-0000-4000-8000-000000000001'
);

select fridge_internal.assert_waste_record(
  'f1000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000001'
);

-- WasteRecord without any movement cannot be committed.
do $$
begin
  begin
    insert into fridge.waste_record (
      waste_record_id,
      household_id,
      occurred_at,
      waste_classification,
      reason
    ) values (
      'f7000000-0000-4000-8000-000000000002',
      'f1000000-0000-4000-8000-000000000001',
      '2026-02-04T12:00:00Z',
      'TEST_WASTE',
      'missing movement'
    );

    perform fridge_internal.assert_waste_record(
      'f1000000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000002'
    );
    raise exception 'WasteRecord without movement unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Waste movement must be stock-decreasing and exact.
do $$
begin
  begin
    insert into fridge.waste_record (
      waste_record_id,
      household_id,
      occurred_at,
      waste_classification,
      reason
    ) values (
      'f7000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      '2026-02-04T13:00:00Z',
      'TEST_WASTE',
      'positive movement'
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
      'f8000000-0000-4000-8000-000000000002',
      'f1000000-0000-4000-8000-000000000001',
      'TEST_BAD_WASTE',
      'f3000000-0000-4000-8000-000000000001',
      1,
      1,
      'f2000000-0000-4000-8000-000000000001',
      '2026-02-04T13:00:00Z',
      'UNPLACED'
    );

    insert into fridge.waste_record_movement (
      waste_record_movement_id,
      household_id,
      waste_record_id,
      inventory_movement_id,
      quantity_num,
      quantity_den,
      measurement_unit_id
    ) values (
      'f9000000-0000-4000-8000-000000000002',
      'f1000000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000003',
      'f8000000-0000-4000-8000-000000000002',
      1,
      1,
      'f2000000-0000-4000-8000-000000000001'
    );

    perform fridge_internal.assert_waste_record(
      'f1000000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000003'
    );
    raise exception 'positive Waste movement unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Exact edge quantity must equal the ledger decrement.
do $$
begin
  begin
    insert into fridge.waste_record (
      waste_record_id,
      household_id,
      occurred_at,
      waste_classification,
      reason
    ) values (
      'f7000000-0000-4000-8000-000000000004',
      'f1000000-0000-4000-8000-000000000001',
      '2026-02-04T14:00:00Z',
      'TEST_WASTE',
      'quantity mismatch'
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
      'f8000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      'TEST_BAD_WASTE',
      'f3000000-0000-4000-8000-000000000001',
      -1,
      1,
      'f2000000-0000-4000-8000-000000000001',
      '2026-02-04T14:00:00Z',
      'UNPLACED'
    );

    insert into fridge.waste_record_movement (
      waste_record_movement_id,
      household_id,
      waste_record_id,
      inventory_movement_id,
      quantity_num,
      quantity_den,
      measurement_unit_id
    ) values (
      'f9000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000004',
      'f8000000-0000-4000-8000-000000000003',
      1,
      2,
      'f2000000-0000-4000-8000-000000000001'
    );

    perform fridge_internal.assert_waste_record(
      'f1000000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000004'
    );
    raise exception 'Waste quantity mismatch unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Lineage and Waste guards are deferred transaction-end postconditions.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_catalog.pg_trigger
   where tgname in (
     'inventory_lineage_conservation_ct',
     'waste_record_parent_conservation_ct',
     'waste_record_movement_conservation_ct'
   )
     and tgconstraint <> 0
     and tgdeferrable
     and tginitdeferred;

  if v_count <> 3 then
    raise exception 'expected three deferred lineage/waste guards, found %', v_count;
  end if;
end;
$$;

rollback;
