-- FridgeScanner BE-04
-- 000044__storage_topology_command_registry.sql
-- Reserve one Household-scoped CommandId to exactly one committed topology intent
-- while preserving the canonical mutation bodies required by accepted static proofs.

begin;

create table fridge.storage_topology_command_registry (
  household_id uuid not null,
  command_id uuid not null,
  intent_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint storage_topology_command_registry_pk
    primary key (household_id, command_id),
  constraint storage_topology_command_registry_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint storage_topology_command_registry_intent_ck
    check (intent_code in (
      'CREATE_STORAGE_LOCATION',
      'CHANGE_STORAGE_LOCATION_METADATA',
      'RETIRE_STORAGE_LOCATION'
    ))
);

comment on table fridge.storage_topology_command_registry is
  'Canonical BE-04 Household-scoped CommandId-to-intent reservation. A committed topology CommandId belongs to exactly one semantic intent across all topology mutation ledgers.';

-- Existing accepted ledgers must not already contradict B4-011. Fail migration
-- rather than silently choosing an intent if historical state is ambiguous.
do $$
begin
  if exists (
    select 1
      from (
        select household_id, command_id, 'CREATE_STORAGE_LOCATION'::text as intent_code
          from fridge.storage_location_create_command
        union all
        select household_id, command_id, 'CHANGE_STORAGE_LOCATION_METADATA'::text
          from fridge.storage_location_metadata_change_command
        union all
        select household_id, command_id, 'RETIRE_STORAGE_LOCATION'::text
          from fridge.storage_location_retire_command
      ) commands
     group by household_id, command_id
    having count(distinct intent_code) > 1
  ) then
    raise exception 'existing storage topology CommandId is bound to multiple intents';
  end if;
end;
$$;

insert into fridge.storage_topology_command_registry (
  household_id,
  command_id,
  intent_code,
  recorded_at
)
select household_id, command_id, intent_code, min(recorded_at)
  from (
    select household_id, command_id, 'CREATE_STORAGE_LOCATION'::text as intent_code, recorded_at
      from fridge.storage_location_create_command
    union all
    select household_id, command_id, 'CHANGE_STORAGE_LOCATION_METADATA'::text, recorded_at
      from fridge.storage_location_metadata_change_command
    union all
    select household_id, command_id, 'RETIRE_STORAGE_LOCATION'::text, recorded_at
      from fridge.storage_location_retire_command
  ) commands
 group by household_id, command_id, intent_code;

create or replace function fridge_internal.assert_storage_topology_command_intent(
  p_household_id uuid,
  p_command_id uuid,
  p_intent_code text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_existing_intent text;
begin
  select r.intent_code
    into v_existing_intent
    from fridge.storage_topology_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id;

  if v_existing_intent is not null
     and v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P4I01',
      message = 'storage topology command id is reserved for another intent';
  end if;
end;
$$;

create or replace function fridge_internal.register_storage_topology_command_intent(
  p_household_id uuid,
  p_command_id uuid,
  p_intent_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_existing_intent text;
begin
  insert into fridge.storage_topology_command_registry (
    household_id,
    command_id,
    intent_code
  ) values (
    p_household_id,
    p_command_id,
    p_intent_code
  )
  on conflict (household_id, command_id) do nothing;

  select r.intent_code
    into v_existing_intent
    from fridge.storage_topology_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id
   for update;

  if v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P4I01',
      message = 'storage topology command id is reserved for another intent';
  end if;
end;
$$;

-- Keep CreateStorageLocation canonical and self-contained so the accepted
-- 000041 static proof continues to inspect the real authority/time/ledger body.
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

  -- Authority first also acquires the Household serialization anchor before
  -- registry inspection, preventing CommandId intent state from becoming an
  -- authorization or cross-Household oracle.
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
    'CREATE_STORAGE_LOCATION'
  );

  v_created_at := clock_timestamp();

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
      perform fridge_internal.register_storage_topology_command_intent(
        p_household_id,
        p_command_id,
        'CREATE_STORAGE_LOCATION'
      );
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

  perform fridge_internal.register_storage_topology_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_STORAGE_LOCATION'
  );

  return query select 'CREATED'::text, p_candidate_storage_location_id;
