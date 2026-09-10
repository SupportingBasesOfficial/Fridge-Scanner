-- FridgeScanner BE-06 integrity proof for 000075__over_receipt_exception.sql
begin;

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid)
    into v_def
    from pg_constraint
   where conname = 'household_procurement_command_registry_intent_ck'
     and conrelid = 'fridge.household_procurement_command_registry'::regclass;

  if v_def is null or position('REGISTER_OVER_RECEIPT_EXCEPTION' in v_def) = 0 then
    raise exception 'shared procurement CommandId registry does not include over-receipt exception intent';
  end if;
end;
$$;

do $$
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.register_over_receipt_exception(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks narrow over-receipt registration EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.register_over_receipt_exception(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.register_over_receipt_exception(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'non-app runtime role can execute over-receipt registration';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.receiving_pool_overage(uuid,uuid,numeric,numeric,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app can directly execute private overage helper';
  end if;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'purchase_receiving_exception',
    'receipt_item_intent_over_receipt_exception',
    'household_over_receipt_exception_command'
  ]
  loop
    if has_table_privilege('fridge_app', format('fridge.%I', v_table), 'INSERT')
       or has_table_privilege('fridge_app', format('fridge.%I', v_table), 'UPDATE')
       or has_table_privilege('fridge_app', format('fridge.%I', v_table), 'DELETE') then
      raise exception 'fridge_app has direct DML on %', v_table;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_function text;
begin
  select pg_get_functiondef(
    'fridge_internal.register_over_receipt_exception(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure
  ) into v_function;

  if position('acquire_household_procurement_admin_authority' in v_function) = 0 then
    raise exception 'over-receipt boundary does not acquire procurement authority';
  end if;
  if position('assert_household_procurement_command_intent' in v_function) = 0
     or position('REGISTER_OVER_RECEIPT_EXCEPTION' in v_function) = 0 then
    raise exception 'over-receipt boundary does not bind shared CommandId intent';
  end if;
  if position('receiving_pool_overage' in v_function) = 0 then
    raise exception 'over-receipt boundary does not derive exact discrepancy from receiving pool';
  end if;
  if position('receipt_item_intent_physical_materialization' in v_function) = 0 then
    raise exception 'over-receipt boundary does not reject already-physical intents';
  end if;
  if position('insert into fridge.purchase_receiving_exception' in v_function) = 0
     or position('insert into fridge.receipt_item_intent_over_receipt_exception' in v_function) = 0 then
    raise exception 'over-receipt boundary does not persist typed discrepancy evidence';
  end if;

  if position('insert into fridge.receipt_item (' in v_function) > 0
     or position('insert into fridge.purchase_item_receipt_allocation' in v_function) > 0
     or position('insert into fridge.purchase_item_substitution_allocation' in v_function) > 0
     or position('insert into fridge.stock_item' in v_function) > 0
     or position('insert into fridge.inventory_movement' in v_function) > 0
     or position('insert into fridge.receipt_item_inventory_effect' in v_function) > 0 then
    raise exception 'over-receipt detection boundary creates physical receiving truth';
  end if;
end;
$$;

do $$
declare
  v_trigger_count integer;
begin
  select count(*) into v_trigger_count
    from pg_trigger
   where tgrelid = 'fridge.purchase_receiving_exception'::regclass
     and tgname = 'purchase_receiving_exception_immutable'
     and not tgisinternal;
  if v_trigger_count <> 1 then
    raise exception 'purchase_receiving_exception append-only trigger missing';
  end if;

  select count(*) into v_trigger_count
    from pg_trigger
   where tgrelid = 'fridge.receipt_item_intent_over_receipt_exception'::regclass
     and tgname = 'receipt_item_intent_over_receipt_exception_immutable'
     and not tgisinternal;
  if v_trigger_count <> 1 then
    raise exception 'ReceiptItemIntent over-receipt bridge append-only trigger missing';
  end if;
end;
$$;

rollback;
