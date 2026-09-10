-- FridgeScanner BE-06 integrity proof for 000073__ordinary_receipt_materialization.sql

begin;

do $$
declare
  v_constraint text;
  v_function text;
  v_availability text;
  v_trigger text;
begin
  select pg_get_constraintdef(oid)
    into v_constraint
    from pg_constraint
   where conname = 'household_procurement_command_registry_intent_ck';

  if v_constraint is null
     or position('CREATE_RECEIPT_ITEM_INTENT' in v_constraint) = 0
     or position('MATERIALIZE_ORDINARY_RECEIPT_ITEM' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_PRICING_EXTENSION' in v_constraint) = 0 then
    raise exception 'BE-06 command registry lost an accepted intent';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.materialize_ordinary_receipt_item(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks narrow ordinary receipt materialization EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.materialize_ordinary_receipt_item(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.materialize_ordinary_receipt_item(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly unexpectedly received ordinary receipt materialization EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.receiving_pool_can_allocate(uuid,uuid,numeric,numeric,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'runtime may directly execute receiving availability helper';
  end if;

  if has_table_privilege('fridge_app', 'fridge.receipt_item_intent_materialization', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.receipt_item_intent_materialization', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.receipt_item_intent_materialization', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.household_ordinary_receipt_materialization_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.receipt_item', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.inventory_movement', 'INSERT') then
    raise exception 'runtime received direct physical receiving DML';
  end if;

  select pg_get_functiondef(
    'fridge_internal.materialize_ordinary_receipt_item(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_function;

  if position('acquire_household_procurement_admin_authority' in v_function) = 0
     or position('receiving_pool_can_allocate' in v_function) = 0
     or position('insert into fridge.receipt_item (' in v_function) = 0
     or position('insert into fridge.purchase_item_receipt_allocation (' in v_function) = 0
     or position('insert into fridge.stock_item (' in v_function) = 0
     or position('insert into fridge.inventory_movement (' in v_function) = 0
     or position('RECEIPT_INGRESS' in v_function) = 0
     or position('insert into fridge.receipt_item_inventory_effect (' in v_function) = 0
     or position('assert_receipt_item_inventory_effects' in v_function) = 0
     or position('placement_kind = ''LOCATION''' in v_function) = 0
     or position('placement_kind = ''COMPARTMENT''' in v_function) = 0
     or position('UNPLACED' in v_function) <> 0 then
    raise exception 'ordinary receipt materialization boundary lost required atomic/placement scope semantics';
  end if;

  select pg_get_functiondef(
    'fridge_internal.receiving_pool_can_allocate(uuid,uuid,numeric,numeric,uuid,uuid)'::regprocedure
  ) into v_availability;
  if position('for update' in lower(v_availability)) = 0
     or position('purchase_item_receipt_allocation' in v_availability) = 0
     or position('purchase_item_substitution_allocation' in v_availability) = 0
     or position('quantity_in_target_unit' in v_availability) = 0 then
    raise exception 'receiving availability helper does not serialize and consume the shared physical pool';
  end if;

  select pg_get_triggerdef(oid)
    into v_trigger
    from pg_trigger
   where tgname = 'receipt_item_intent_materialization_immutable'
     and not tgisinternal;
  if v_trigger is null or position('reject_historical_mutation' in v_trigger) = 0 then
    raise exception 'ReceiptItemIntent materialization bridge is not append-only';
  end if;
end;
$$;

rollback;
