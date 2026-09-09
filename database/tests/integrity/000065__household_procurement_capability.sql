-- FridgeScanner BE-06 integrity proof
-- 000065__household_procurement_capability.sql

begin;

do $$
declare
  v_definition text;
  v_time_position integer;
  v_last_authority_lock_position integer;
begin
  if not exists (
    select 1
      from fridge.household_capability
     where capability_code = 'HOUSEHOLD_PROCUREMENT_ADMINISTER'
       and lifecycle_status = 'ACTIVE'
  ) then
    raise exception 'canonical Household procurement administration capability is missing';
  end if;

  if exists (
    select 1
      from fridge.household_role_capability
     where capability_code = 'HOUSEHOLD_PROCUREMENT_ADMINISTER'
  ) then
    raise exception 'BE-06 must not guess concrete Household role-to-procurement-capability mappings';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_capability', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'DELETE') then
    raise exception 'fridge_app must not receive direct procurement authority reference-table access';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.acquire_household_procurement_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must be able to acquire governed Household procurement administration authority';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.acquire_household_procurement_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.acquire_household_procurement_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly capabilities must not materialize procurement administration authority';
  end if;

  select pg_get_functiondef(
    'fridge_internal.acquire_household_procurement_admin_authority(uuid,uuid,uuid)'::regprocedure
  ) into v_definition;

  v_time_position := position('v_observed_at := clock_timestamp()' in v_definition);
  v_last_authority_lock_position := position('if v_capability_locked is null then' in v_definition);

  if v_time_position = 0 then
    raise exception 'procurement administration authority must explicitly sample post-lock database time';
  end if;

  if v_last_authority_lock_position = 0
     or v_time_position <= v_last_authority_lock_position then
    raise exception 'procurement administration authority must sample current time only after role/mapping/capability lock waits';
  end if;

  if position('statement_timestamp()' in v_definition) > 0 then
    raise exception 'procurement administration authority must not use pre-serialization statement_timestamp()';
  end if;

  if position('HOUSEHOLD_PROCUREMENT_ADMINISTER' in v_definition) = 0 then
    raise exception 'procurement administration authority function must revalidate the canonical capability';
  end if;
end;
$$;

rollback;
