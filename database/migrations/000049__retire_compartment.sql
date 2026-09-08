-- FridgeScanner BE-04
-- 000049__retire_compartment.sql
-- Governed, idempotent and stock-aware retirement of one current Compartment.

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
    'CHANGE_COMPARTMENT_METADATA',
    'RETIRE_COMPARTMENT'
  ));

create table fridge.compartment_retire_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  compartment_id uuid not null,
  retired_at timestamptz not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint compartment_retire_command_pk primary key (household_id, command_id),
  constraint compartment_retire_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint compartment_retire_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint compartment_retire_command_target_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint compartment_retire_command_outcome_ck check (outcome_code = 'RETIRED')
);

comment on table fridge.compartment_retire_command is
  'Durable BE-04 RetireCompartment command identity and post-lock retirement instant. Committed replay returns the original successful outcome without reapplying or restoring topology.';

create or replace function fridge_internal.retire_compartment(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_compartment_id uuid
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
  v_existing_outcome_code text;
  v_parent_id uuid;
  v_locked_parent_id uuid;
  v_locked_compartment_id uuid;
  v_active_stock_exists boolean;
  v_retired_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Re-establish current storage-administration authority after Household-first
  -- serialization inside the accepted BE-04 transaction boundary.
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
    'RETIRE_COMPARTMENT'
  );

  -- Resolve committed replay before current parent/target/stock validation.
  -- A retry of an already committed retirement must not execute retirement again.
  select c.actor_user_id,
         c.compartment_id,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_compartment_id,
         v_existing_outcome_code
    from fridge.compartment_retire_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_compartment_id is distinct from p_compartment_id then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'RETIRED' then
      perform fridge_internal.register_storage_topology_command_intent(
        p_household_id,
        p_command_id,
        'RETIRE_COMPARTMENT'
      );
      return query select 'RETIRED'::text, v_existing_compartment_id;
      return;
    end if;

    raise exception 'unexpected Compartment retirement command state';
  end if;

  -- Parent identity is immutable in BE-04. Discover it without locking only so
  -- the canonical Household -> StorageLocation -> Compartment lock order can be
  -- preserved; this read does not grant authority or make the target current.
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

  -- Lock every StockItem currently referencing this Compartment before deciding
  -- whether retirement is safe. No stock lifecycle or placement may change
  -- between this dependency inspection and the Compartment retirement update.
  perform 1
    from fridge.stock_item si
   where si.household_id = p_household_id
     and si.placement_anchor_kind = 'COMPARTMENT'
     and si.compartment_id = p_compartment_id
   order by si.stock_item_id
   for update;

  select exists (
    select 1
      from fridge.stock_item si
     where si.household_id = p_household_id
       and si.placement_anchor_kind = 'COMPARTMENT'
       and si.compartment_id = p_compartment_id
       and si.lifecycle_status = 'ACTIVE'
       and si.retired_at is null
  ) into v_active_stock_exists;

  if v_active_stock_exists then
    return query select 'STOCK_DEPENDENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  -- Lifecycle time is sampled only after Household, parent, target and dependent
  -- StockItem serialization has completed.
  v_retired_at := clock_timestamp();

  update fridge.compartment
     set lifecycle_status = 'RETIRED',
         retired_at = v_retired_at
   where household_id = p_household_id
     and compartment_id = p_compartment_id;

  insert into fridge.compartment_retire_command (
    household_id,
    command_id,
    actor_user_id,
    compartment_id,
    retired_at,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_compartment_id,
    v_retired_at,
    'RETIRED'
  );

  perform fridge_internal.register_storage_topology_command_intent(
    p_household_id,
    p_command_id,
    'RETIRE_COMPARTMENT'
  );

  return query select 'RETIRED'::text, p_compartment_id;
end;
$$;

comment on function fridge_internal.retire_compartment(uuid,uuid,uuid,uuid,uuid) is
  'BE-04 RetireCompartment boundary. Revalidates HOUSEHOLD_STORAGE_ADMINISTER, locks Household -> parent StorageLocation -> Compartment -> dependent StockItems, blocks current stock without cascade/relocation, records post-lock retirement time, binds shared CommandId intent and makes committed replay non-restoring.';

revoke all on table fridge.compartment_retire_command from public;
revoke all on function fridge_internal.retire_compartment(uuid,uuid,uuid,uuid,uuid) from public;
grant execute on function fridge_internal.retire_compartment(uuid,uuid,uuid,uuid,uuid)
  to fridge_app;

commit;
