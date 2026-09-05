-- FridgeScanner BE-03 integrity proof
-- 000033__household_membership_capabilities.sql

begin;

do $$
begin
  if not exists (
    select 1
      from fridge.household_capability
     where capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
       and lifecycle_status = 'ACTIVE'
  ) then
    raise exception 'canonical Household membership administration capability is missing';
  end if;

  if exists (select 1 from fridge.household_role_capability) then
    raise exception 'BE-03 must not guess concrete Household role-to-capability mappings';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_capability', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_membership', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'DELETE') then
    raise exception 'fridge_app must not receive direct Household authority mutation/reference-table access';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.acquire_household_membership_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must be able to acquire governed Household membership administration authority';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.acquire_household_membership_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.acquire_household_membership_admin_authority(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly capabilities must not materialize membership administration authority';
  end if;
end;
$$;

rollback;
