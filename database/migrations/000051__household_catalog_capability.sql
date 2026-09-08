-- FridgeScanner BE-05
-- 000051__household_catalog_capability.sql
-- Provider-neutral Household catalog administration capability baseline.

begin;

insert into fridge.household_capability (capability_code, description)
values (
  'HOUSEHOLD_CATALOG_ADMINISTER',
  'May administer current Household-owned catalog entities under BE-05 scope, lifecycle, tenancy and concurrency invariants.'
);

create or replace function fridge_internal.acquire_household_catalog_admin_authority(
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
  v_effective_from timestamptz;
  v_effective_to timestamptz;
  v_role_locked text;
  v_mapping_locked text;
  v_capability_locked text;
  v_observed_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return null;
  end if;

  -- Household remains the first serialization anchor for Household-scoped
  -- catalog authority.
  select h.household_id
    into v_household_locked
    from fridge.household h
   where h.household_id = p_household_id
   for update;

  if v_household_locked is null then
    return null;
  end if;

  -- Lock the exact actor membership before reading its temporal interval.
  -- Do not evaluate effective time yet: later governance-row lock waits must
  -- also complete before current time is sampled.
  select hm.role_code, hm.effective_from, hm.effective_to
    into v_role_code, v_effective_from, v_effective_to
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_user_id
     and hm.membership_id = p_membership_id
     and hm.lifecycle_status = 'ACTIVE'
   for update;

  if v_role_code is null then
    return null;
  end if;

  -- Lock every governance row whose current state participates in the
  -- authority decision. Any wait on these rows must finish before the fresh
  -- temporal observation below.
  select r.role_code
    into v_role_locked
    from fridge.household_role r
   where r.role_code = v_role_code
     and r.lifecycle_status = 'ACTIVE'
   for share;

  if v_role_locked is null then
    return null;
  end if;

  select rc.role_code
    into v_mapping_locked
    from fridge.household_role_capability rc
   where rc.role_code = v_role_code
     and rc.capability_code = 'HOUSEHOLD_CATALOG_ADMINISTER'
   for share;

  if v_mapping_locked is null then
    return null;
  end if;

  select c.capability_code
    into v_capability_locked
    from fridge.household_capability c
   where c.capability_code = 'HOUSEHOLD_CATALOG_ADMINISTER'
     and c.lifecycle_status = 'ACTIVE'
   for share;

  if v_capability_locked is null then
    return null;
  end if;

  -- B5-032: sample current time only after every required serialization wait.
  v_observed_at := clock_timestamp();

  if v_effective_from > v_observed_at
     or (v_effective_to is not null and v_effective_to <= v_observed_at) then
    return null;
  end if;

  return v_role_code;
end;
$$;

comment on function fridge_internal.acquire_household_catalog_admin_authority(uuid, uuid, uuid) is
  'Atomically serializes on the Household and all authority governance rows, samples fresh post-wait database time, then revalidates the exact current actor membership plus governed HOUSEHOLD_CATALOG_ADMINISTER role/capability facts. Returns the current role code only when Household catalog administration authority is valid.';

revoke all on function fridge_internal.acquire_household_catalog_admin_authority(uuid, uuid, uuid)
  from public;

grant execute on function fridge_internal.acquire_household_catalog_admin_authority(uuid, uuid, uuid)
  to fridge_app;

commit;
