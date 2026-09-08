-- FridgeScanner BE-04
-- 000048__change_compartment_metadata.sql
-- Governed, idempotent metadata mutation for one current Compartment.

begin;

alter table fridge.storage_topology_command_registry
  drop constraint storage_topology_command_registry_intent_ck;

alter table fridge.storage_topology_command_registry
  add constraint storage_topology_command_registry_intent_ck
  check (intent_code in (
    'CREATE_STORAGE_LOCATION',
    'CHANGE_STORAGE_LOCATION_METADATA',
    'RETIRE_STORAGE_LOCATION',
    'CREATE_COMPARTMENT',
    'CHANGE_COMPARTMENT_METADATA'
  ));

create table fridge.compartment_metadata_change_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  compartment_id uuid not null,
  kind_code text,
  display_name text not null,
  sort_order integer,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint compartment_metadata_change_command_pk primary key (household_id, command_id),
  constraint compartment_metadata_change_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint compartment_metadata_change_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint compartment_metadata_change_command_target_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint compartment_metadata_change_command_kind_fk
    foreign key (kind_code) references fridge.compartment_kind (kind_code)
    on update restrict on delete restrict,
  constraint compartment_metadata_change_command_name_nonblank check (btrim(display_name) <> ''),
  constraint compartment_metadata_change_command_outcome_ck check (outcome_code = 'CHANGED')
);

comment on table fridge.compartment_metadata_change_command is
  'Durable BE-04 ChangeCompartmentMetadata command identity. Parent and Household identity remain immutable; committed replay never reapplies metadata or restores later state.';

create or replace function fridge_internal.change_compartment_metadata(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_compartment_id uuid,
  p_kind_code text,
  p_display_name text,
  p_sort_order integer
)
returns table (
  outcome_code text,
  result_compartment_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_existing_actor_user_id uuid;
  v_existing_compartment_id uuid;
  v_existing_kind_code text;
  v_existing_display_name text;
  v_existing_sort_order integer;
  v_existing_outcome_code text;
  v_parent_id uuid;
  v_locked_parent_id uuid;
  v_locked_compartment_id uuid;
  v_kind_active boolean;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_storage_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_storage_topology_command_intent(
    p_household_id,
    p_command_id,
    'CHANGE_COMPARTMENT_METADATA'
  );

  -- Resolve committed replay before validating current target/parent/kind state.
  select c.actor_user_id,
         c.compartment_id,
         c.kind_code,
         c.display_name,
         c.sort_order,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_compartment_id,
         v_existing_kind_code,
         v_existing_display_name,
         v_existing_sort_order,
         v_existing_outcome_code
    from fridge.compartment_metadata_change_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_compartment_id is distinct from p_compartment_id
       or v_existing_kind_code is distinct from p_kind_code
       or v_existing_display_name is distinct from p_display_name
       or v_existing_sort_order is distinct from p_sort_order then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CHANGED' then
      perform fridge_internal.register_storage_topology_command_intent(
        p_household_id,
        p_command_id,
        'CHANGE_COMPARTMENT_METADATA'
      );
      return query select 'CHANGED'::text, v_existing_compartment_id;
      return;
    end if;

    raise exception 'unexpected Compartment metadata-change command state';
  end if;

  -- Parent is immutable in BE-04, so it may be discovered before locks solely
  -- to preserve canonical Household -> StorageLocation -> Compartment order.
  select c.storage_location_id
    into v_parent_id
    from fridge.compartment c
   where c.household_id = p_household_id
     and c.compartment_id = p_compartment_id;

  if v_parent_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  select sl.storage_location_id
    into v_locked_parent_id
    from fridge.storage_location sl
   where sl.household_id = p_household_id
     and sl.storage_location_id = v_parent_id
     and sl.lifecycle_status = 'ACTIVE'
     and sl.retired_at is null
   for update;

  if v_locked_parent_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  select c.compartment_id
    into v_locked_compartment_id
    from fridge.compartment c
   where c.household_id = p_household_id
     and c.compartment_id = p_compartment_id
     and c.storage_location_id = v_parent_id
     and c.lifecycle_status = 'ACTIVE'
     and c.retired_at is null
   for update;

  if v_locked_compartment_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  if p_kind_code is not null then
    select true
      into v_kind_active
      from fridge.compartment_kind k
     where k.kind_code = p_kind_code
       and k.lifecycle_status = 'ACTIVE'
     for share;

    if coalesce(v_kind_active, false) is false then
      return query select 'INVALID_KIND'::text, null::uuid;
      return;
    end if;
  end if;

  insert into fridge.compartment_metadata_change_command (
    household_id, command_id, actor_user_id, compartment_id,
    kind_code, display_name, sort_order, outcome_code
  ) values (
    p_household_id, p_command_id, p_actor_user_id, p_compartment_id,
    p_kind_code, p_display_name, p_sort_order, 'CHANGED'
  );

  update fridge.compartment
     set kind_code = p_kind_code,
         display_name = p_display_name,
         sort_order = p_sort_order
   where household_id = p_household_id
     and compartment_id = p_compartment_id;

  perform fridge_internal.register_storage_topology_command_intent(
    p_household_id,
    p_command_id,
    'CHANGE_COMPARTMENT_METADATA'
  );

  return query select 'CHANGED'::text, p_compartment_id;
end;
$$;

comment on function fridge_internal.change_compartment_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer) is
  'BE-04 ChangeCompartmentMetadata boundary. Revalidates storage administration authority, preserves immutable Household/parent/resource identity, locks current parent before current child, preserves nullable governed kind semantics, binds shared CommandId intent and makes committed replay non-restoring.';

revoke all on table fridge.compartment_metadata_change_command from public;
revoke all on function fridge_internal.change_compartment_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer) from public;
grant execute on function fridge_internal.change_compartment_metadata(uuid,uuid,uuid,uuid,uuid,text,text,integer)
  to fridge_app;

commit;
