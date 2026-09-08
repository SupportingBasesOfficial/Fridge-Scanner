-- FridgeScanner BE-04 integrity proof
-- 000041__create_storage_location.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_storage_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute the narrow CreateStorageLocation boundary';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.create_storage_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.create_storage_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute CreateStorageLocation';
  end if;

  if has_table_privilege('fridge_app', 'fridge.storage_location', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.storage_location', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_location', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.storage_location_create_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.storage_location_create_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.storage_location_create_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_location_create_command', 'DELETE') then
    raise exception 'CreateStorageLocation must not broaden direct runtime table privileges';
  end if;

  select pg_get_functiondef(
    'fridge_internal.create_storage_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure
  ) into v_definition;

  if position('acquire_household_storage_admin_authority' in v_definition) = 0 then
    raise exception 'CreateStorageLocation must revalidate HOUSEHOLD_STORAGE_ADMINISTER in SQL';
  end if;

  if position('clock_timestamp()' in v_definition) = 0 then
    raise exception 'CreateStorageLocation must sample post-lock database time';
  end if;

  if position('statement_timestamp()' in v_definition) > 0 then
    raise exception 'CreateStorageLocation must not use pre-serialization statement_timestamp()';
  end if;

  if position('storage_location_create_command' in v_definition) = 0 then
    raise exception 'CreateStorageLocation must bind durable command identity';
  end if;
end;
$$;

rollback;
