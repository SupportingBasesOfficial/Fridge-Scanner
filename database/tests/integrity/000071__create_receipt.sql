-- FridgeScanner BE-06 integrity checks for 000071__create_receipt.sql

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
     or position('COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_PRICING_BASIS' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_PRICING_EXTENSION' in v_constraint) = 0
     or position('CREATE_RECEIPT' in v_constraint) = 0 then
    raise exception 'BE-06 command registry lost an accepted intent';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks narrow CreateReceipt EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.create_household_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.create_household_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly unexpectedly received CreateReceipt EXECUTE';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_receipt_create_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_receipt_create_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_receipt_create_command', 'UPDATE') then
    raise exception 'runtime received direct Receipt command-ledger privileges';
  end if;

  select pg_get_functiondef(
    'fridge_internal.create_household_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
  ) into v_function;

  if position('acquire_household_procurement_admin_authority' in v_function) = 0
     or position('assert_household_procurement_command_intent' in v_function) = 0
     or position('register_household_procurement_command_intent' in v_function) = 0
     or position('for key share' in lower(v_function)) = 0
     or position('source_provenance' in v_function) = 0
     or position('clock_timestamp()' in v_function) = 0
     or position('receipt_item' in lower(v_function)) <> 0 then
    raise exception 'CreateReceipt boundary lost authority/replay/history/no-ReceiptItem semantics';
  end if;
end;
$$;

insert into fridge.household (household_id, display_name)
values ('e7500001-0b06-4750-8750-000000000001', 'BE06 CreateReceipt integrity household');

insert into fridge.receipt (
  receipt_id,
  household_id,
  purchase_id,
  source_identity,
  occurred_at,
  source_provenance
) values (
  'e7500002-0b06-4750-8750-000000000002',
  'e7500001-0b06-4750-8750-000000000001',
  null,
  null,
  '2026-09-09T20:00:00Z',
  'DIRECT_PHYSICAL_RECEIPT'
);

do $$
begin
  begin
    update fridge.receipt
       set source_provenance = 'rewritten'
     where receipt_id = 'e7500002-0b06-4750-8750-000000000002';
    raise exception 'Receipt history unexpectedly mutable';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from fridge.receipt
     where receipt_id = 'e7500002-0b06-4750-8750-000000000002';
    raise exception 'Receipt history unexpectedly deletable';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
