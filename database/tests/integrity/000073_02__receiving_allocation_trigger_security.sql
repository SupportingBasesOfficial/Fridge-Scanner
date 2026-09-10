-- FridgeScanner DB-02 integrity test
-- Receiving allocation deferred conservation trigger privilege boundary.

begin;

do $$
declare
  v_definer boolean;
  v_path text;
begin
  select p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '')
    into v_definer, v_path
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'fridge_internal'
     and p.proname = 'guard_receiving_allocation_conservation'
     and pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

  if v_definer is distinct from true then
    raise exception 'receiving allocation conservation trigger wrapper must be SECURITY DEFINER';
  end if;

  if position('search_path=pg_catalog, fridge, fridge_internal' in v_path) = 0 then
    raise exception 'receiving allocation conservation trigger wrapper must pin safe search_path';
  end if;
end;
$$;

do $$
begin
  if pg_catalog.has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_receiving_allocation_conservation()',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not execute receiving allocation trigger wrapper directly';
  end if;

  if pg_catalog.has_function_privilege(
    'fridge_app',
    'fridge_internal.assert_purchase_receiving_pool(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not execute private PurchaseItem receiving conservation helper directly';
  end if;

  if pg_catalog.has_function_privilege(
    'fridge_app',
    'fridge_internal.assert_receipt_item_allocation_pool(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not execute private ReceiptItem allocation conservation helper directly';
  end if;
end;
$$;

do $$
begin
  if (
    select count(*)
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'fridge'
       and t.tgname in (
         'ordinary_receiving_conservation_ct',
         'substitution_receiving_conservation_ct'
       )
       and t.tgconstraint <> 0
       and t.tgdeferrable
       and t.tginitdeferred
  ) <> 2 then
    raise exception 'receiving allocation conservation triggers must remain DEFERRABLE INITIALLY DEFERRED constraint triggers';
  end if;
end;
$$;

rollback;
