-- FridgeScanner BE-04
-- 000041__create_storage_location.sql
-- Governed, idempotent creation of a Household-owned StorageLocation.

begin;

create table fridge.storage_location_create_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  candidate_storage_location_id uuid not null,
  kind_code text not null,
  display_name text not null,
  sort_order integer,
  result_storage_location_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint storage_location_create_command_pk
    primary key (household_id, command_id),
  constraint storage_location_create_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint storage_location_create_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint storage_location_create_command_kind_fk
    foreign key (kind_code)
    references fridge.storage_location_kind (kind_code)
    on update restrict on delete restrict,
  constraint storage_location_create_command_result_fk
    foreign key (result_storage_location_id)
    references fridge.storage_location (storage_location_id)
    on update restrict on delete restrict,
  constraint storage_location_create_command_name_nonblank
    check (btrim(display_name) <> ''),
  constraint storage_location_create_command_outcome_ck
    check (outcome_code in ('PENDING', 'CREATED')),
  constraint storage_location_create_command_result_ck
    check (
      (outcome_code = 'CREATED' and result_storage_location_id is not null)
      or (outcome_code = 'PENDING' and result_storage_location_id is null)
    )
);

comment on table fridge.storage_location_create_command is
  'Durable BE-04 CreateStorageLocation command identity. CommandId is Household-scoped and binds actor, the first committed server-generated candidate identity and normalized requested facts; committed replay returns the original StorageLocation identity without reapplying creation.';

create or replace function fridge_internal.create_storage_location(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_storage_location_id uuid,
  p_kind_code text,
  p_display_name text,
  p_sort_order integer
)
returns table (
  outcome_code text,
  result_storage_location_id uuid
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
  v_existing_kind_code text;
  v_existing_display_name text;
  v_existing_sort_order integer;
  v_existing_outcome_code text;
  v_existing_result_storage_location_id uuid;
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

  v_created_at := clock_timestamp();

  -- Replay is keyed by the caller-stable command and semantic request facts.
  -- The candidate UUID is an internal first-execution allocation proposal: a
  -- retry may generate a different proposal, but once one command commits the
  -- persisted candidate/result identity is authoritative and must be returned.
  select c.actor_user_id,
         c.kind_code,
         c.display_name,
         c.sort_order,
         c.outcome_code,
         c.result_storage_location_id
    into v_existing_actor_user_id,
         v_existing_kind_code,
         v_existing_display_name,
         v_existing_sort_order,
         v_existing_outcome_code,
         v_existing_result_storage_location_id
    from fridge.storage_location_create_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_kind_code is distinct from p_kind_code
       or v_existing_display_name is distinct from p_display_name
       or v_existing_sort_order is distinct from p_sort_order then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CREATED'
       and v_existing_result_storage_location_id is not null then
      return query select 'CREATED'::text, v_existing_result_storage_location_id;
      return;
    end if;

    raise exception 'unexpected pending StorageLocation create command';
  end if;

  select true
    into v_kind_active
    from fridge.storage_location_kind k
   where k.kind_code = p_kind_code
     and k.lifecycle_status = 'ACTIVE'
   for share;

  if coalesce(v_kind_active, false) is false then
    return query select 'INVALID_KIND'::text, null::uuid;
    return;
  end if;

  insert into fridge.storage_location_create_command (
    household_id,
    command_id,
    actor_user_id,
    candidate_storage_location_id,
    kind_code,
    display_name,
    sort_order,
    result_storage_location_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_candidate_storage_location_id,
    p_kind_code,
    p_display_name,
    p_sort_order,
    null,
    'PENDING'
  );

  insert into fridge.storage_location (
    storage_location_id,
    household_id,
    kind_code,
    display_name,
    lifecycle_status,
    sort_order,
    created_at,
    retired_at
  ) values (
    p_candidate_storage_location_id,
    p_household_id,
    p_kind_code,
    p_display_name,
    'ACTIVE',
    p_sort_order,
    v_created_at,
    null
  );

  update fridge.storage_location_create_command
     set outcome_code = 'CREATED',
         result_storage_location_id = p_candidate_storage_location_id
   where household_id = p_household_id
     and command_id = p_command_id;

  return query select 'CREATED'::text, p_candidate_storage_location_id;
end;
$$;

comment on function fridge_internal.create_storage_location(uuid, uuid, uuid, uuid, uuid, text, text, integer) is
  'BE-04 intent-specific CreateStorageLocation persistence boundary. Revalidates current HOUSEHOLD_STORAGE_ADMINISTER authority, preserves Household ownership, requires active governed kind for new execution, durably binds the first server-generated candidate to the stable command, uses post-lock creation time and returns committed replay without reapplying.';

revoke all on table fridge.storage_location_create_command from public;
revoke all on function fridge_internal.create_storage_location(uuid, uuid, uuid, uuid, uuid, text, text, integer) from public;
grant execute on function fridge_internal.create_storage_location(uuid, uuid, uuid, uuid, uuid, text, text, integer)
  to fridge_app;

commit;
