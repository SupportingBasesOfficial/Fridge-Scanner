-- FridgeScanner BE-05 integrity proof
-- 000053__change_household_product_metadata.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.change_household_product_metadata(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute governed ChangeHouseholdProductMetadata';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.change_household_product_metadata(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.change_household_product_metadata(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute ChangeHouseholdProductMetadata';
  end if;

  if has_table_privilege('fridge_app', 'fridge.product', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_product_metadata_change_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_catalog_command_registry', 'SELECT') then
    raise exception 'runtime must not receive direct Product/ledger/registry mutation authority';
  end if;

  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'fridge'
       and t.relname = 'household_catalog_command_registry'
       and c.conname = 'household_catalog_command_registry_intent_ck'
       and pg_get_constraintdef(c.oid) like '%CHANGE_HOUSEHOLD_PRODUCT_METADATA%'
  ) then
    raise exception 'shared Household catalog registry must govern metadata-change intent';
  end if;

  select pg_get_functiondef(
    'fridge_internal.change_household_product_metadata(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid)'::regprocedure
  ) into v_definition;

  if position('acquire_household_catalog_admin_authority' in v_definition) = 0 then
    raise exception 'metadata change must reacquire Household catalog authority';
  end if;

  if position('''HOUSEHOLD''::fridge.catalog_scope' in v_definition) = 0
     or position('owner_household_id = p_household_id' in v_definition) = 0
     or position('lifecycle_status = ''ACTIVE''' in v_definition) = 0 then
    raise exception 'metadata change must target current same-Household private Product only';
  end if;

  if position('for update' in lower(v_definition)) = 0
     or position('for share' in lower(v_definition)) = 0 then
    raise exception 'metadata change must serialize Product and ACTIVE global reference decisions';
  end if;

  if position('brand_id = p_brand_id' in v_definition) = 0
     or position('manufacturer_id = p_manufacturer_id' in v_definition) = 0
     or position('product_category_id = p_product_category_id' in v_definition) = 0 then
    raise exception 'metadata change must update only governed metadata references';
  end if;

  if position('catalog_scope =' in v_definition) > position('update fridge.product' in v_definition)
     and position('set catalog_scope' in lower(v_definition)) > 0 then
    raise exception 'metadata change must not mutate Product scope';
  end if;
end;
$$;

rollback;
