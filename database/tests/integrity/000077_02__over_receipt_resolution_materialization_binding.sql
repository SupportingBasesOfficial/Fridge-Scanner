-- FridgeScanner BE-06 integrity proof for 000077_02__over_receipt_resolution_materialization_binding.sql
begin;

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'receiving_exception_resolution_exact_materialization_fk'
     and conrelid = 'fridge.purchase_receiving_exception_resolution'::regclass;

  if v_def is null
     or position('receipt_item_intent_materialization' in v_def) = 0
     or position('receipt_item_intent_id' in v_def) = 0
     or position('receipt_item_id' in v_def) = 0
     or position('ordinary_allocation_id' in v_def) = 0 then
    raise exception 'accepted-excess resolution is not bound to exact detected-intent physical materialization';
  end if;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'receipt_item_intent_materialization_resolution_identity_uq'
     and conrelid = 'fridge.receipt_item_intent_materialization'::regclass;

  if v_def is null
     or position('receipt_item_intent_id' in v_def) = 0
     or position('receipt_item_id' in v_def) = 0
     or position('purchase_item_receipt_allocation_id' in v_def) = 0 then
    raise exception 'ordinary materialization lacks exact identity required by accepted-excess resolution';
  end if;
end;
$$;

rollback;
