-- FridgeScanner DB-02 supplemental integrity checks for 000007__inventory_ledger.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('63000000-0000-4000-8000-000000000001', 'Correction household A'),
  ('63000000-0000-4000-8000-000000000002', 'Correction household B');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('CORRECTION_COUNT_TEST', 'Correction count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  '64000000-0000-4000-8000-000000000001',
  'CORRECTION_UNIT_TEST',
  'CORRECTION_COUNT_TEST',
  'Correction unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values
  ('65000000-0000-4000-8000-000000000001', 'GLOBAL', 'Correction product A'),
  ('65000000-0000-4000-8000-000000000002', 'GLOBAL', 'Correction product B');

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
  '66000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001',
  'BASE_TEST',
  '65000000-0000-4000-8000-000000000001',
  1,
  1,
  '64000000-0000-4000-8000-000000000001',
  '2026-01-15T10:00:00Z'
);

-- A correction cannot point across Household scope.
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
      correction_of_movement_id
    ) values (
      '66000000-0000-4000-8000-000000000002',
      '63000000-0000-4000-8000-000000000002',
      'CORRECTION_TEST',
      '65000000-0000-4000-8000-000000000001',
      -1,
      1,
      '64000000-0000-4000-8000-000000000001',
      '2026-01-15T10:01:00Z',
      '66000000-0000-4000-8000-000000000001'
    );

    raise exception 'cross-Household correction unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- A correction cannot reinterpret another Product's movement.
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
      correction_of_movement_id
    ) values (
      '66000000-0000-4000-8000-000000000003',
      '63000000-0000-4000-8000-000000000001',
      'CORRECTION_TEST',
      '65000000-0000-4000-8000-000000000002',
      -1,
      1,
      '64000000-0000-4000-8000-000000000001',
      '2026-01-15T10:02:00Z',
      '66000000-0000-4000-8000-000000000001'
    );

    raise exception 'cross-Product correction unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

rollback;
