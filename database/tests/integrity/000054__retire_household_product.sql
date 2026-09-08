-- FridgeScanner BE-05 integrity proof
-- 000054__retire_household_product.sql

begin;

do $$
declare
  v_retire_definition text;
  v_stock_guard_definition text;
  v_identifier_guard_definition text;
  v_compat_guard_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.retire_household_product(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute governed RetireHouseholdProduct';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.retire_household_product(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.retire_household_product(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute RetireHouseholdProduct';
  end if;

  if has_table_privilege('fridge_app', 'fridge.product', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_product_retire_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_catalog_command_registry', 'SELECT') then
    raise exception 'runtime must not receive direct Product/retire-ledger/registry authority';
  end if;

  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'fridge'
       and t.relname = 'household_catalog_command_registry'
       and c.conname = 'household_catalog_command_registry_intent_ck'
       and pg_get_constraintdef(c.oid) like '%RETIRE_HOUSEHOLD_PRODUCT%'
  ) then
    raise exception 'shared Household catalog registry must govern Product retirement';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'fridge' and c.relname = 'stock_item'
      and t.tgname = 'stock_item_current_product_guard' and not t.tgisinternal
  ) then
    raise exception 'current StockItem must have Product currentness guard';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'fridge' and c.relname = 'product_identifier'
      and t.tgname = 'product_identifier_current_product_guard' and not t.tgisinternal
  ) then
    raise exception 'current ProductIdentifier must have Product currentness guard';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'fridge' and c.relname = 'product_ingredient_compatibility'
      and t.tgname = 'compatibility_current_product_guard' and not t.tgisinternal
  ) then
    raise exception 'current compatibility mapping must have Product currentness guard';
  end if;

  select pg_get_functiondef(
    'fridge_internal.retire_household_product(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_retire_definition;

  if position('acquire_household_catalog_admin_authority' in v_retire_definition) = 0
     or position('''HOUSEHOLD''::fridge.catalog_scope' in v_retire_definition) = 0
     or position('owner_household_id = p_household_id' in v_retire_definition) = 0
     or position('lifecycle_status = ''ACTIVE''' in v_retire_definition) = 0 then
    raise exception 'Product retirement must target current same-Household private Product under catalog authority';
  end if;

  if position('assert_household_catalog_command_intent' in v_retire_definition) = 0
     or position('register_household_catalog_command_intent' in v_retire_definition) = 0
     or position('''RETIRE_HOUSEHOLD_PRODUCT''' in v_retire_definition) = 0 then
    raise exception 'Product retirement must participate in shared CommandId governance';
  end if;

  if position('from fridge.stock_item' in v_retire_definition) = 0
     or position('from fridge.product_identifier' in v_retire_definition) = 0
     or position('from fridge.product_ingredient_compatibility' in v_retire_definition) = 0 then
    raise exception 'Product retirement must inspect current accepted dependencies';
  end if;

  if position('for update' in lower(v_retire_definition)) = 0
     or position('clock_timestamp()' in v_retire_definition) = 0
     or position('statement_timestamp()' in v_retire_definition) > 0 then
    raise exception 'Product retirement must serialize and use fresh post-lock database time';
  end if;

  select pg_get_functiondef(
    'fridge_internal.guard_stock_item_current_product()'::regprocedure
  ) into v_stock_guard_definition;
  select pg_get_functiondef(
    'fridge_internal.guard_product_identifier_current_product()'::regprocedure
  ) into v_identifier_guard_definition;
  select pg_get_functiondef(
    'fridge_internal.guard_compatibility_current_product()'::regprocedure
  ) into v_compat_guard_definition;

  if position('assert_current_product_visible_to_household' in v_stock_guard_definition) = 0
     or position('assert_current_product_reference' in v_identifier_guard_definition) = 0
     or position('assert_current_product_reference' in v_compat_guard_definition) = 0 then
    raise exception 'current-reference guards must serialize through Product currentness helpers';
  end if;
end;
$$;

rollback;
