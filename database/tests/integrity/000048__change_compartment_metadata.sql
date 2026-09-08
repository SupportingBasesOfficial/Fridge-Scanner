-- FridgeScanner BE-04 integrity proof
-- 000048__change_compartment_metadata.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.change_compartment_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute narrow ChangeCompartmentMetadata boundary';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.change_compartment_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.change_compartment_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute ChangeCompartmentMetadata';
  end if;

  if has_table_privilege('fridge_app', 'fridge.compartment', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.compartment_metadata_change_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.compartment_metadata_change_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.compartment_metadata_change_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'SELECT') then
    raise exception 'ChangeCompartmentMetadata must not broaden direct topology/ledger privileges';
  end if;

  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'fridge'
       and t.relname = 'storage_topology_command_registry'
       and c.conname = 'storage_topology_command_registry_intent_ck'
       and pg_get_constraintdef(c.oid) like '%CHANGE_COMPARTMENT_METADATA%'
  ) then
    raise exception 'shared topology CommandId registry must recognize CHANGE_COMPARTMENT_METADATA';
  end if;

  select pg_get_functiondef(
    'fridge_internal.change_compartment_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure
  ) into v_definition;

  if position('acquire_household_storage_admin_authority' in v_definition) = 0
     or position('assert_storage_topology_command_intent' in v_definition) = 0
     or position('register_storage_topology_command_intent' in v_definition) = 0 then
    raise exception 'ChangeCompartmentMetadata must authorize and enforce shared CommandId intent';
  end if;

  if position('from fridge.storage_location' in lower(v_definition)) = 0
     or position('from fridge.compartment' in lower(v_definition)) = 0
     or position('for update' in lower(v_definition)) = 0 then
    raise exception 'ChangeCompartmentMetadata must lock parent and child topology';
  end if;

  if position('sl.lifecycle_status = ''ACTIVE''' in v_definition) = 0
     or position('sl.retired_at is null' in lower(v_definition)) = 0
     or position('c.lifecycle_status = ''ACTIVE''' in v_definition) = 0
     or position('c.retired_at is null' in lower(v_definition)) = 0 then
    raise exception 'ChangeCompartmentMetadata must require current parent and current child';
  end if;

  if position('p_kind_code is not null' in lower(v_definition)) = 0
     or position('k.lifecycle_status = ''ACTIVE''' in v_definition) = 0 then
    raise exception 'nullable Compartment kind must be validated only when supplied and active';
  end if;

  if position('set kind_code = p_kind_code' in lower(v_definition)) = 0
     or position('storage_location_id =' in lower(v_definition)) = 0 then
    raise exception 'ChangeCompartmentMetadata must mutate metadata without reparenting';
  end if;
end;
$$;

rollback;
