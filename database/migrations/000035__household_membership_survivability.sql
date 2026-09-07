-- FridgeScanner BE-03
-- 000035__household_membership_survivability.sql
-- Atomic last-administrator survivability guard for authority-reducing membership mutations.

begin;

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
  v_target_current_admin boolean := false;
  v_result_admin boolean := false;
  v_other_admin_membership_id uuid;
begin
  -- The caller transaction must already have installed the accepted server-side
  -- Household context. The guard must never become a cross-Household oracle.
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return false;
  end if;

  -- The Household row is the canonical serialization anchor for every BE-03
  -- mutation that can reduce membership-administration authority. Two competing
  -- demotions/ends therefore cannot both observe the other administrator before
  -- either write and produce write skew.
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
         hm.role_code,
         exists (
           select 1
             from fridge.household_role r
             join fridge.household_role_capability rc
               on rc.role_code = r.role_code
             join fridge.household_capability c
               on c.capability_code = rc.capability_code
            where r.role_code = hm.role_code
              and r.lifecycle_status = 'ACTIVE'
              and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
              and c.lifecycle_status = 'ACTIVE'
         )
    into v_target_user_id,
         v_target_role_code,
         v_target_current_admin
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

  -- Ending membership passes NULL. Role-change passes the post-state governed
  -- role and this guard asks only whether it retains the administration
  -- capability; assignability/current-role validity remain mutation concerns.
  if p_result_role_code is not null then
    select exists (
      select 1
        from fridge.household_role r
        join fridge.household_role_capability rc
          on rc.role_code = r.role_code
        join fridge.household_capability c
          on c.capability_code = rc.capability_code
       where r.role_code = p_result_role_code
         and r.lifecycle_status = 'ACTIVE'
         and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
         and c.lifecycle_status = 'ACTIVE'
    )
      into v_result_admin;
  end if;

  -- Mutations that do not reduce administration authority cannot violate the
  -- last-administrator invariant and therefore pass immediately.
  if not v_target_current_admin or v_result_admin then
    return true;
  end if;

  -- At this point the target currently administers membership and the requested
  -- result would remove that capability. Because the Household serialization
  -- anchor is held, any other authority-reducing mutation for this Household must
  -- wait. Lock one surviving current administrator as additional provenance and
  -- return true only if such a principal exists.
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
  'BE-03 internal survivability guard for authority-reducing membership mutations. Serializes on the Household row, locks the current target membership, and permits loss of HOUSEHOLD_MEMBERSHIP_ADMINISTER only when another current administrator remains.';

revoke all on function fridge_internal.household_membership_survivability_allows(uuid, uuid, text) from public;

-- Deliberately no fridge_app EXECUTE grant. Runtime must reach this guard only
-- through a future intent-specific SECURITY DEFINER role-change/end mutation,
-- never as a standalone authorization oracle.

commit;
