-- FridgeScanner BE-04 integrity proof
-- 000047__create_compartment.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_compartment(uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute narrow CreateCompartment boundary';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.create_compartment(uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.create_compartment(uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute CreateCompartment';
  end if;

  if has_table_privilege('fridge_app', 'fridge.compartment', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.compartment', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.compartment', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.compartment_create_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.compartment_create_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.compartment_create_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'SELECT') then
    raise exception 'CreateCompartment must not broaden direct topology/ledger privileges';
  end if;

  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'fridge'
       and t.relname = 'storage_topology_command_registry'
       and c.conname = 'storage_topology_command_registry_intent_ck'
       and pg_get_constraintdef(c.oid) like '%CREATE_COMPARTMENT%'
  ) then
    raise exception 'shared topology CommandId registry must recognize CREATE_COMPARTMENT';
  end if;

  select pg_get_functiondef(
    'fridge_internal.create_compartment(uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure
  ) into v_definition;

  if position('acquire_household_storage_admin_authority' in v_definition) = 0
     or position('assert_storage_topology_command_intent' in v_definition) = 0
     or position('register_storage_topology_command_intent' in v_definition) = 0 then
    raise exception 'CreateCompartment must revalidate storage authority and bind shared command intent';
  end if;

  if position('for update' in lower(v_definition)) = 0
     or position('sl.lifecycle_status = ''ACTIVE''' in v_definition) = 0
     or position('sl.retired_at is null' in lower(v_definition)) = 0 then
    raise exception 'CreateCompartment must lock and require a current active parent StorageLocation';
  end if;

  if position('clock_timestamp()' in v_definition) = 0
     or position('statement_timestamp()' in v_definition) > 0 then
    raise exception 'CreateCompartment current-state time must be fresh post-lock database time';
  end if;

  if position('p_kind_code is not null' in lower(v_definition)) = 0
     or position('k.lifecycle_status = ''ACTIVE''' in v_definition) = 0 then
    raise exception 'optional Compartment kind must be validated only when supplied and must be active';
  end if;
end;
$$;

rollback;
