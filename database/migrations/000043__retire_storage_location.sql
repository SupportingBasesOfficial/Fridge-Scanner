-- FridgeScanner BE-04
-- 000043__retire_storage_location.sql
-- Governed, idempotent, child-safe and stock-aware StorageLocation retirement.

begin;

create table fridge.storage_location_retire_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  storage_location_id uuid not null,
  retired_at timestamptz not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint storage_location_retire_command_pk
    primary key (household_id, command_id),
  constraint storage_location_retire_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint storage_location_retire_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint storage_location_retire_command_target_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint storage_location_retire_command_outcome_ck
    check (outcome_code = 'RETIRED')
);

comment on table fridge.storage_location_retire_command is
  'Durable BE-04 RetireStorageLocation command identity and post-lock retirement instant. Committed replay returns the original successful outcome without reapplying or restoring topology.';

create or replace function fridge_internal.retire_storage_location(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_storage_location_id uuid
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
  v_existing_outcome_code text;
  v_target_id uuid;
  v_retired_at timestamptz;
  v_active_child_exists boolean;
  v_active_stock_exists boolean;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Re-establish BE-04 authority in this exact transaction. The accepted helper
  -- serializes first on Household and observes authority only after that wait.
  v_actor_role_code := fridge_internal.acquire_household_storage_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Committed replay precedes current target/dependency validation. A replay of
  -- an already committed retirement never attempts to retire or mutate again.
  select c.actor_user_id,
         c.storage_location_id,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_storage_location_id,
         v_existing_outcome_code
    from fridge.storage_location_retire_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_storage_location_id is distinct from p_storage_location_id then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'RETIRED' then
      return query select 'RETIRED'::text, v_existing_storage_location_id;
      return;
    end if;

    raise exception 'unexpected StorageLocation retirement command state';
  end if;

  -- Household -> StorageLocation is the canonical BE-04 lock order. Missing,
  -- foreign-Household and already-retired targets intentionally collapse.
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

  -- Lock every child in stable identity order before inspecting lifecycle. This
  -- both follows Household -> StorageLocation -> Compartment and prevents a
  -- concurrent placement from slipping through a child while retirement runs.
  perform 1
    from fridge.compartment c
   where c.household_id = p_household_id
     and c.storage_location_id = p_storage_location_id
   order by c.compartment_id
   for update;

  select exists (
    select 1
      from fridge.compartment c
     where c.household_id = p_household_id
       and c.storage_location_id = p_storage_location_id
       and c.lifecycle_status = 'ACTIVE'
       and c.retired_at is null
  ) into v_active_child_exists;

  if v_active_child_exists then
    return query select 'ACTIVE_CHILD_CONFLICT'::text, null::uuid;
    return;
  end if;

  -- StockItem is canonical current stock identity/lifecycle/placement. Lock all
  -- stock rows that resolve directly to this location or through any child so
  -- lifecycle/placement cannot change between dependency check and retirement.
  perform 1
    from fridge.stock_item si
   where si.household_id = p_household_id
     and (
       (
         si.placement_anchor_kind = 'LOCATION'
         and si.storage_location_id = p_storage_location_id
       )
       or
       (
         si.placement_anchor_kind = 'COMPARTMENT'
         and si.compartment_id in (
           select c.compartment_id
             from fridge.compartment c
            where c.household_id = p_household_id
              and c.storage_location_id = p_storage_location_id
         )
       )
     )
   order by si.stock_item_id
   for update;

  select exists (
    select 1
      from fridge.stock_item si
     where si.household_id = p_household_id
       and si.lifecycle_status = 'ACTIVE'
       and si.retired_at is null
       and (
         (
           si.placement_anchor_kind = 'LOCATION'
           and si.storage_location_id = p_storage_location_id
         )
         or
         (
           si.placement_anchor_kind = 'COMPARTMENT'
           and si.compartment_id in (
             select c.compartment_id
               from fridge.compartment c
              where c.household_id = p_household_id
                and c.storage_location_id = p_storage_location_id
           )
         )
       )
  ) into v_active_stock_exists;

  if v_active_stock_exists then
    return query select 'STOCK_DEPENDENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  -- Sample lifecycle time only after all serialization/dependency locks.
  v_retired_at := clock_timestamp();

  update fridge.storage_location
     set lifecycle_status = 'RETIRED',
         retired_at = v_retired_at
   where household_id = p_household_id
     and storage_location_id = p_storage_location_id;

  insert into fridge.storage_location_retire_command (
    household_id,
    command_id,
    actor_user_id,
    storage_location_id,
    retired_at,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_storage_location_id,
    v_retired_at,
    'RETIRED'
  );

  return query select 'RETIRED'::text, p_storage_location_id;
end;
$$;

comment on function fridge_internal.retire_storage_location(uuid, uuid, uuid, uuid, uuid) is
  'BE-04 intent-specific StorageLocation retirement. Revalidates HOUSEHOLD_STORAGE_ADMINISTER, locks Household -> StorageLocation -> child Compartments -> dependent StockItems, blocks active children/current stock, records post-lock retirement time, preserves history and makes committed replay non-restoring.';

revoke all on table fridge.storage_location_retire_command from public;
revoke all on function fridge_internal.retire_storage_location(uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function fridge_internal.retire_storage_location(uuid, uuid, uuid, uuid, uuid)
  to fridge_app;

commit;
