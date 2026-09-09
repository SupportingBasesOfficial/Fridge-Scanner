-- FridgeScanner BE-06 integrity proof
-- 000066_03__purchase_item_current_product_lock.sql

begin;

do $$
declare
  v_definition text;
  v_trigger_definition text;
begin
  if not exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'fridge_internal'
       and p.proname = 'guard_purchase_item_current_product'
       and p.prosecdef
  ) then
    raise exception 'PurchaseItem current Product guard must exist as SECURITY DEFINER';
  end if;

  select pg_catalog.pg_get_functiondef(
    'fridge_internal.guard_purchase_item_current_product()'::regprocedure
  ) into v_definition;

  if position('p.lifecycle_status = ''ACTIVE''' in v_definition) = 0
     or position('''GLOBAL''::fridge.catalog_scope' in v_definition) = 0
     or position('''HOUSEHOLD''::fridge.catalog_scope' in v_definition) = 0
     or position('p.owner_household_id = new.household_id' in v_definition) = 0 then
    raise exception 'PurchaseItem current Product guard must enforce ACTIVE GLOBAL-or-same-Household visibility';
  end if;

  if position('for share' in lower(v_definition)) = 0 then
    raise exception 'PurchaseItem current Product guard must acquire FOR SHARE';
  end if;

  if position('P6P01' in v_definition) = 0 then
    raise exception 'PurchaseItem current Product guard must emit the BE-06 internal race-loss SQLSTATE';
  end if;

  if has_function_privilege(
       'fridge_app',
       'fridge_internal.guard_purchase_item_current_product()',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_worker',
       'fridge_internal.guard_purchase_item_current_product()',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.guard_purchase_item_current_product()',
       'EXECUTE'
     ) then
    raise exception 'PurchaseItem current Product trigger function must not be directly executable by runtime roles';
  end if;

  select pg_catalog.pg_get_triggerdef(t.oid)
    into v_trigger_definition
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'fridge'
     and c.relname = 'purchase_item'
     and t.tgname = 'purchase_item_current_product_guard'
     and not t.tgisinternal;

  if v_trigger_definition is null
     or position('BEFORE INSERT OR UPDATE OF household_id, product_id' in v_trigger_definition) = 0
     or position('FOR EACH ROW' in v_trigger_definition) = 0
     or position('guard_purchase_item_current_product()' in v_trigger_definition) = 0 then
    raise exception 'PurchaseItem current Product trigger is missing or has the wrong timing/columns';
  end if;
end;
$$;

rollback;
