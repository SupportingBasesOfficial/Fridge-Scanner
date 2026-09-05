-- FridgeScanner BE-03
-- 000033__household_membership_capabilities.sql
-- Provider-neutral Household membership administration capability baseline.

begin;

create table fridge.household_capability (
  capability_code text primary key,
  description text not null,
  lifecycle_status text not null default 'ACTIVE',
  constraint household_capability_code_nonblank check (btrim(capability_code) <> ''),
  constraint household_capability_description_nonblank check (btrim(description) <> ''),
  constraint household_capability_status_nonblank check (btrim(lifecycle_status) <> '')
);

comment on table fridge.household_capability is
  'Governed provider-neutral Household authority capabilities. Capability meaning is canonical; concrete role assignments remain separately governed reference data.';

insert into fridge.household_capability (capability_code, description)
values (
  'HOUSEHOLD_MEMBERSHIP_ADMINISTER',
  'May administer current Household membership and Household-scoped role assignment under BE-03 mutation invariants.'
);

create table fridge.household_role_capability (
  role_code text not null,
  capability_code text not null,
  constraint household_role_capability_pk primary key (role_code, capability_code),
  constraint household_role_capability_role_fk
    foreign key (role_code)
    references fridge.household_role (role_code)
    on update restrict on delete restrict,
  constraint household_role_capability_capability_fk
    foreign key (capability_code)
    references fridge.household_capability (capability_code)
    on update restrict on delete restrict
);

comment on table fridge.household_role_capability is
  'Governed mapping from Household role reference data to provider-neutral capabilities. BE-03 does not seed concrete role mappings by convention.';

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
  v_role_code text;
begin
  -- The server-set Household context remains mandatory defense in depth. A
  -- caller cannot use this privileged function as a cross-Household oracle.
  if fridge_internal.current_household_id() is distinct from p_household_id then
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
  'Atomically revalidates and locks current actor membership plus governed membership-administration role/capability facts for the caller transaction. Returns the current role code only when authority is valid.';

revoke all on table fridge.household_capability from public;
revoke all on table fridge.household_role_capability from public;
revoke all on function fridge_internal.acquire_household_membership_admin_authority(uuid, uuid, uuid) from public;

-- Runtime receives only the narrow authority-acquisition capability. The
-- SECURITY DEFINER function owns the required row locks; fridge_app retains no
-- direct UPDATE privilege on membership or capability reference tables.
grant execute on function fridge_internal.acquire_household_membership_admin_authority(uuid, uuid, uuid)
  to fridge_app;

commit;
