-- FridgeScanner BE-06 integrity proof for 000072__receipt_item_intent.sql

begin;

do $$
declare
  v_constraint text;
  v_function text;
begin
  select pg_get_constraintdef(oid)
    into v_constraint
    from pg_constraint
   where conname = 'household_procurement_command_registry_intent_ck';

  if v_constraint is null
     or position('CREATE_PURCHASE' in v_constraint) = 0
     or position('CREATE_RECEIPT' in v_constraint) = 0
     or position('CREATE_RECEIPT_ITEM_INTENT' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_PRICING_EXTENSION' in v_constraint) = 0 then
    raise exception 'BE-06 command registry lost an accepted intent';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_receipt_item_intent(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks narrow ReceiptItem intent EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.create_household_receipt_item_intent(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.create_household_receipt_item_intent(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly unexpectedly received ReceiptItem intent EXECUTE';
  end if;

  if has_table_privilege('fridge_app', 'fridge.receipt_item_intent', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.receipt_item_intent', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.receipt_item_intent', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.household_receipt_item_intent_create_command', 'INSERT') then
    raise exception 'runtime received direct ReceiptItem intent DML';
  end if;

  select pg_get_functiondef(
    'fridge_internal.create_household_receipt_item_intent(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,text)'::regprocedure
  ) into v_function;

  if position('acquire_household_procurement_admin_authority' in v_function) = 0
     or position('register_household_procurement_command_intent' in v_function) = 0
     or position('from fridge.receipt r' in v_function) = 0
     or position('from fridge.product p' in v_function) = 0
     or position('from fridge.measurement_unit u' in v_function) = 0
     or position('insert into fridge.receipt_item (' in v_function) <> 0
     or position('inventory_movement' in v_function) <> 0
     or position('purchase_item_receipt_allocation' in v_function) <> 0 then
    raise exception 'ReceiptItem intent boundary lost authority/reference isolation or gained physical side effects';
  end if;
end;
$$;

insert into fridge.household (household_id, display_name)
values ('e7200001-0b06-4720-8720-000000000001', 'BE06 ReceiptItem intent integrity household');

insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
values ('e7200002-0b06-4720-8720-000000000002', 'GLOBAL', 'BE06 intent product', 'ACTIVE');

insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
values ('BE06_INTENT_DIM', 'BE06 intent dimension', 'ACTIVE');

insert into fridge.measurement_unit (
  measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
) values (
  'e7200003-0b06-4720-8720-000000000003',
  'BE06_INTENT_UNIT',
  'BE06_INTENT_DIM',
  'BE06 intent unit',
  'ACTIVE'
);

insert into fridge.receipt (
  receipt_id, household_id, occurred_at, source_provenance, recorded_at
) values (
  'e7200004-0b06-4720-8720-000000000004',
  'e7200001-0b06-4720-8720-000000000001',
  '2026-09-09T12:00:00Z',
  'integrity receipt',
  '2026-09-09T12:00:00Z'
);

insert into fridge.receipt_item_intent (
  receipt_item_intent_id, household_id, receipt_id, product_id,
  intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
) values (
  'e7200005-0b06-4720-8720-000000000005',
  'e7200001-0b06-4720-8720-000000000001',
  'e7200004-0b06-4720-8720-000000000004',
  'e7200002-0b06-4720-8720-000000000002',
  3, 2,
  'e7200003-0b06-4720-8720-000000000003',
  'integrity intent'
);

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
    from fridge.receipt_item
   where household_id = 'e7200001-0b06-4720-8720-000000000001';
  if v_count <> 0 then
    raise exception 'ReceiptItem intent unexpectedly created physical ReceiptItem truth';
  end if;

  select count(*) into v_count
    from fridge.purchase_item_receipt_allocation
   where household_id = 'e7200001-0b06-4720-8720-000000000001';
  if v_count <> 0 then
    raise exception 'ReceiptItem intent unexpectedly consumed Purchase receiving allowance';
  end if;

  select count(*) into v_count
    from fridge.receipt_item_inventory_effect
   where household_id = 'e7200001-0b06-4720-8720-000000000001';
  if v_count <> 0 then
    raise exception 'ReceiptItem intent unexpectedly created inventory ingress';
  end if;

  begin
    update fridge.receipt_item_intent
       set provenance = 'rewritten'
     where receipt_item_intent_id = 'e7200005-0b06-4720-8720-000000000005';
    raise exception 'ReceiptItem intent unexpectedly mutable';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from fridge.receipt_item_intent
     where receipt_item_intent_id = 'e7200005-0b06-4720-8720-000000000005';
    raise exception 'ReceiptItem intent unexpectedly deletable';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
