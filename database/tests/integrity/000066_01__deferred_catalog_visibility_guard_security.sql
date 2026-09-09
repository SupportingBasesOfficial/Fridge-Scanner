-- FridgeScanner BE-06 integrity proof
-- 000066_01__deferred_catalog_visibility_guard_security.sql

begin;

do $$
declare
  v_security_definer boolean;
  v_config text[];
begin
  select p.prosecdef, p.proconfig
    into v_security_definer, v_config
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'fridge_internal'
     and p.proname = 'guard_household_catalog_visibility'
     and pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

  if v_security_definer is distinct from true then
    raise exception 'deferred Household catalog visibility guard must be SECURITY DEFINER';
  end if;

  if v_config is null
     or not ('search_path=pg_catalog' = any(v_config)) then
    raise exception 'deferred Household catalog visibility guard must pin search_path to pg_catalog';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.assert_product_visible_to_household(uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.assert_product_visible_to_household(uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.assert_product_visible_to_household(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'runtime roles must not receive direct Product visibility assertion EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.assert_concept_visible_to_household(uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.assert_concept_visible_to_household(uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.assert_concept_visible_to_household(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'runtime roles must not receive direct IngredientConcept visibility assertion EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_household_catalog_visibility()',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.guard_household_catalog_visibility()',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.guard_household_catalog_visibility()',
    'EXECUTE'
  ) then
    raise exception 'runtime roles must not directly execute the deferred catalog visibility trigger boundary';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
     where n.nspname = 'fridge'
       and c.relname = 'purchase_item'
       and t.tgname = 'purchase_item_catalog_visibility_guard'
       and t.tgconstraint <> 0
       and p.proname = 'guard_household_catalog_visibility'
  ) then
    raise exception 'PurchaseItem must remain protected by the deferred catalog visibility constraint trigger';
  end if;
end;
$$;

rollback;
