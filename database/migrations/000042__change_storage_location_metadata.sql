-- FridgeScanner BE-04
-- 000042__change_storage_location_metadata.sql
-- Governed, idempotent metadata mutation for one current Household-owned StorageLocation.

begin;

create table fridge.storage_location_metadata_change_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  storage_location_id uuid not null,
  kind_code text not null,
  display_name text not null,
  sort_order integer,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint storage_location_metadata_change_command_pk
    primary key (household_id, command_id),
  constraint storage_location_metadata_change_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint storage_location_metadata_change_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint storage_location_metadata_change_command_target_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint storage_location_metadata_change_command_kind_fk
    foreign key (kind_code)
    references fridge.storage_location_kind (kind_code)
    on update restrict on delete restrict,
  constraint storage_location_metadata_change_command_name_nonblank
    check (btrim(display_name) <> ''),
  constraint storage_location_metadata_change_command_outcome_ck
    check (outcome_code in ('CHANGED'))
);

comment on table fridge.storage_location_metadata_change_command is
  'Durable BE-04 ChangeStorageLocationMetadata command identity. A committed replay returns the original successful outcome without reapplying metadata or restoring later state.';

create or replace function fridge_internal.change_storage_location_metadata(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_storage_location_id uuid,
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
  v_existing_actor_user_id uuid;
  v_existing_storage_location_id uuid;
  v_existing_kind_code text;
  v_existing_display_name text;
  v_existing_sort_order integer;
  v_existing_outcome_code text;
  v_target_id uuid;
  v_kind_active boolean;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Re-establish stronger authority in this exact transaction. The accepted
  -- helper serializes on Household before sampling current authority.
  v_actor_role_code := fridge_internal.acquire_household_storage_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- A committed replay is resolved before current target/kind validation. Later
  -- retirement or later metadata changes must not cause this command to reapply.
  select c.actor_user_id,
         c.storage_location_id,
         c.kind_code,
         c.display_name,
         c.sort_order,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_storage_location_id,
         v_existing_kind_code,
         v_existing_display_name,
         v_existing_sort_order,
         v_existing_outcome_code
    from fridge.storage_location_metadata_change_command c
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

    if v_existing_outcome_code = 'CHANGED' then
      return query select 'CHANGED'::text, v_existing_storage_location_id;
      return;
    end if;

    raise exception 'unexpected StorageLocation metadata-change command state';
  end if;

  -- Only current same-Household topology may receive ordinary metadata changes.
  -- Another Household, missing target and retired target intentionally collapse.
  select sl.storage_location_id
    into v_target_id
    from fridge.storage_location sl
   where sl.household_id = p_household_id
     and sl.storage_location_id = p_storage_location_id
     and sl.lifecycle_status = 'ACTIVE'
     and sl.retired_at is null
   for update;

  if v_target_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
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

  insert into fridge.storage_location_metadata_change_command (
    household_id,
    command_id,
    actor_user_id,
    storage_location_id,
    kind_code,
    display_name,
    sort_order,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_storage_location_id,
    p_kind_code,
    p_display_name,
    p_sort_order,
    'CHANGED'
  );

  update fridge.storage_location
     set kind_code = p_kind_code,
         display_name = p_display_name,
         sort_order = p_sort_order
   where household_id = p_household_id
     and storage_location_id = p_storage_location_id;

  return query select 'CHANGED'::text, p_storage_location_id;
end;
$$;

comment on function fridge_internal.change_storage_location_metadata(uuid, uuid, uuid, uuid, uuid, text, text, integer) is
  'BE-04 intent-specific metadata mutation. Revalidates current HOUSEHOLD_STORAGE_ADMINISTER authority, preserves immutable Household/resource identity, targets active topology only, validates active governed kind data, binds durable command facts and makes committed replay non-restoring.';

revoke all on table fridge.storage_location_metadata_change_command from public;
revoke all on function fridge_internal.change_storage_location_metadata(uuid, uuid, uuid, uuid, uuid, text, text, integer) from public;
grant execute on function fridge_internal.change_storage_location_metadata(uuid, uuid, uuid, uuid, uuid, text, text, integer)
  to fridge_app;

commit;
