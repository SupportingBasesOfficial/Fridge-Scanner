-- FridgeScanner BE-03 integrity proof
-- 000035__household_membership_survivability.sql

begin;

do $$
begin
  if has_function_privilege(
    'fridge_app',
    'fridge_internal.household_membership_survivability_allows(uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.household_membership_survivability_allows(uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.household_membership_survivability_allows(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'runtime capability roles must not execute the internal membership survivability guard directly';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_membership', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_role_capability', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_capability', 'SELECT') then
    raise exception 'survivability kernel must not widen fridge_app direct mutation/capability visibility';
  end if;
end;
$$;

rollback;
