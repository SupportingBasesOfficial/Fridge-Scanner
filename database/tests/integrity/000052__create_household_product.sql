-- FridgeScanner BE-05 integrity proof
-- 000052__create_household_product.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_product(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must be able to execute governed CreateHouseholdProduct';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.create_household_product(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.create_household_product(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute CreateHouseholdProduct';
  end if;

  if has_table_privilege('fridge_app', 'fridge.product', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.product', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.product', 'DELETE') then
    raise exception 'fridge_app must not receive direct Product mutation privilege';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_product_create_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_product_create_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_catalog_command_registry', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_catalog_command_registry', 'INSERT') then
    raise exception 'fridge_app must not receive direct command-ledger or catalog-registry access';
  end if;

  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'fridge'
       and t.relname = 'household_catalog_command_registry'
       and c.conname = 'household_catalog_command_registry_intent_ck'
       and pg_get_constraintdef(c.oid) like '%CREATE_HOUSEHOLD_PRODUCT%'
  ) then
    raise exception 'shared Household catalog registry must govern CREATE_HOUSEHOLD_PRODUCT';
  end if;

  select pg_get_functiondef(
    'fridge_internal.create_household_product(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
  ) into v_definition;

  if position('acquire_household_catalog_admin_authority' in v_definition) = 0 then
    raise exception 'CreateHouseholdProduct must reacquire Household catalog authority';
  end if;

  if position('assert_household_catalog_command_intent' in v_definition) = 0
     or position('register_household_catalog_command_intent' in v_definition) = 0 then
    raise exception 'CreateHouseholdProduct must participate in shared Household catalog CommandId governance';
  end if;

  if position('''CREATE_HOUSEHOLD_PRODUCT''' in v_definition) = 0 then
    raise exception 'CreateHouseholdProduct must bind the canonical intent code';
  end if;

  if position('''HOUSEHOLD''::fridge.catalog_scope' in v_definition) = 0
     or position('p_household_id' in v_definition) = 0 then
    raise exception 'CreateHouseholdProduct must force HOUSEHOLD scope and authoritative owner Household';
  end if;

  if position('brand_id' in v_definition) = 0
     or position('manufacturer_id' in v_definition) = 0
     or position('product_category_id' in v_definition) = 0 then
    raise exception 'CreateHouseholdProduct must explicitly keep deferred optional reference metadata out of this slice';
  end if;

  if position('clock_timestamp()' in v_definition) = 0
     or position('statement_timestamp()' in v_definition) > 0 then
    raise exception 'CreateHouseholdProduct must use fresh post-serialization database time';
  end if;
end;
$$;

rollback;
