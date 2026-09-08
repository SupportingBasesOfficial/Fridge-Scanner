-- FridgeScanner BE-04 integrity proof
-- 000043__retire_storage_location.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.retire_storage_location(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute the narrow RetireStorageLocation boundary';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.retire_storage_location(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.retire_storage_location(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute RetireStorageLocation';
  end if;

  if has_table_privilege('fridge_app', 'fridge.storage_location', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_location_retire_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.storage_location_retire_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.storage_location_retire_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_location_retire_command', 'DELETE') then
    raise exception 'RetireStorageLocation must not broaden direct runtime table privileges';
  end if;

  select pg_get_functiondef(
    'fridge_internal.retire_storage_location(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_definition;

  if position('acquire_household_storage_admin_authority' in v_definition) = 0 then
    raise exception 'RetireStorageLocation must revalidate HOUSEHOLD_STORAGE_ADMINISTER in SQL';
  end if;

  if position('clock_timestamp()' in v_definition) = 0
     or position('statement_timestamp()' in v_definition) > 0 then
    raise exception 'RetireStorageLocation must use post-lock clock_timestamp() and never statement_timestamp()';
  end if;

  if position('storage_location_retire_command' in v_definition) = 0 then
    raise exception 'RetireStorageLocation must bind durable command identity';
  end if;

  if position('ACTIVE_CHILD_CONFLICT' in v_definition) = 0
     or position('STOCK_DEPENDENCY_CONFLICT' in v_definition) = 0 then
    raise exception 'RetireStorageLocation must explicitly guard active child and stock dependencies';
  end if;

  if position('delete from fridge.storage_location' in lower(v_definition)) > 0
     or position('delete from fridge.compartment' in lower(v_definition)) > 0
     or position('update fridge.compartment' in lower(v_definition)) > 0
     or position('update fridge.stock_item' in lower(v_definition)) > 0 then
    raise exception 'RetireStorageLocation must preserve history and must not cascade or relocate dependents';
  end if;
end;
$$;

rollback;
