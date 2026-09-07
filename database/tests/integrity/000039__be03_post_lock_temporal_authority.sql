-- FridgeScanner BE-03 integrity proof
-- 000039__be03_post_lock_temporal_authority.sql

begin;

do $$
declare
  v_definition text;
  v_signature regprocedure;
  v_signatures constant text[] := array[
    'fridge_internal.acquire_household_membership_admin_authority(uuid,uuid,uuid)',
    'fridge_internal.household_membership_survivability_allows(uuid,uuid,text)',
    'fridge_internal.add_household_member(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'fridge_internal.change_household_member_role(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'fridge_internal.end_household_membership_core(uuid,uuid,uuid,uuid,text)',
    'fridge_internal.leave_household(uuid,uuid,uuid,uuid)'
  ];
begin
  foreach v_signature in array v_signatures loop
    select pg_get_functiondef(v_signature)
      into v_definition;

    if position('statement_timestamp()' in v_definition) > 0 then
      raise exception '% must not use pre-serialization statement_timestamp()', v_signature;
    end if;

    if position('clock_timestamp()' in v_definition) = 0 then
      raise exception '% must explicitly sample post-lock database time', v_signature;
    end if;
  end loop;

  if has_function_privilege(
       'fridge_app',
       'fridge_internal.household_membership_survivability_allows(uuid,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_app',
       'fridge_internal.end_household_membership_core(uuid,uuid,uuid,uuid,text)',
       'EXECUTE'
     ) then
    raise exception 'temporal hardening must not widen internal helper execution authority';
  end if;
end;
$$;

rollback;
