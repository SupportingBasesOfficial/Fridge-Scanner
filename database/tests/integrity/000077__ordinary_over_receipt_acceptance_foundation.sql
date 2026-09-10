-- FridgeScanner BE-06 integrity proof for 000077__ordinary_over_receipt_acceptance_foundation.sql
begin;

do $$
declare
  v_def text;
  v_trigger_count integer;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'receiving_exception_resolution_kind_ck'
     and conrelid = 'fridge.purchase_receiving_exception_resolution'::regclass;
  if v_def is null or position('ACCEPTED_ORDINARY_EXCESS' in v_def) = 0 then
    raise exception 'ordinary over-receipt resolution kind is not closed';
  end if;

  select count(*) into v_trigger_count
    from pg_trigger
   where tgrelid = 'fridge.purchase_receiving_exception_resolution'::regclass
     and tgname = 'purchase_receiving_exception_resolution_immutable'
     and not tgisinternal;
  if v_trigger_count <> 1 then
    raise exception 'over-receipt resolution append-only trigger missing';
  end if;
end;
$$;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['fridge_app', 'fridge_worker', 'fridge_readonly'] loop
    if has_table_privilege(v_role, 'fridge.purchase_receiving_exception_resolution', 'INSERT')
       or has_table_privilege(v_role, 'fridge.purchase_receiving_exception_resolution', 'UPDATE')
       or has_table_privilege(v_role, 'fridge.purchase_receiving_exception_resolution', 'DELETE') then
      raise exception '% has direct mutation authority on over-receipt resolution', v_role;
    end if;
  end loop;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.ordinary_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app can directly execute private accepted-excess helper';
  end if;
end;
$$;

do $$
declare
  v_body text;
begin
  select pg_get_functiondef(
    'fridge_internal.assert_purchase_receiving_pool(uuid,uuid)'::regprocedure
  ) into v_body;

  if position('purchase_receiving_exception_resolution' in v_body) = 0
     or position('accepted_excess_quantity_num' in v_body) = 0
     or position('purchase_item_substitution_allocation' in v_body) = 0 then
    raise exception 'PurchaseItem receiving conservation is not exception-aware while preserving substitution pool';
  end if;

  if position('accepted over-receipt excess exceeds linked ordinary allocation' in v_body) = 0
     or position('accepted over-receipt excess must use PurchaseItem comparison unit' in v_body) = 0 then
    raise exception 'exception-aware receiving conservation lacks accepted-excess bounds';
  end if;
end;
$$;

do $$
declare
  v_body text;
begin
  select pg_get_functiondef(
    'fridge_internal.ordinary_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)'::regprocedure
  ) into v_body;

  if position('for update' in lower(v_body)) = 0
     or position('quantity_in_target_unit' in v_body) = 0
     or position('purchase_receiving_exception_resolution' in v_body) = 0
     or position('purchase_item_substitution_allocation' in v_body) = 0 then
    raise exception 'accepted-excess helper does not serialize/reconcile the canonical receiving pool';
  end if;
end;
$$;

rollback;
