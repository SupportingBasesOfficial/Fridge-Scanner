-- FridgeScanner BE-03 integrity proof
-- 000037__end_household_membership.sql

begin;

do $$
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.end_household_membership(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute governed administrative membership end';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.leave_household(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute governed self-leave';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.replay_household_self_leave(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute narrow committed self-leave replay';
  end if;

  if has_function_privilege(
       'fridge_app',
       'fridge_internal.end_household_membership_core(uuid,uuid,uuid,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_worker',
       'fridge_internal.end_household_membership(uuid,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_worker',
       'fridge_internal.leave_household(uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_worker',
       'fridge_internal.replay_household_self_leave(uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.end_household_membership(uuid,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.leave_household(uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.replay_household_self_leave(uuid,uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'membership-end authority must remain intent-specific and least-privileged';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_membership_end_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_membership_end_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_membership_end_command', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_membership_end_command', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.household_membership', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.household_membership', 'DELETE') then
    raise exception 'fridge_app must not gain direct membership or command-ledger mutation authority';
  end if;
end;
$$;

rollback;
