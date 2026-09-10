-- FridgeScanner BE-06 integrity proof for 000077_01__over_receipt_resolution_conservation.sql
begin;

do $$
declare
  v_trigger_count integer;
  v_body text;
begin
  select count(*) into v_trigger_count
    from pg_trigger
   where tgrelid = 'fridge.purchase_receiving_exception_resolution'::regclass
     and tgname = 'over_receipt_resolution_conservation_ct'
     and not tgisinternal
     and tgdeferrable
     and tginitdeferred;
  if v_trigger_count <> 1 then
    raise exception 'accepted-excess resolution deferred conservation trigger missing';
  end if;

  select pg_get_functiondef(
    'fridge_internal.guard_over_receipt_resolution_conservation()'::regprocedure
  ) into v_body;
  if position('assert_purchase_receiving_pool' in v_body) = 0 then
    raise exception 'accepted-excess resolution trigger does not re-prove PurchaseItem receiving conservation';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_over_receipt_resolution_conservation()',
    'EXECUTE'
  ) then
    raise exception 'fridge_app can directly execute accepted-excess resolution trigger wrapper';
  end if;
end;
$$;

rollback;
