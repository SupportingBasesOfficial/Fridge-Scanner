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
  v_observed_at timestamptz;
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

  v_observed_at := clock_timestamp();

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
     and hm.effective_from <= v_observed_at
     and (hm.effective_to is null or hm.effective_to > v_observed_at)
     and r.lifecycle_status = 'ACTIVE'
     and c.capability_code = 'HOUSEHOLD_CATALOG_ADMINISTER'
     and c.lifecycle_status = 'ACTIVE'
   for update of hm
   for share of r, rc, c;

  return v_role_code;
end;
$$;

comment on function fridge_internal.acquire_household_catalog_admin_authority(uuid, uuid, uuid) is
  'Atomically serializes on the Household, samples post-lock authority time, and revalidates the exact current actor membership plus governed HOUSEHOLD_CATALOG_ADMINISTER role/capability facts. Returns the current role code only when Household catalog administration authority is valid.';

revoke all on function fridge_internal.acquire_household_catalog_admin_authority(uuid, uuid, uuid)
  from public;

grant execute on function fridge_internal.acquire_household_catalog_admin_authority(uuid, uuid, uuid)
  to fridge_app;

commit;
