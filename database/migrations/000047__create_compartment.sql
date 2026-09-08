-- FridgeScanner BE-04
-- 000047__create_compartment.sql
-- Governed, idempotent creation of a current Compartment beneath a current StorageLocation.

begin;

alter table fridge.storage_topology_command_registry
  drop constraint storage_topology_command_registry_intent_ck;

alter table fridge.storage_topology_command_registry
  add constraint storage_topology_command_registry_intent_ck
  check (intent_code in (
    'CREATE_STORAGE_LOCATION',
    'CHANGE_STORAGE_LOCATION_METADATA',
    'RETIRE_STORAGE_LOCATION',
    'CREATE_COMPARTMENT'
  ));

create table fridge.compartment_create_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  candidate_compartment_id uuid not null,
  storage_location_id uuid not null,
  kind_code text,
  display_name text not null,
  sort_order integer,
  result_compartment_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint compartment_create_command_pk
    primary key (household_id, command_id),
  constraint compartment_create_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint compartment_create_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint compartment_create_command_parent_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint compartment_create_command_kind_fk
    foreign key (kind_code)
    references fridge.compartment_kind (kind_code)
    on update restrict on delete restrict,
  constraint compartment_create_command_result_fk
    foreign key (result_compartment_id)
    references fridge.compartment (compartment_id)
    on update restrict on delete restrict,
  constraint compartment_create_command_name_nonblank
    check (btrim(display_name) <> ''),
  constraint compartment_create_command_outcome_ck
    check (outcome_code in ('PENDING', 'CREATED')),
  constraint compartment_create_command_result_ck
    check (
      (outcome_code = 'CREATED' and result_compartment_id is not null)
      or (outcome_code = 'PENDING' and result_compartment_id is null)
    )
);

comment on table fridge.compartment_create_command is
  'Durable BE-04 CreateCompartment command identity. Household-scoped CommandId binds actor, immutable parent StorageLocation, optional governed kind, normalized metadata and the first committed server-generated candidate identity.';

create or replace function fridge_internal.create_compartment(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_compartment_id uuid,
  p_storage_location_id uuid,
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
  v_created_at timestamptz;
  v_existing_actor_user_id uuid;
  v_existing_storage_location_id uuid;
  v_existing_kind_code text;
  v_existing_display_name text;
  v_existing_sort_order integer;
  v_existing_outcome_code text;
  v_existing_result_compartment_id uuid;
  v_parent_id uuid;
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
    'CREATE_COMPARTMENT'
  );

  select c.actor_user_id,
         c.storage_location_id,
         c.kind_code,
         c.display_name,
         c.sort_order,
         c.outcome_code,
         c.result_compartment_id
    into v_existing_actor_user_id,
         v_existing_storage_location_id,
         v_existing_kind_code,
         v_existing_display_name,
         v_existing_sort_order,
         v_existing_outcome_code,
         v_existing_result_compartment_id
    from fridge.compartment_create_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_storage_location_id is distinct from p_storage_location_id
       or v_existing_kind_code is distinct from p_kind_code
       or v_existing_display_name is distinct from p_display_name
       or v_existing_sort_order is distinct from p_sort_order then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CREATED'
       and v_existing_result_compartment_id is not null then
      perform fridge_internal.register_storage_topology_command_intent(
        p_household_id,
        p_command_id,
        'CREATE_COMPARTMENT'
      );
      return query select 'CREATED'::text, v_existing_result_compartment_id;
      return;
    end if;

    raise exception 'unexpected pending Compartment create command';
  end if;

  -- Canonical order is Household (already locked by authority) -> StorageLocation.
  -- This parent lock serializes against RetireStorageLocation so creation and
  -- retirement cannot both commit as though the parent remained current.
  select sl.storage_location_id
    into v_parent_id
    from fridge.storage_location sl
   where sl.household_id = p_household_id
     and sl.storage_location_id = p_storage_location_id
     and sl.lifecycle_status = 'ACTIVE'
     and sl.retired_at is null
   for update;

  if v_parent_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  v_created_at := clock_timestamp();

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

  insert into fridge.compartment_create_command (
    household_id,
    command_id,
    actor_user_id,
    candidate_compartment_id,
    storage_location_id,
    kind_code,
    display_name,
    sort_order,
    result_compartment_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_candidate_compartment_id,
    p_storage_location_id,
    p_kind_code,
    p_display_name,
    p_sort_order,
    null,
    'PENDING'
  );

  insert into fridge.compartment (
    compartment_id,
    household_id,
    storage_location_id,
    kind_code,
    display_name,
    sort_order,
    lifecycle_status,
    created_at,
    retired_at
  ) values (
    p_candidate_compartment_id,
    p_household_id,
    p_storage_location_id,
    p_kind_code,
    p_display_name,
    p_sort_order,
    'ACTIVE',
    v_created_at,
    null
  );

  update fridge.compartment_create_command
     set outcome_code = 'CREATED',
         result_compartment_id = p_candidate_compartment_id
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_storage_topology_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_COMPARTMENT'
  );

  return query select 'CREATED'::text, p_candidate_compartment_id;
end;
$$;

comment on function fridge_internal.create_compartment(uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer) is
  'BE-04 intent-specific CreateCompartment boundary. Revalidates storage administration authority, locks the current same-Household parent before post-lock time and kind validation, preserves optional kind semantics, binds stable command facts and returns non-reapplying committed replay.';

revoke all on table fridge.compartment_create_command from public;
revoke all on function fridge_internal.create_compartment(uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer) from public;
grant execute on function fridge_internal.create_compartment(uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer)
  to fridge_app;

commit;
