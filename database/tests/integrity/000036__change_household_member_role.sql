-- FridgeScanner BE-03 integrity proof
-- 000036__change_household_member_role.sql

begin;

do $$
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.change_household_member_role(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute the governed role-change boundary';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.change_household_member_role(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.change_household_member_role(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute Household membership role change';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_membership', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_membership', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_membership', 'DELETE') then
    raise exception 'role change must not widen fridge_app direct membership DML';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_membership_role_change_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_membership_role_change_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_membership_role_change_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_membership_role_change_command', 'DELETE') then
    raise exception 'role-change command ledger must remain encapsulated from fridge_app';
  end if;
end;
$$;

rollback;
