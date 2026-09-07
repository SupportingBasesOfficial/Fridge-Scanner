-- FridgeScanner BE-03 integrity proof
-- 000034__add_household_member.sql

begin;

do $$
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.add_household_member(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must be able to execute the governed add Household member mutation';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.add_household_member(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.add_household_member(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly capabilities must not mutate Household membership';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_membership', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_membership', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_membership', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.household_membership_add_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_membership_add_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_membership_add_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_membership_add_command', 'DELETE') then
    raise exception 'fridge_app must not receive direct Household membership or command-ledger access';
  end if;
end;
$$;

rollback;
