-- FridgeScanner BE-04 integrity proof
-- 000046__current_compartment_read.sql

begin;

do $$
declare
  v_list_definition text;
  v_get_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.list_current_compartments(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_app',
    'fridge_internal.get_current_compartment(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute narrow current Compartment read boundaries';
  end if;

  if has_function_privilege('fridge_worker', 'fridge_internal.list_current_compartments(uuid,uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('fridge_readonly', 'fridge_internal.list_current_compartments(uuid,uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('fridge_worker', 'fridge_internal.get_current_compartment(uuid,uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('fridge_readonly', 'fridge_internal.get_current_compartment(uuid,uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'worker/readonly must not bypass application Household authorization for Compartment reads';
  end if;

  if has_table_privilege('fridge_app', 'fridge.compartment', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.compartment', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.compartment', 'DELETE') then
    raise exception 'current Compartment reads must not broaden runtime mutation privileges';
  end if;

  select lower(pg_get_functiondef(
    'fridge_internal.list_current_compartments(uuid,uuid,uuid,uuid)'::regprocedure
  )) into v_list_definition;
  select lower(pg_get_functiondef(
    'fridge_internal.get_current_compartment(uuid,uuid,uuid,uuid)'::regprocedure
  )) into v_get_definition;

  if position('membership_id = p_actor_membership_id' in v_list_definition) = 0
     or position('membership_id = p_actor_membership_id' in v_get_definition) = 0 then
    raise exception 'current Compartment reads must revalidate the exact actor membership';
  end if;

  if position('c.lifecycle_status = ''active''' in v_list_definition) = 0
     or position('c.retired_at is null' in v_list_definition) = 0
     or position('c.lifecycle_status = ''active''' in v_get_definition) = 0
     or position('c.retired_at is null' in v_get_definition) = 0 then
    raise exception 'current Compartment reads must expose active non-retired Compartments only';
  end if;

  if position('sl.lifecycle_status = ''active''' in v_list_definition) = 0
     or position('sl.retired_at is null' in v_list_definition) = 0
     or position('sl.lifecycle_status = ''active''' in v_get_definition) = 0
     or position('sl.retired_at is null' in v_get_definition) = 0 then
    raise exception 'current Compartment reads must require a current active parent StorageLocation';
  end if;

  if position('order by c.sort_order nulls last, c.compartment_id' in v_list_definition) = 0 then
    raise exception 'Compartment list must use stable presentation ordering with identity tiebreaker';
  end if;
end;
$$;

rollback;
