-- FridgeScanner DB-02 integrity checks for 000016__historical_immutability.sql

begin;

insert into fridge.household (household_id, display_name)
values ('c1000000-0000-4000-8000-000000000001', 'Immutable household');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('IMM_COUNT_TEST', 'Immutable count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  'c2000000-0000-4000-8000-000000000001',
  'IMM_UNIT_TEST',
  'IMM_COUNT_TEST',
  'Immutable unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values ('c3000000-0000-4000-8000-000000000001', 'GLOBAL', 'Immutable product');

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  placement_anchor_kind
) values (
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
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
  occurred_at
) values (
  'c5000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'IMM_TEST',
  'c3000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  1,
  1,
  'c2000000-0000-4000-8000-000000000001',
  '2026-01-28T10:00:00Z'
);

-- Ledger history cannot be rewritten.
do $$
begin
  begin
    update fridge.inventory_movement
       set quantity_num = 2
     where inventory_movement_id = 'c5000000-0000-4000-8000-000000000001';
    raise exception 'InventoryMovement UPDATE unexpectedly accepted';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    delete from fridge.inventory_movement
     where inventory_movement_id = 'c5000000-0000-4000-8000-000000000001';
    raise exception 'InventoryMovement DELETE unexpectedly accepted';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

insert into fridge.source_expiration_fact (
  source_expiration_fact_id,
  household_id,
  stock_item_id,
  product_id,
  expiration_precision,
  source_expiration_date,
  observed_at,
  provenance
) values (
  'c6000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'DATE',
  date '2026-02-01',
  '2026-01-28T10:01:00Z',
  'immutability test'
);

-- Source shelf-life evidence cannot be rewritten.
do $$
begin
  begin
    update fridge.source_expiration_fact
       set source_expiration_date = date '2026-02-02'
     where source_expiration_fact_id = 'c6000000-0000-4000-8000-000000000001';
    raise exception 'SourceExpirationFact UPDATE unexpectedly accepted';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

insert into fridge.audit_event (
  audit_event_id,
  household_id,
  principal_identity,
  action_code,
  occurred_at
) values (
  'c7000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'principal:test',
  'IMMUTABILITY_TEST',
  '2026-01-28T10:02:00Z'
);

-- Audit evidence is append-only.
do $$
begin
  begin
    delete from fridge.audit_event
     where audit_event_id = 'c7000000-0000-4000-8000-000000000001';
    raise exception 'AuditEvent DELETE unexpectedly accepted';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

rollback;
