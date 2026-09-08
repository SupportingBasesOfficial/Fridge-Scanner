-- FridgeScanner BE-04 integrity proof
-- 000044__storage_topology_command_registry.sql

begin;

do $$
declare
  v_create_definition text;
  v_change_definition text;
  v_retire_definition text;
begin
  if has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'DELETE') then
    raise exception 'fridge_app must not access the topology CommandId registry directly';
  end if;

  if not has_function_privilege(
       'fridge_app',
       'fridge_internal.create_storage_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'fridge_app',
       'fridge_internal.change_storage_location_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'fridge_app',
       'fridge_internal.retire_storage_location(uuid,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'fridge_app must retain the canonical topology mutation entrypoints';
  end if;

  select pg_get_functiondef(
    'fridge_internal.create_storage_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure
  ) into v_create_definition;
  select pg_get_functiondef(
    'fridge_internal.change_storage_location_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure
  ) into v_change_definition;
  select pg_get_functiondef(
    'fridge_internal.retire_storage_location(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_retire_definition;

  if position('acquire_household_storage_admin_authority' in v_create_definition) = 0
     or position('assert_storage_topology_command_intent' in v_create_definition) = 0
     or position('register_storage_topology_command_intent' in v_create_definition) = 0 then
    raise exception 'CreateStorageLocation must authorize then enforce shared CommandId intent';
  end if;

  if position('acquire_household_storage_admin_authority' in v_change_definition) = 0
     or position('assert_storage_topology_command_intent' in v_change_definition) = 0
     or position('register_storage_topology_command_intent' in v_change_definition) = 0 then
    raise exception 'ChangeStorageLocationMetadata must authorize then enforce shared CommandId intent';
  end if;

  if position('acquire_household_storage_admin_authority' in v_retire_definition) = 0
     or position('assert_storage_topology_command_intent' in v_retire_definition) = 0
     or position('register_storage_topology_command_intent' in v_retire_definition) = 0 then
    raise exception 'RetireStorageLocation must authorize then enforce shared CommandId intent';
  end if;

  if position('storage_location_create_command' in v_create_definition) = 0
     or position('storage_location_metadata_change_command' in v_change_definition) = 0
     or position('storage_location_retire_command' in v_retire_definition) = 0 then
    raise exception 'canonical topology functions must remain self-contained over their accepted local command ledgers';
  end if;

  if exists (
    select 1
      from fridge.storage_topology_command_registry r
     group by r.household_id, r.command_id
    having count(distinct r.intent_code) > 1
  ) then
    raise exception 'topology CommandId registry contains cross-intent ambiguity';
  end if;
end;
$$;

rollback;
