-- FridgeScanner DB-02 integrity checks for 000007__inventory_ledger.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('51000000-0000-4000-8000-000000000001', 'Ledger household A'),
  ('51000000-0000-4000-8000-000000000002', 'Ledger household B');

insert into fridge.currency (currency_code, display_name)
values ('BRL', 'Brazilian Real');

insert into fridge.storage_location_kind (kind_code, display_name)
values ('LEDGER_STORAGE_TEST', 'Ledger storage test');

insert into fridge.compartment_kind (kind_code, display_name)
values ('LEDGER_COMPARTMENT_TEST', 'Ledger compartment test');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values
  (
    '52000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    'LEDGER_STORAGE_TEST',
    'Location A'
  ),
  (
    '52000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000002',
    'LEDGER_STORAGE_TEST',
    'Location B'
  );

insert into fridge.compartment (
  compartment_id,
  household_id,
  storage_location_id,
  kind_code,
  display_name
) values (
  '53000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  'LEDGER_COMPARTMENT_TEST',
  'Compartment A'
);

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('LEDGER_COUNT_TEST', 'Ledger count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  symbol,
  display_name
) values (
  '54000000-0000-4000-8000-000000000001',
  'LEDGER_UNIT_TEST',
  'LEDGER_COUNT_TEST',
  'u',
  'Ledger unit'
);

insert into fridge.product (
  product_id,
  catalog_scope,
  canonical_name
) values
  ('55000000-0000-4000-8000-000000000001', 'GLOBAL', 'Ledger product A'),
  ('55000000-0000-4000-8000-000000000002', 'GLOBAL', 'Ledger product B');

insert into fridge.batch (
  batch_id,
  product_id,
  commercial_lot_code
) values (
  '56000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  'LOT-A'
);

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  batch_id,
  placement_anchor_kind,
  storage_location_id
) values (
  '57000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001',
  'LOCATION',
  '52000000-0000-4000-8000-000000000001'
);

-- Batch and StockItem Product identity must agree.
do $$
begin
  begin
    insert into fridge.stock_item (
      stock_item_id,
      household_id,
      product_id,
      batch_id,
      placement_anchor_kind
    ) values (
      '57000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000002',
      '56000000-0000-4000-8000-000000000001',
      'UNPLACED'
    );

    raise exception 'StockItem with Batch from another Product unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Current placement is an exact XOR and cannot carry competing location truth.
do $$
begin
  begin
    insert into fridge.stock_item (
      stock_item_id,
      household_id,
      product_id,
      placement_anchor_kind,
      storage_location_id,
      compartment_id
    ) values (
      '57000000-0000-4000-8000-000000000003',
      '51000000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001',
      'COMPARTMENT',
      '52000000-0000-4000-8000-000000000001',
      '53000000-0000-4000-8000-000000000001'
    );

    raise exception 'StockItem with competing location and compartment anchors unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Placement cannot cross Household boundaries.
do $$
begin
  begin
    insert into fridge.stock_item (
      stock_item_id,
      household_id,
      product_id,
      placement_anchor_kind,
      storage_location_id
    ) values (
      '57000000-0000-4000-8000-000000000004',
      '51000000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001',
      'LOCATION',
      '52000000-0000-4000-8000-000000000002'
    );

    raise exception 'cross-household StockItem placement unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  placement_anchor_kind,
  compartment_id
) values (
  '57000000-0000-4000-8000-000000000005',
  '51000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  'COMPARTMENT',
  '53000000-0000-4000-8000-000000000001'
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
  placement_anchor_kind,
  storage_location_id
) values (
  '58000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'ENTRY_TEST',
  '55000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  2,
  1,
  '54000000-0000-4000-8000-000000000001',
  '2026-01-12T10:00:00Z',
  'LOCATION',
  '52000000-0000-4000-8000-000000000001'
);

