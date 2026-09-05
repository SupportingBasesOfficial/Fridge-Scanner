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

create or replace function fridge_internal.household_role_has_capability(
  p_role_code text,
  p_capability_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
      from fridge.household_role r
      join fridge.household_role_capability rc
        on rc.role_code = r.role_code
      join fridge.household_capability c
        on c.capability_code = rc.capability_code
     where r.role_code = p_role_code
       and r.lifecycle_status = 'ACTIVE'
       and c.capability_code = p_capability_code
       and c.lifecycle_status = 'ACTIVE'
  );
$$;

comment on function fridge_internal.household_role_has_capability(text, text) is
  'Evaluates governed role capability without exposing role-string conventions to application code.';

revoke all on table fridge.household_capability from public;
revoke all on table fridge.household_role_capability from public;
revoke all on function fridge_internal.household_role_has_capability(text, text) from public;

-- Reference data is readable by runtime capabilities; direct mutation remains absent.
grant select on table fridge.household_capability
  to fridge_app, fridge_worker, fridge_readonly;
grant select on table fridge.household_role_capability
  to fridge_app, fridge_worker, fridge_readonly;

grant execute on function fridge_internal.household_role_has_capability(text, text)
  to fridge_app, fridge_worker, fridge_readonly;

commit;
