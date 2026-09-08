-- FridgeScanner BE-04 integrity proof
-- 000049__retire_compartment.sql

begin;

do $$
declare
  v_definition text;
  v_registry_constraint text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.retire_compartment(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute the narrow RetireCompartment boundary';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.retire_compartment(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.retire_compartment(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute RetireCompartment';
  end if;

  if has_table_privilege('fridge_app', 'fridge.compartment', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.compartment_retire_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.compartment_retire_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.compartment_retire_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.compartment_retire_command', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_topology_command_registry', 'DELETE') then
    raise exception 'RetireCompartment must not broaden direct runtime table privileges';
  end if;

  select pg_get_functiondef(
    'fridge_internal.retire_compartment(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_definition;

  if position('acquire_household_storage_admin_authority' in v_definition) = 0 then
    raise exception 'RetireCompartment must revalidate HOUSEHOLD_STORAGE_ADMINISTER in SQL';
  end if;

  if position('assert_storage_topology_command_intent' in v_definition) = 0
     or position('register_storage_topology_command_intent' in v_definition) = 0
     or position('RETIRE_COMPARTMENT' in v_definition) = 0 then
    raise exception 'RetireCompartment must participate in the shared topology CommandId registry';
  end if;

  if position('clock_timestamp()' in v_definition) = 0
     or position('statement_timestamp()' in v_definition) > 0 then
    raise exception 'RetireCompartment must use post-lock clock_timestamp() and never statement_timestamp()';
  end if;

  if position('compartment_retire_command' in v_definition) = 0 then
    raise exception 'RetireCompartment must bind durable command identity';
  end if;

  if position('STOCK_DEPENDENCY_CONFLICT' in v_definition) = 0
     or position('placement_anchor_kind = ''COMPARTMENT''' in v_definition) = 0 then
    raise exception 'RetireCompartment must explicitly guard current stock anchored to the target';
  end if;

  if position('delete from fridge.compartment' in lower(v_definition)) > 0
     or position('update fridge.stock_item' in lower(v_definition)) > 0
     or position('update fridge.storage_location' in lower(v_definition)) > 0 then
    raise exception 'RetireCompartment must preserve history and must not cascade or relocate dependents';
  end if;

  select pg_get_constraintdef(oid)
    into v_registry_constraint
    from pg_constraint
   where conrelid = 'fridge.storage_topology_command_registry'::regclass
     and conname = 'storage_topology_command_registry_intent_ck';

  if position('RETIRE_COMPARTMENT' in coalesce(v_registry_constraint, '')) = 0 then
    raise exception 'shared topology CommandId registry must recognize RETIRE_COMPARTMENT';
  end if;
end;
$$;

rollback;
