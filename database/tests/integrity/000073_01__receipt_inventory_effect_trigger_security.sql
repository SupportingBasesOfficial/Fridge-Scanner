-- FridgeScanner DB-02 integrity test
-- ReceiptItem deferred conservation trigger privilege boundary.

begin;

do $$
declare
  v_parent_definer boolean;
  v_effect_definer boolean;
  v_parent_path text;
  v_effect_path text;
begin
  select p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '')
    into v_parent_definer, v_parent_path
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'fridge_internal'
     and p.proname = 'guard_receipt_item_parent_inventory_effects'
     and pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

  if v_parent_definer is distinct from true then
    raise exception 'receipt parent conservation trigger wrapper must be SECURITY DEFINER';
  end if;

  if position('search_path=pg_catalog, fridge, fridge_internal' in v_parent_path) = 0 then
    raise exception 'receipt parent conservation trigger wrapper must pin safe search_path';
  end if;

  select p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '')
    into v_effect_definer, v_effect_path
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'fridge_internal'
     and p.proname = 'guard_receipt_item_inventory_effect'
     and pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

  if v_effect_definer is distinct from true then
    raise exception 'receipt effect conservation trigger wrapper must be SECURITY DEFINER';
  end if;

  if position('search_path=pg_catalog, fridge, fridge_internal' in v_effect_path) = 0 then
    raise exception 'receipt effect conservation trigger wrapper must pin safe search_path';
  end if;
end;
$$;

-- Runtime must not gain a callable escape hatch to the private invariant
-- validator merely because deferred trigger execution needs internal authority.
do $$
begin
  if pg_catalog.has_function_privilege(
    'fridge_app',
    'fridge_internal.assert_receipt_item_inventory_effects(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not execute private receipt inventory conservation helper directly';
  end if;

  if pg_catalog.has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_receipt_item_parent_inventory_effects()',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not execute receipt parent trigger wrapper directly';
  end if;

  if pg_catalog.has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_receipt_item_inventory_effect()',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not execute receipt effect trigger wrapper directly';
  end if;
end;
$$;

-- Preserve the original deferred constraint-trigger shape after hardening.
do $$
begin
  if (
    select count(*)
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'fridge'
       and t.tgname in (
         'receipt_item_parent_inventory_effects_ct',
         'receipt_item_inventory_effect_conservation_ct'
       )
       and t.tgconstraint <> 0
       and t.tgdeferrable
       and t.tginitdeferred
  ) <> 2 then
    raise exception 'receipt inventory conservation triggers must remain DEFERRABLE INITIALLY DEFERRED constraint triggers';
  end if;
end;
$$;

rollback;
