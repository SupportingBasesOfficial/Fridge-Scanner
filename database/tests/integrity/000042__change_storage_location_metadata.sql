-- FridgeScanner BE-04 integrity proof
-- 000042__change_storage_location_metadata.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.change_storage_location_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute the narrow ChangeStorageLocationMetadata boundary';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.change_storage_location_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.change_storage_location_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute ChangeStorageLocationMetadata';
  end if;

  if has_table_privilege('fridge_app', 'fridge.storage_location', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_location_metadata_change_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.storage_location_metadata_change_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.storage_location_metadata_change_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_location_metadata_change_command', 'DELETE') then
    raise exception 'ChangeStorageLocationMetadata must not broaden direct runtime table privileges';
  end if;

  select pg_get_functiondef(
    'fridge_internal.change_storage_location_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure
  ) into v_definition;

  if position('acquire_household_storage_admin_authority' in v_definition) = 0 then
    raise exception 'ChangeStorageLocationMetadata must revalidate HOUSEHOLD_STORAGE_ADMINISTER in SQL';
  end if;

  if position('statement_timestamp()' in v_definition) > 0 then
    raise exception 'ChangeStorageLocationMetadata must not use pre-serialization statement_timestamp()';
  end if;

  if position('storage_location_metadata_change_command' in v_definition) = 0 then
    raise exception 'ChangeStorageLocationMetadata must bind durable command identity';
  end if;

  if position('set household_id' in lower(v_definition)) > 0
     or position('set storage_location_id' in lower(v_definition)) > 0 then
    raise exception 'ChangeStorageLocationMetadata must never rewrite topology identity/ownership';
  end if;
end;
$$;

rollback;
