-- FridgeScanner BE-03
-- 000035__household_membership_survivability.sql
-- Atomic last-administrator survivability guard and canonical BE-03 lock ordering.

begin;

-- Upgrade the accepted administration-authority acquisition boundary so every
-- membership-administration transaction serializes on the Household row before
-- locking actor membership or capability facts. This establishes the canonical
-- BE-03 lock order:
--
--   Household -> actor membership/governance -> target membership/governance
--
-- and prevents reciprocal administrator mutations from forming actor/target
-- deadlock cycles around the survivability guard.
create or replace function fridge_internal.acquire_household_membership_admin_authority(
  p_household_id uuid,
  p_user_id uuid,
  p_membership_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_household_locked uuid;
  v_role_code text;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return null;
  end if;

  select h.household_id
    into v_household_locked
    from fridge.household h
   where h.household_id = p_household_id
   for update;

  if v_household_locked is null then
    return null;
  end if;

  select hm.role_code
    into v_role_code
    from fridge.household_membership hm
    join fridge.household_role r
      on r.role_code = hm.role_code
    join fridge.household_role_capability rc
      on rc.role_code = r.role_code
    join fridge.household_capability c
      on c.capability_code = rc.capability_code
   where hm.household_id = p_household_id
     and hm.user_id = p_user_id
     and hm.membership_id = p_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp())
     and r.lifecycle_status = 'ACTIVE'
     and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
     and c.lifecycle_status = 'ACTIVE'
   for update of hm
   for share of r, rc, c;

  return v_role_code;
end;
$$;

comment on function fridge_internal.acquire_household_membership_admin_authority(uuid, uuid, uuid) is
  'Atomically revalidates current membership-administration authority using canonical BE-03 lock order: Household row first, then actor membership and governed role/capability facts. The Household lock is retained for the transaction.';

create or replace function fridge_internal.household_membership_survivability_allows(
  p_household_id uuid,
  p_target_membership_id uuid,
  p_result_role_code text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_household_locked uuid;
  v_target_user_id uuid;
  v_target_role_code text;
  v_target_admin_capability text;
  v_result_admin_capability text;
  v_other_admin_membership_id uuid;
begin
  -- The caller transaction must already have installed the accepted server-side
  -- Household context. The guard must never become a cross-Household oracle.
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return false;
  end if;

  -- Reacquiring a row lock already held by authority acquisition is harmless and
  -- keeps this helper safe when exercised internally in isolation by privileged
  -- database code/tests. Future runtime mutations reach this only after the same
  -- Household-first authority acquisition boundary above.
  select h.household_id
    into v_household_locked
    from fridge.household h
   where h.household_id = p_household_id
   for update;

  if v_household_locked is null then
    return false;
  end if;

  -- Resolve and lock the exact current target membership under the same
  -- transaction. Callers remain responsible for their own intent-specific
  -- target-state validation; this helper only determines survivability impact.
  select hm.user_id,
         hm.role_code
    into v_target_user_id,
         v_target_role_code
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.membership_id = p_target_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp())
   for update;

  -- A missing/non-current target is not a survivability reduction by itself.
  -- The surrounding mutation must still fail its own target-state contract.
  if v_target_user_id is null then
    return true;
  end if;

  -- Determine whether the current target role carries the governed membership-
  -- administration capability and lock those exact governance facts through the
  -- transaction so the survivability decision cannot become stale underneath it.
  select c.capability_code
    into v_target_admin_capability
    from fridge.household_role r
    join fridge.household_role_capability rc
      on rc.role_code = r.role_code
    join fridge.household_capability c
      on c.capability_code = rc.capability_code
   where r.role_code = v_target_role_code
     and r.lifecycle_status = 'ACTIVE'
     and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
     and c.lifecycle_status = 'ACTIVE'
   limit 1
   for share of r, rc, c;

  -- Ending membership passes NULL. Role-change passes the post-state governed
  -- role. If that role retains administration capability, lock those governance
  -- facts as well. Assignability and other role validity remain mutation concerns.
  if p_result_role_code is not null then
    select c.capability_code
      into v_result_admin_capability
      from fridge.household_role r
      join fridge.household_role_capability rc
        on rc.role_code = r.role_code
      join fridge.household_capability c
        on c.capability_code = rc.capability_code
     where r.role_code = p_result_role_code
       and r.lifecycle_status = 'ACTIVE'
       and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
       and c.lifecycle_status = 'ACTIVE'
     limit 1
     for share of r, rc, c;
  end if;

  -- Mutations that do not reduce administration authority cannot violate the
  -- last-administrator invariant and therefore pass immediately.
  if v_target_admin_capability is null or v_result_admin_capability is not null then
    return true;
  end if;

  -- At this point the target currently administers membership and the requested
  -- result would remove that capability. Because the Household serialization
  -- anchor is held, any other authority-reducing mutation for this Household must
  -- wait. Lock one surviving current administrator plus its governance facts and
  -- return true only if such authority exists.
  select hm.membership_id
    into v_other_admin_membership_id
    from fridge.household_membership hm
    join fridge.household_role r
      on r.role_code = hm.role_code
    join fridge.household_role_capability rc
      on rc.role_code = r.role_code
    join fridge.household_capability c
      on c.capability_code = rc.capability_code
   where hm.household_id = p_household_id
     and hm.membership_id <> p_target_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp())
     and r.lifecycle_status = 'ACTIVE'
     and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
     and c.lifecycle_status = 'ACTIVE'
   order by hm.membership_id
   limit 1
   for share of hm, r, rc, c;

  return v_other_admin_membership_id is not null;
end;
$$;

comment on function fridge_internal.household_membership_survivability_allows(uuid, uuid, text) is
  'BE-03 internal survivability guard for authority-reducing membership mutations. Under the canonical Household-first lock order, locks the current target membership and governed capability facts and permits loss of HOUSEHOLD_MEMBERSHIP_ADMINISTER only when another current administrator remains.';

revoke all on function fridge_internal.household_membership_survivability_allows(uuid, uuid, text) from public;

-- Preserve the already-accepted runtime privilege on the authority acquisition
-- boundary; the survivability helper itself remains internal-only.
grant execute on function fridge_internal.acquire_household_membership_admin_authority(uuid, uuid, uuid)
  to fridge_app;

-- Deliberately no fridge_app EXECUTE grant on survivability. Runtime must reach
-- it only through a future intent-specific SECURITY DEFINER role-change/end
-- mutation, never as a standalone authorization oracle.

commit;
