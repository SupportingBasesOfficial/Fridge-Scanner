-- FridgeScanner BE-03 integrity proof
-- 000038__current_household_membership_read.sql

begin;

do $$
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.read_current_household_members(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute governed current Household membership read';
  end if;

  if has_function_privilege(
       'fridge_worker',
       'fridge_internal.read_current_household_members(uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.read_current_household_members(uuid,uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'membership read boundary must remain app-specific and not widen worker/readonly authority';
  end if;

  if has_table_privilege('fridge_app', 'fridge.user_profile', 'SELECT') then
    raise exception 'membership read model must not widen fridge_app to direct user_profile SELECT';
  end if;
end;
$$;

rollback;