end;
$$;

-- Keep ChangeStorageLocationMetadata canonical and self-contained so the
-- accepted 000042 proof continues to inspect identity and ledger semantics.
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
    'CHANGE_STORAGE_LOCATION_METADATA'
  );

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
      perform fridge_internal.register_storage_topology_command_intent(
        p_household_id,
        p_command_id,
        'CHANGE_STORAGE_LOCATION_METADATA'
      );
      return query select 'CHANGED'::text, v_existing_storage_location_id;
      return;
    end if;

    raise exception 'unexpected StorageLocation metadata-change command state';
  end if;

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

  perform fridge_internal.register_storage_topology_command_intent(
    p_household_id,
    p_command_id,
    'CHANGE_STORAGE_LOCATION_METADATA'
  );

  return query select 'CHANGED'::text, p_storage_location_id;
end;
$$;

-- Keep RetireStorageLocation canonical and self-contained so the accepted
-- 000043 proof continues to inspect lock, stock and post-lock time semantics.
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
    'RETIRE_STORAGE_LOCATION'
  );

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
      perform fridge_internal.register_storage_topology_command_intent(
        p_household_id,
        p_command_id,
        'RETIRE_STORAGE_LOCATION'
      );
      return query select 'RETIRED'::text, v_existing_storage_location_id;
      return;
    end if;

    raise exception 'unexpected StorageLocation retirement command state';
  end if;

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

  perform fridge_internal.register_storage_topology_command_intent(
    p_household_id,
    p_command_id,
    'RETIRE_STORAGE_LOCATION'
  );

  return query select 'RETIRED'::text, p_storage_location_id;
end;
$$;

comment on function fridge_internal.create_storage_location(uuid, uuid, uuid, uuid, uuid, text, text, integer) is
  'BE-04 CreateStorageLocation with shared Household-scoped CommandId intent reservation, current storage authority, post-lock creation time, durable local command facts and non-restoring committed replay.';
comment on function fridge_internal.change_storage_location_metadata(uuid, uuid, uuid, uuid, uuid, text, text, integer) is
  'BE-04 ChangeStorageLocationMetadata with shared Household-scoped CommandId intent reservation, immutable ownership/identity, active target/kind governance and non-restoring committed replay.';
comment on function fridge_internal.retire_storage_location(uuid, uuid, uuid, uuid, uuid) is
  'BE-04 RetireStorageLocation with shared Household-scoped CommandId intent reservation, canonical child/stock locks, post-lock retirement time and non-restoring committed replay.';

revoke all on table fridge.storage_topology_command_registry from public;
revoke all on function fridge_internal.assert_storage_topology_command_intent(uuid, uuid, text) from public;
revoke all on function fridge_internal.register_storage_topology_command_intent(uuid, uuid, text) from public;
revoke all on function fridge_internal.create_storage_location(uuid, uuid, uuid, uuid, uuid, text, text, integer) from public;
revoke all on function fridge_internal.change_storage_location_metadata(uuid, uuid, uuid, uuid, uuid, text, text, integer) from public;
revoke all on function fridge_internal.retire_storage_location(uuid, uuid, uuid, uuid, uuid) from public;

grant execute on function fridge_internal.create_storage_location(uuid, uuid, uuid, uuid, uuid, text, text, integer) to fridge_app;
grant execute on function fridge_internal.change_storage_location_metadata(uuid, uuid, uuid, uuid, uuid, text, text, integer) to fridge_app;
grant execute on function fridge_internal.retire_storage_location(uuid, uuid, uuid, uuid, uuid) to fridge_app;

commit;
