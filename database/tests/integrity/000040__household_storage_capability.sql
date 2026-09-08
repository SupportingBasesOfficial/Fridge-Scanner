-- FridgeScanner BE-04 integrity proof
-- 000040__household_storage_capability.sql

begin;

do $$
declare
  v_definition text;
begin
  if not exists (
    select 1
      from fridge.household_capability
     where capability_code = 'HOUSEHOLD_STORAGE_ADMINISTER'
       and lifecycle_status = 'ACTIVE'
  ) then
    raise exception 'canonical Household storage administration capability is missing';
  end if;

  if exists (
    select 1
      from fridge.household_role_capability
     where capability_code = 'HOUSEHOLD_STORAGE_ADMINISTER'
  ) then
    raise exception 'BE-04 must not guess concrete Household role-to-storage-capability mappings';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_capability', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'DELETE') then
    raise exception 'fridge_app must not receive direct Household storage authority reference-table access';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.acquire_household_storage_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must be able to acquire governed Household storage administration authority';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.acquire_household_storage_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.acquire_household_storage_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly capabilities must not materialize storage administration authority';
  end if;

  select pg_get_functiondef(
    'fridge_internal.acquire_household_storage_admin_authority(uuid,uuid,uuid)'::regprocedure
  ) into v_definition;

  if position('clock_timestamp()' in v_definition) = 0 then
    raise exception 'storage administration authority must explicitly sample post-lock database time';
  end if;

  if position('statement_timestamp()' in v_definition) > 0 then
    raise exception 'storage administration authority must not use pre-serialization statement_timestamp()';
  end if;
end;
$$;

rollback;