-- Movement Product must agree with StockItem Product.
do $$
begin
  begin
    insert into fridge.inventory_movement (
      inventory_movement_id,
      household_id,
      movement_kind,
      product_id,
      stock_item_id,
      quantity_num,
      quantity_den,
      measurement_unit_id,
      occurred_at
    ) values (
      '58000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',
      'INVALID_PRODUCT_TEST',
      '55000000-0000-4000-8000-000000000002',
      '57000000-0000-4000-8000-000000000001',
      1,
      1,
      '54000000-0000-4000-8000-000000000001',
      '2026-01-12T10:01:00Z'
    );

    raise exception 'InventoryMovement with wrong StockItem Product unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Zero and non-normalized movement quantities are forbidden.
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
      occurred_at
    ) values (
      '58000000-0000-4000-8000-000000000003',
      '51000000-0000-4000-8000-000000000001',
      'ZERO_TEST',
      '55000000-0000-4000-8000-000000000001',
      0,
      1,
      '54000000-0000-4000-8000-000000000001',
      '2026-01-12T10:02:00Z'
    );

    raise exception 'zero InventoryMovement unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;

  begin
    insert into fridge.inventory_movement (
      inventory_movement_id,
      household_id,
      movement_kind,
      product_id,
      quantity_num,
      quantity_den,
      measurement_unit_id,
      occurred_at
    ) values (
      '58000000-0000-4000-8000-000000000004',
      '51000000-0000-4000-8000-000000000001',
      'NON_NORMALIZED_TEST',
      '55000000-0000-4000-8000-000000000001',
      2,
      2,
      '54000000-0000-4000-8000-000000000001',
      '2026-01-12T10:03:00Z'
    );

    raise exception 'non-normalized InventoryMovement unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Transfer effects preserve one explicit decrement and increment identity.
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
  placement_anchor_kind,
  storage_location_id
) values (
  '58000000-0000-4000-8000-000000000010',
  '51000000-0000-4000-8000-000000000001',
  'TRANSFER_OUT_TEST',
  '55000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  -1,
  1,
  '54000000-0000-4000-8000-000000000001',
  '2026-01-12T11:00:00Z',
  'LOCATION',
  '52000000-0000-4000-8000-000000000001'
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
  placement_anchor_kind,
  compartment_id
) values (
  '58000000-0000-4000-8000-000000000011',
  '51000000-0000-4000-8000-000000000001',
  'TRANSFER_IN_TEST',
  '55000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000005',
  1,
  1,
  '54000000-0000-4000-8000-000000000001',
  '2026-01-12T11:00:00Z',
  'COMPARTMENT',
  '53000000-0000-4000-8000-000000000001'
);

insert into fridge.inventory_transfer (
  inventory_transfer_id,
  household_id,
  product_id,
  quantity_num,
  quantity_den,
  measurement_unit_id,
  occurred_at,
  source_anchor_kind,
  source_storage_location_id,
  destination_anchor_kind,
  destination_compartment_id
) values (
  '59000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  1,
  1,
  '54000000-0000-4000-8000-000000000001',
  '2026-01-12T11:00:00Z',
  'LOCATION',
  '52000000-0000-4000-8000-000000000001',
  'COMPARTMENT',
  '53000000-0000-4000-8000-000000000001'
);

insert into fridge.inventory_transfer_effect (
  inventory_transfer_effect_id,
  household_id,
  inventory_transfer_id,
  product_id,
  source_inventory_movement_id,
  destination_inventory_movement_id
) values (
  '5a000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000010',
  '58000000-0000-4000-8000-000000000011'
);

-- One movement cannot be both sides of the same transfer effect.
do $$
begin
  begin
    insert into fridge.inventory_transfer_effect (
      inventory_transfer_effect_id,
      household_id,
      inventory_transfer_id,
      product_id,
      source_inventory_movement_id,
      destination_inventory_movement_id
    ) values (
      '5a000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',
      '59000000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001',
      '58000000-0000-4000-8000-000000000010',
      '58000000-0000-4000-8000-000000000010'
    );

    raise exception 'same movement used as both transfer effects unexpectedly accepted';
  exception
    when check_violation then
      null;
    when unique_violation then
      null;
  end;
end;
$$;

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
) values (
  '5b000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000010',
  '58000000-0000-4000-8000-000000000011',
  '57000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000005',
  '55000000-0000-4000-8000-000000000001',
  1,
  1,
  '54000000-0000-4000-8000-000000000001',
  'TRANSFER_TEST',
  'transfer-causation-test'
);

insert into fridge.purchase (
  purchase_id,
  household_id,
  transaction_currency_code,
  occurred_at
) values (
  '5c000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'BRL',
  '2026-01-13T08:00:00Z'
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
  '5d000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '5c000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  2,
  1,
  '54000000-0000-4000-8000-000000000001'
);

insert into fridge.receipt (
  receipt_id,
  household_id,
  purchase_id,
  occurred_at
) values (
  '5e000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '5c000000-0000-4000-8000-000000000001',
  '2026-01-13T09:00:00Z'
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
  '5f000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '5e000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  2,
  1,
  '54000000-0000-4000-8000-000000000001'
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
  occurred_at
) values (
  '58000000-0000-4000-8000-000000000020',
  '51000000-0000-4000-8000-000000000001',
  'RECEIPT_ENTRY_TEST',
  '55000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  2,
  1,
  '54000000-0000-4000-8000-000000000001',
  '2026-01-13T09:00:00Z'
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
  '60000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '5f000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000020',
  '55000000-0000-4000-8000-000000000001',
  2,
  1,
  '54000000-0000-4000-8000-000000000001'
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
  occurred_at
) values (
  '58000000-0000-4000-8000-000000000030',
  '51000000-0000-4000-8000-000000000001',
  'WASTE_OUT_TEST',
  '55000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  -1,
  2,
  '54000000-0000-4000-8000-000000000001',
  '2026-01-14T10:00:00Z'
);

insert into fridge.waste_record (
  waste_record_id,
  household_id,
  occurred_at,
  waste_classification,
  reason
) values (
  '61000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '2026-01-14T10:00:00Z',
  'DISPOSAL_TEST',
  'integrity test'
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
  '62000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000030',
  1,
  2,
  '54000000-0000-4000-8000-000000000001'
);

rollback;
