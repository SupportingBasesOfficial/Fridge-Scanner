-- FridgeScanner BE-04
-- 000044__storage_topology_command_registry.sql
-- Reserve one Household-scoped CommandId to exactly one committed topology intent.

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
-- rather than silently choosing one intent if historical data is ambiguous.
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

insert into fridge.storage_topology_command_registry (household_id, command_id, intent_code, recorded_at)
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

-- Preserve accepted kernels under internal-only names. The canonical names below
-- become authority-gated wrappers that enforce the shared CommandId registry.
alter function fridge_internal.create_storage_location(uuid, uuid, uuid, uuid, uuid, text, text, integer)
  rename to create_storage_location_v1;
alter function fridge_internal.change_storage_location_metadata(uuid, uuid, uuid, uuid, uuid, text, text, integer)
  rename to change_storage_location_metadata_v1;
alter function fridge_internal.retire_storage_location(uuid, uuid, uuid, uuid, uuid)
  rename to retire_storage_location_v1;

revoke all on function fridge_internal.create_storage_location_v1(uuid, uuid, uuid, uuid, uuid, text, text, integer) from public;
revoke all on function fridge_internal.change_storage_location_metadata_v1(uuid, uuid, uuid, uuid, uuid, text, text, integer) from public;
revoke all on function fridge_internal.retire_storage_location_v1(uuid, uuid, uuid, uuid, uuid) from public;
revoke execute on function fridge_internal.create_storage_location_v1(uuid, uuid, uuid, uuid, uuid, text, text, integer) from fridge_app;
revoke execute on function fridge_internal.change_storage_location_metadata_v1(uuid, uuid, uuid, uuid, uuid, text, text, integer) from fridge_app;
revoke execute on function fridge_internal.retire_storage_location_v1(uuid, uuid, uuid, uuid, uuid) from fridge_app;

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
  v_outcome_code text;
  v_result_storage_location_id uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Authority first: registry state must never become a cross-Household oracle.
  -- This also acquires the canonical Household serialization anchor before the
  -- shared CommandId intent is inspected.
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

  select k.outcome_code, k.result_storage_location_id
    into v_outcome_code, v_result_storage_location_id
    from fridge_internal.create_storage_location_v1(
      p_household_id,
      p_actor_user_id,
      p_actor_membership_id,
      p_command_id,
      p_candidate_storage_location_id,
      p_kind_code,
      p_display_name,
      p_sort_order
    ) k;

  if v_outcome_code = 'CREATED' then
    perform fridge_internal.register_storage_topology_command_intent(
      p_household_id,
      p_command_id,
      'CREATE_STORAGE_LOCATION'
    );
  end if;

  return query select v_outcome_code, v_result_storage_location_id;
end;
$$;

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
  v_outcome_code text;
  v_result_storage_location_id uuid;
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

  select k.outcome_code, k.result_storage_location_id
    into v_outcome_code, v_result_storage_location_id
    from fridge_internal.change_storage_location_metadata_v1(
      p_household_id,
      p_actor_user_id,
      p_actor_membership_id,
      p_command_id,
      p_storage_location_id,
      p_kind_code,
      p_display_name,
      p_sort_order
    ) k;

  if v_outcome_code = 'CHANGED' then
    perform fridge_internal.register_storage_topology_command_intent(
      p_household_id,
      p_command_id,
      'CHANGE_STORAGE_LOCATION_METADATA'
    );
  end if;

  return query select v_outcome_code, v_result_storage_location_id;
end;
$$;

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
  v_outcome_code text;
  v_result_storage_location_id uuid;
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

  select k.outcome_code, k.result_storage_location_id
    into v_outcome_code, v_result_storage_location_id
    from fridge_internal.retire_storage_location_v1(
      p_household_id,
      p_actor_user_id,
      p_actor_membership_id,
      p_command_id,
      p_storage_location_id
    ) k;

  if v_outcome_code = 'RETIRED' then
    perform fridge_internal.register_storage_topology_command_intent(
      p_household_id,
      p_command_id,
      'RETIRE_STORAGE_LOCATION'
    );
  end if;

  return query select v_outcome_code, v_result_storage_location_id;
end;
$$;

comment on function fridge_internal.create_storage_location(uuid, uuid, uuid, uuid, uuid, text, text, integer) is
  'Canonical BE-04 CreateStorageLocation wrapper. Revalidates authority before shared Household-scoped CommandId intent enforcement and delegates mutation semantics to the accepted internal v1 kernel.';
comment on function fridge_internal.change_storage_location_metadata(uuid, uuid, uuid, uuid, uuid, text, text, integer) is
  'Canonical BE-04 ChangeStorageLocationMetadata wrapper. Revalidates authority before shared Household-scoped CommandId intent enforcement and delegates mutation semantics to the accepted internal v1 kernel.';
comment on function fridge_internal.retire_storage_location(uuid, uuid, uuid, uuid, uuid) is
  'Canonical BE-04 RetireStorageLocation wrapper. Revalidates authority before shared Household-scoped CommandId intent enforcement and delegates lifecycle/stock safety semantics to the internal v1 kernel.';

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
