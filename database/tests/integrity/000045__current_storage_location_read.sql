-- FridgeScanner BE-04 integrity proof
-- 000045__current_storage_location_read.sql

begin;

do $$
declare
  v_list_definition text;
  v_get_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.list_current_storage_locations(uuid,uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_app',
    'fridge_internal.get_current_storage_location(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute narrow current StorageLocation read boundaries';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.list_current_storage_locations(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.list_current_storage_locations(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.get_current_storage_location(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.get_current_storage_location(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not bypass application Household authorization for topology reads';
  end if;

  if has_table_privilege('fridge_app', 'fridge.storage_location', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.storage_location', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.storage_location', 'DELETE') then
    raise exception 'current StorageLocation reads must not broaden runtime mutation privileges';
  end if;

  select pg_get_functiondef(
    'fridge_internal.list_current_storage_locations(uuid,uuid,uuid)'::regprocedure
  ) into v_list_definition;
  select pg_get_functiondef(
    'fridge_internal.get_current_storage_location(uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_get_definition;

  if position('membership_id = p_actor_membership_id' in v_list_definition) = 0
     or position('membership_id = p_actor_membership_id' in v_get_definition) = 0 then
    raise exception 'current topology reads must revalidate the exact actor membership';
  end if;

  if position('lifecycle_status = ''ACTIVE''' in v_list_definition) = 0
     or position('retired_at is null' in lower(v_list_definition)) = 0
     or position('lifecycle_status = ''ACTIVE''' in v_get_definition) = 0
     or position('retired_at is null' in lower(v_get_definition)) = 0 then
    raise exception 'current topology reads must expose active non-retired StorageLocations only';
  end if;

  if position('order by sl.sort_order nulls last, sl.storage_location_id' in lower(v_list_definition)) = 0 then
    raise exception 'StorageLocation list must use stable presentation ordering with identity tiebreaker';
  end if;
end;
$$;

rollback;
