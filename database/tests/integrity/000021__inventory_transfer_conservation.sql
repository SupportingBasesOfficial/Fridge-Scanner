-- FridgeScanner DB-02 integrity test
-- InventoryTransfer deferred conservation postcondition.
-- Requires a bootstrap/superuser test identity because RLS/least-privilege
-- migrations are already installed at this point in the lineage.

begin;

select set_config('fridge.household_id', '21000000-0000-0000-0000-000000000001', true);

insert into fridge.household (household_id, display_name)
values ('21000000-0000-0000-0000-000000000001', 'Transfer Test Household');

insert into fridge.storage_location_kind (kind_code, display_name)
values ('TRANSFER_TEST', 'Transfer test location');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values
  ('21100000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'TRANSFER_TEST', 'Source'),
  ('21100000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', 'TRANSFER_TEST', 'Destination');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('TRANSFER_COUNT', 'Transfer count');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  '21200000-0000-0000-0000-000000000001',
  'TRANSFER_EACH',
  'TRANSFER_COUNT',
  'Transfer each'
);

insert into fridge.product (
  product_id,
  catalog_scope,
  owner_household_id,
  canonical_name
) values (
  '21300000-0000-0000-0000-000000000001',
  'GLOBAL',
  null,
  'Transfer Product'
);

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  placement_anchor_kind,
  storage_location_id
) values
  (
    '21400000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '21300000-0000-0000-0000-000000000001',
    'LOCATION',
    '21100000-0000-0000-0000-000000000001'
  ),
  (
    '21400000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    '21300000-0000-0000-0000-000000000001',
    'LOCATION',
    '21100000-0000-0000-0000-000000000002'
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
  storage_location_id,
  causation_identity
) values
  (
    '21500000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'TEST_SOURCE',
    '21300000-0000-0000-0000-000000000001',
    '21400000-0000-0000-0000-000000000001',
    -1,
    3,
    '21200000-0000-0000-0000-000000000001',
    '2026-09-03T12:00:00Z',
    'LOCATION',
    '21100000-0000-0000-0000-000000000001',
    'transfer-test-valid'
  ),
  (
    '21500000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    'TEST_DESTINATION',
    '21300000-0000-0000-0000-000000000001',
    '21400000-0000-0000-0000-000000000002',
    1,
    3,
    '21200000-0000-0000-0000-000000000001',
    '2026-09-03T12:00:00Z',
    'LOCATION',
    '21100000-0000-0000-0000-000000000002',
    'transfer-test-valid'
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
  destination_storage_location_id,
  causation_identity
) values (
  '21600000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '21300000-0000-0000-0000-000000000001',
  1,
  3,
  '21200000-0000-0000-0000-000000000001',
  '2026-09-03T12:00:00Z',
  'LOCATION',
  '21100000-0000-0000-0000-000000000001',
  'LOCATION',
  '21100000-0000-0000-0000-000000000002',
  'transfer-test-valid'
);

insert into fridge.inventory_transfer_effect (
  inventory_transfer_effect_id,
  household_id,
  inventory_transfer_id,
  product_id,
  source_inventory_movement_id,
  destination_inventory_movement_id
) values (
  '21700000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '21600000-0000-0000-0000-000000000001',
  '21300000-0000-0000-0000-000000000001',
  '21500000-0000-0000-0000-000000000001',
  '21500000-0000-0000-0000-000000000002'
);

-- Canonical valid pair must pass exact validation.
select fridge_internal.assert_inventory_transfer_conserved(
  '21600000-0000-0000-0000-000000000001'
);

-- Both trigger paths must be real deferred constraint triggers.
do $$
begin
  if (
    select count(*)
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'fridge'
      and t.tgname in (
        'inventory_transfer_conservation_from_transfer',
        'inventory_transfer_conservation_from_effect'
      )
      and t.tgconstraint <> 0
      and t.tgdeferrable
      and t.tginitdeferred
  ) <> 2 then
    raise exception 'transfer conservation triggers are not both DEFERRABLE INITIALLY DEFERRED constraint triggers';
  end if;
end;
$$;

-- Missing effect must be rejected by the validator.
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
  destination_storage_location_id
) values (
  '21600000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000001',
  '21300000-0000-0000-0000-000000000001',
  1,
  3,
  '21200000-0000-0000-0000-000000000001',
  '2026-09-03T12:00:00Z',
  'LOCATION',
  '21100000-0000-0000-0000-000000000001',
  'LOCATION',
  '21100000-0000-0000-0000-000000000002'
);

do $$
begin
  begin
    perform fridge_internal.assert_inventory_transfer_conserved(
      '21600000-0000-0000-0000-000000000002'
    );
    raise exception 'transfer guard failure: transfer without effect was accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Build independent bad fixtures so immutable history never needs UPDATE.
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
) values
  (
    '21500000-0000-0000-0000-000000000010',
    '21000000-0000-0000-0000-000000000001',
    'BAD_SOURCE_SIGN',
    '21300000-0000-0000-0000-000000000001',
    '21400000-0000-0000-0000-000000000001',
    1,
    3,
    '21200000-0000-0000-0000-000000000001',
    '2026-09-03T13:00:00Z',
    'LOCATION',
    '21100000-0000-0000-0000-000000000001'
  ),
  (
    '21500000-0000-0000-0000-000000000011',
    '21000000-0000-0000-0000-000000000001',
    'BAD_DEST_MAGNITUDE',
    '21300000-0000-0000-0000-000000000001',
    '21400000-0000-0000-0000-000000000002',
    1,
    2,
    '21200000-0000-0000-0000-000000000001',
    '2026-09-03T13:00:00Z',
    'LOCATION',
    '21100000-0000-0000-0000-000000000002'
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
  destination_storage_location_id
) values (
  '21600000-0000-0000-0000-000000000010',
  '21000000-0000-0000-0000-000000000001',
  '21300000-0000-0000-0000-000000000001',
  1,
  3,
  '21200000-0000-0000-0000-000000000001',
  '2026-09-03T13:00:00Z',
  'LOCATION',
  '21100000-0000-0000-0000-000000000001',
  'LOCATION',
  '21100000-0000-0000-0000-000000000002'
);

insert into fridge.inventory_transfer_effect (
  inventory_transfer_effect_id,
  household_id,
  inventory_transfer_id,
  product_id,
  source_inventory_movement_id,
  destination_inventory_movement_id
) values (
  '21700000-0000-0000-0000-000000000010',
  '21000000-0000-0000-0000-000000000001',
  '21600000-0000-0000-0000-000000000010',
  '21300000-0000-0000-0000-000000000001',
  '21500000-0000-0000-0000-000000000010',
  '21500000-0000-0000-0000-000000000011'
);

do $$
begin
  begin
    perform fridge_internal.assert_inventory_transfer_conserved(
      '21600000-0000-0000-0000-000000000010'
    );
    raise exception 'transfer guard failure: invalid sign/magnitude pair was accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

rollback;
