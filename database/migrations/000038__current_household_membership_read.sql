-- FridgeScanner BE-03
-- 000038__current_household_membership_read.sql
-- Household-scoped provider-neutral current membership read model.

begin;

create or replace function fridge_internal.read_current_household_members(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid
)
returns table (
  membership_id uuid,
  user_id uuid,
  display_name text,
  role_code text,
  effective_from timestamptz,
  effective_to timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_membership uuid;
begin
  -- The server-set Household context remains mandatory defense in depth.
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return;
  end if;

  -- Revalidate the exact current membership carried by the verified application
  -- transaction. The privileged read boundary must not treat a caller-set GUC as
  -- sufficient Household authority.
  select hm.membership_id
    into v_actor_membership
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_actor_user_id
     and hm.membership_id = p_actor_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp());

  if v_actor_membership is null then
    return;
  end if;

  return query
  select hm.membership_id,
         hm.user_id,
         up.display_name,
         hm.role_code,
         hm.effective_from,
         hm.effective_to
    from fridge.household_membership hm
    join fridge.user_profile up
      on up.user_id = hm.user_id
   where hm.household_id = p_household_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp())
   order by hm.user_id, hm.membership_id;
end;
$$;

comment on function fridge_internal.read_current_household_members(uuid, uuid, uuid) is
  'Returns provider-neutral current Household membership observations only after revalidating the exact acting current membership. Provider identity metadata is deliberately absent and the result is observational, never mutation authority.';

revoke all on function fridge_internal.read_current_household_members(uuid, uuid, uuid) from public;
grant execute on function fridge_internal.read_current_household_members(uuid, uuid, uuid)
  to fridge_app;

commit;
