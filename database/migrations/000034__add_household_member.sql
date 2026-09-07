-- FridgeScanner BE-03
-- 000034__add_household_member.sql
-- Governed, history-preserving add/rejoin mutation for an existing platform principal.

begin;

create or replace function fridge_internal.add_household_member(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_membership_id uuid,
  p_target_user_id uuid,
  p_role_code text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_target_exists boolean;
  v_role_assignable boolean;
begin
  -- Household context is server-set inside the accepted transaction boundary.
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return 'UNAUTHORIZED';
  end if;

  -- Revalidate and lock the actor's stronger administration authority in this
  -- exact transaction. A TypeScript brand is never the only security boundary.
  v_actor_role_code := fridge_internal.acquire_household_membership_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return 'UNAUTHORIZED';
  end if;

  select true
    into v_target_exists
    from fridge.user_profile up
   where up.user_id = p_target_user_id
     and up.lifecycle_status = 'ACTIVE'
   for key share;

  select true
    into v_role_assignable
    from fridge.household_role r
   where r.role_code = p_role_code
     and r.lifecycle_status = 'ACTIVE'
     and r.is_assignable
   for share;

  -- Collapse target-existence and role-governance failure so this privileged
  -- surface is not useful as a global principal-existence oracle.
  if coalesce(v_target_exists, false) is false
     or coalesce(v_role_assignable, false) is false then
    return 'TARGET_OR_ROLE_INVALID';
  end if;

  begin
    insert into fridge.household_membership (
      membership_id,
      household_id,
      user_id,
      role_code,
      lifecycle_status,
      effective_from,
      effective_to,
      created_by_user_id
    )
    values (
      p_membership_id,
      p_household_id,
      p_target_user_id,
      p_role_code,
      'ACTIVE',
      statement_timestamp(),
      null,
      p_actor_user_id
    );
  exception
    when unique_violation then
      -- The accepted partial unique index remains the final concurrency barrier.
      -- Concurrent duplicate add/rejoin attempts therefore collapse to one
      -- current membership and one deterministic conflict outcome.
      return 'CURRENT_MEMBERSHIP_EXISTS';
  end;

  return 'ADDED';
end;
$$;

comment on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, text) is
  'BE-03 intent-specific add/rejoin mutation. Revalidates Household membership-administration authority, validates an active existing target principal and active assignable governed role, preserves prior history by inserting a new interval, and returns a provider-neutral outcome code.';

revoke all on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, text) from public;
grant execute on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;

commit;
