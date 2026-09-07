-- FridgeScanner BE-03 hardening
-- 000039__be03_post_lock_temporal_authority.sql
--
-- A statement may begin before waiting on the canonical Household row lock.
-- statement_timestamp() therefore represents pre-serialization time and can make
-- a transaction that waited observe authority already ended by the transaction
-- ahead of it. Every serialized BE-03 mutation below now captures a fresh
-- clock_timestamp() only after the Household serialization anchor is held.

begin;

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
  v_household_locked uuid;
  v_role_code text;
  v_observed_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return null;
  end if;

  select h.household_id
    into v_household_locked
    from fridge.household h
   where h.household_id = p_household_id
   for update;

  if v_household_locked is null then
    return null;
  end if;

  -- Authority time is sampled after any wait on the serialization anchor.
  v_observed_at := clock_timestamp();

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
     and hm.effective_from <= v_observed_at
     and (hm.effective_to is null or hm.effective_to > v_observed_at)
     and r.lifecycle_status = 'ACTIVE'
     and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
     and c.lifecycle_status = 'ACTIVE'
   for update of hm
   for share of r, rc, c;

  return v_role_code;
end;
$$;

create or replace function fridge_internal.household_membership_survivability_allows(
  p_household_id uuid,
  p_target_membership_id uuid,
  p_result_role_code text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_household_locked uuid;
  v_observed_at timestamptz;
  v_target_user_id uuid;
  v_target_role_code text;
  v_target_admin_capability text;
  v_result_admin_capability text;
  v_other_admin_membership_id uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return false;
  end if;

  select h.household_id
    into v_household_locked
    from fridge.household h
   where h.household_id = p_household_id
   for update;

  if v_household_locked is null then
    return false;
  end if;

  -- Re-observe temporal authority only after serialization has completed.
  v_observed_at := clock_timestamp();

  select hm.user_id,
         hm.role_code
    into v_target_user_id,
         v_target_role_code
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.membership_id = p_target_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= v_observed_at
     and (hm.effective_to is null or hm.effective_to > v_observed_at)
   for update;

  if v_target_user_id is null then
    return true;
  end if;

  select c.capability_code
    into v_target_admin_capability
    from fridge.household_role r
    join fridge.household_role_capability rc
      on rc.role_code = r.role_code
    join fridge.household_capability c
      on c.capability_code = rc.capability_code
   where r.role_code = v_target_role_code
     and r.lifecycle_status = 'ACTIVE'
     and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
     and c.lifecycle_status = 'ACTIVE'
   limit 1
   for share of r, rc, c;

  if p_result_role_code is not null then
    select c.capability_code
      into v_result_admin_capability
      from fridge.household_role r
      join fridge.household_role_capability rc
        on rc.role_code = r.role_code
      join fridge.household_capability c
        on c.capability_code = rc.capability_code
     where r.role_code = p_result_role_code
       and r.lifecycle_status = 'ACTIVE'
       and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
       and c.lifecycle_status = 'ACTIVE'
     limit 1
     for share of r, rc, c;
  end if;

  if v_target_admin_capability is null or v_result_admin_capability is not null then
    return true;
  end if;

  select hm.membership_id
    into v_other_admin_membership_id
    from fridge.household_membership hm
    join fridge.household_role r
      on r.role_code = hm.role_code
    join fridge.household_role_capability rc
      on rc.role_code = r.role_code
    join fridge.household_capability c
      on c.capability_code = rc.capability_code
   where hm.household_id = p_household_id
     and hm.membership_id <> p_target_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= v_observed_at
     and (hm.effective_to is null or hm.effective_to > v_observed_at)
     and r.lifecycle_status = 'ACTIVE'
     and c.capability_code = 'HOUSEHOLD_MEMBERSHIP_ADMINISTER'
     and c.lifecycle_status = 'ACTIVE'
   order by hm.membership_id
   limit 1
   for share of hm, r, rc, c;

  return v_other_admin_membership_id is not null;
end;
$$;

create or replace function fridge_internal.add_household_member(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_membership_id uuid,
  p_target_user_id uuid,
  p_role_code text
)
returns table (
  outcome_code text,
  result_membership_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_target_exists boolean;
  v_role_assignable boolean;
  v_current_membership_id uuid;
  v_command_actor_user_id uuid;
  v_command_target_user_id uuid;
  v_command_role_code text;
  v_command_outcome_code text;
  v_command_result_membership_id uuid;
  v_inserted_count integer;
  v_effective_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_membership_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- The Household lock is now held; bind current-state interpretation and the
  -- new interval to one post-lock database-authoritative instant.
  v_effective_at := clock_timestamp();

  select true
    into v_target_exists
    from fridge.user_profile up
   where up.user_id = p_target_user_id
     and up.lifecycle_status = 'ACTIVE'
   for share;

  select true
    into v_role_assignable
    from fridge.household_role r
   where r.role_code = p_role_code
     and r.lifecycle_status = 'ACTIVE'
     and r.is_assignable
   for share;

  if coalesce(v_target_exists, false) is false
     or coalesce(v_role_assignable, false) is false then
    return query select 'TARGET_OR_ROLE_INVALID'::text, null::uuid;
    return;
  end if;

  insert into fridge.household_membership_add_command (
    household_id,
    command_id,
    actor_user_id,
    target_user_id,
    role_code,
    candidate_membership_id,
    result_membership_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_target_user_id,
    p_role_code,
    p_candidate_membership_id,
    null,
    'PENDING'
  )
  on conflict (household_id, command_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  select c.actor_user_id,
         c.target_user_id,
         c.role_code,
         c.outcome_code,
         c.result_membership_id
    into v_command_actor_user_id,
         v_command_target_user_id,
         v_command_role_code,
         v_command_outcome_code,
         v_command_result_membership_id
    from fridge.household_membership_add_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if v_command_actor_user_id is distinct from p_actor_user_id
     or v_command_target_user_id is distinct from p_target_user_id
     or v_command_role_code is distinct from p_role_code then
    return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  if v_inserted_count = 0 then
    if v_command_outcome_code = 'ADDED' then
      return query select 'ADDED'::text, v_command_result_membership_id;
      return;
    end if;

    if v_command_outcome_code = 'CURRENT_MEMBERSHIP_EXISTS' then
      return query select 'CURRENT_MEMBERSHIP_EXISTS'::text, null::uuid;
      return;
    end if;

    raise exception 'unexpected pending Household membership add command';
  end if;

  select hm.membership_id
    into v_current_membership_id
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_target_user_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= v_effective_at
     and (hm.effective_to is null or hm.effective_to > v_effective_at)
   order by hm.effective_from desc, hm.membership_id
   limit 1
   for update;

  if v_current_membership_id is not null then
    update fridge.household_membership_add_command
       set outcome_code = 'CURRENT_MEMBERSHIP_EXISTS'
     where household_id = p_household_id
       and command_id = p_command_id;

    return query select 'CURRENT_MEMBERSHIP_EXISTS'::text, null::uuid;
    return;
  end if;

  begin
    insert into fridge.household_membership (
      membership_id,
      household_id,
      user_id,
      role_code,
      lifecycle_status,
      effective_from,
      effective_to,
      created_by_user_id
    ) values (
      p_candidate_membership_id,
      p_household_id,
      p_target_user_id,
      p_role_code,
      'ACTIVE',
      v_effective_at,
      null,
      p_actor_user_id
    );
  exception
    when unique_violation then
      update fridge.household_membership_add_command
         set outcome_code = 'CURRENT_MEMBERSHIP_EXISTS'
       where household_id = p_household_id
         and command_id = p_command_id;

      return query select 'CURRENT_MEMBERSHIP_EXISTS'::text, null::uuid;
      return;
  end;

  update fridge.household_membership_add_command
     set outcome_code = 'ADDED',
         result_membership_id = p_candidate_membership_id
   where household_id = p_household_id
     and command_id = p_command_id;

  return query select 'ADDED'::text, p_candidate_membership_id;
end;
$$;

create or replace function fridge_internal.change_household_member_role(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_membership_id uuid,
  p_target_user_id uuid,
  p_role_code text
)
returns table (outcome_code text, result_membership_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_target_locked uuid;
  v_role_locked text;
  v_command fridge.household_membership_role_change_command%rowtype;
  v_source_membership_id uuid;
  v_source_role_code text;
  v_effective_at timestamptz;
  v_survivability boolean;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_membership_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );
  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_effective_at := clock_timestamp();

  select u.user_id
    into v_target_locked
    from fridge.user_profile u
   where u.user_id = p_target_user_id
     and u.lifecycle_status = 'ACTIVE'
   for share;
  if v_target_locked is null then
    return query select 'TARGET_OR_ROLE_INVALID'::text, null::uuid;
    return;
  end if;

  select r.role_code
    into v_role_locked
    from fridge.household_role r
   where r.role_code = p_role_code
     and r.lifecycle_status = 'ACTIVE'
     and r.is_assignable
   for share;
  if v_role_locked is null then
    return query select 'TARGET_OR_ROLE_INVALID'::text, null::uuid;
    return;
  end if;

  insert into fridge.household_membership_role_change_command (
    household_id,
    command_id,
    actor_user_id,
    target_user_id,
    requested_role_code,
    candidate_membership_id
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_target_user_id,
    p_role_code,
    p_candidate_membership_id
  )
  on conflict (household_id, command_id) do nothing;

  select c.*
    into v_command
    from fridge.household_membership_role_change_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if v_command.actor_user_id <> p_actor_user_id
     or v_command.target_user_id <> p_target_user_id
     or v_command.requested_role_code <> p_role_code then
    return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  if v_command.outcome_code = 'ROLE_CHANGED' then
    return query select 'ROLE_CHANGED'::text, v_command.result_membership_id;
    return;
  end if;

  select hm.membership_id, hm.role_code
    into v_source_membership_id, v_source_role_code
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_target_user_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= v_effective_at
     and (hm.effective_to is null or hm.effective_to > v_effective_at)
   order by hm.effective_from desc, hm.membership_id
   limit 1
   for update;

  if v_source_membership_id is null then
    return query select 'CURRENT_MEMBERSHIP_NOT_FOUND'::text, null::uuid;
    return;
  end if;

  if v_source_role_code = p_role_code then
    return query select 'ROLE_UNCHANGED'::text, null::uuid;
    return;
  end if;

  v_survivability := fridge_internal.household_membership_survivability_allows(
    p_household_id,
    v_source_membership_id,
    p_role_code
  );
  if not v_survivability then
    return query select 'SURVIVABILITY_CONFLICT'::text, null::uuid;
    return;
  end if;

  update fridge.household_membership
     set effective_to = v_effective_at
   where membership_id = v_source_membership_id;

  insert into fridge.household_membership (
    membership_id,
    household_id,
    user_id,
    role_code,
    lifecycle_status,
    effective_from,
    effective_to,
    created_by_user_id
  ) values (
    p_candidate_membership_id,
    p_household_id,
    p_target_user_id,
    p_role_code,
    'ACTIVE',
    v_effective_at,
    null,
    p_actor_user_id
  );

  update fridge.household_membership_role_change_command
     set source_membership_id = v_source_membership_id,
         result_membership_id = p_candidate_membership_id,
         outcome_code = 'ROLE_CHANGED'
   where household_id = p_household_id
     and command_id = p_command_id;

  return query select 'ROLE_CHANGED'::text, p_candidate_membership_id;
end;
$$;

create or replace function fridge_internal.end_household_membership_core(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_command_id uuid,
  p_target_user_id uuid,
  p_intent_code text
)
returns table (outcome_code text, ended_membership_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_command fridge.household_membership_end_command%rowtype;
  v_target_user_id uuid;
  v_source_membership_id uuid;
  v_effective_at timestamptz;
  v_survivability boolean;
begin
  if p_intent_code not in ('ADMIN_END', 'SELF_LEAVE') then
    return query select 'INVALID_INTENT'::text, null::uuid;
    return;
  end if;

  select u.user_id
    into v_target_user_id
    from fridge.user_profile u
   where u.user_id = p_target_user_id
   for share;

  if v_target_user_id is null then
    return query select 'CURRENT_MEMBERSHIP_NOT_FOUND'::text, null::uuid;
    return;
  end if;

  insert into fridge.household_membership_end_command (
    household_id,
    command_id,
    intent_code,
    actor_user_id,
    target_user_id
  ) values (
    p_household_id,
    p_command_id,
    p_intent_code,
    p_actor_user_id,
    p_target_user_id
  )
  on conflict (household_id, command_id) do nothing;

  select c.*
    into v_command
    from fridge.household_membership_end_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if v_command.intent_code <> p_intent_code
     or v_command.actor_user_id <> p_actor_user_id
     or v_command.target_user_id <> p_target_user_id then
    return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  if v_command.outcome_code = 'ENDED' then
    return query select 'ENDED'::text, v_command.source_membership_id;
    return;
  end if;

  -- Caller holds the Household anchor. Sample a fresh instant after any wait.
  v_effective_at := clock_timestamp();

  select hm.membership_id
    into v_source_membership_id
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_target_user_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= v_effective_at
     and (hm.effective_to is null or hm.effective_to > v_effective_at)
   order by hm.effective_from desc, hm.membership_id
   limit 1
   for update;

  if v_source_membership_id is null then
    return query select 'CURRENT_MEMBERSHIP_NOT_FOUND'::text, null::uuid;
    return;
  end if;

  v_survivability := fridge_internal.household_membership_survivability_allows(
    p_household_id,
    v_source_membership_id,
    null
  );
  if not v_survivability then
    return query select 'SURVIVABILITY_CONFLICT'::text, null::uuid;
    return;
  end if;

  update fridge.household_membership
     set effective_to = v_effective_at
   where membership_id = v_source_membership_id;

  update fridge.household_membership_end_command
     set source_membership_id = v_source_membership_id,
         outcome_code = 'ENDED'
   where household_id = p_household_id
     and command_id = p_command_id;

  return query select 'ENDED'::text, v_source_membership_id;
end;
$$;

create or replace function fridge_internal.leave_household(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid
)
returns table (outcome_code text, ended_membership_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_household_locked uuid;
  v_actor_membership_locked uuid;
  v_observed_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  select h.household_id
    into v_household_locked
    from fridge.household h
   where h.household_id = p_household_id
   for update;
  if v_household_locked is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_observed_at := clock_timestamp();

  select hm.membership_id
    into v_actor_membership_locked
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.membership_id = p_actor_membership_id
     and hm.user_id = p_actor_user_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= v_observed_at
     and (hm.effective_to is null or hm.effective_to > v_observed_at)
   for update;
  if v_actor_membership_locked is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  return query
  select c.outcome_code, c.ended_membership_id
    from fridge_internal.end_household_membership_core(
      p_household_id,
      p_actor_user_id,
      p_command_id,
      p_actor_user_id,
      'SELF_LEAVE'
    ) c;
end;
$$;

comment on function fridge_internal.acquire_household_membership_admin_authority(uuid, uuid, uuid) is
  'BE-03 authority acquisition with canonical Household-first locking and post-lock temporal observation. Current administration authority is evaluated at a fresh database time after any serialization wait.';
comment on function fridge_internal.household_membership_survivability_allows(uuid, uuid, text) is
  'BE-03 survivability guard using one fresh post-Household-lock observation time so a waiting mutation cannot count authority ended by the serialized predecessor.';
comment on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, uuid, text) is
  'BE-03 add/rejoin mutation using post-serialization effective time for current-overlap checks and the new authority interval.';
comment on function fridge_internal.change_household_member_role(uuid, uuid, uuid, uuid, uuid, uuid, text) is
  'BE-03 role transition using post-serialization effective time for target current-state interpretation and history boundary.';
comment on function fridge_internal.end_household_membership_core(uuid, uuid, uuid, uuid, text) is
  'BE-03 internal membership-end core using post-serialization effective time for target current-state interpretation and history closure.';
comment on function fridge_internal.leave_household(uuid, uuid, uuid, uuid) is
  'BE-03 self-leave boundary using post-Household-lock temporal observation before exact actor-membership revalidation.';

revoke all on function fridge_internal.household_membership_survivability_allows(uuid, uuid, text) from public;
revoke all on function fridge_internal.end_household_membership_core(uuid, uuid, uuid, uuid, text) from public;
revoke all on function fridge_internal.acquire_household_membership_admin_authority(uuid, uuid, uuid) from public;
revoke all on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, uuid, text) from public;
revoke all on function fridge_internal.change_household_member_role(uuid, uuid, uuid, uuid, uuid, uuid, text) from public;
revoke all on function fridge_internal.leave_household(uuid, uuid, uuid, uuid) from public;

grant execute on function fridge_internal.acquire_household_membership_admin_authority(uuid, uuid, uuid)
  to fridge_app;
grant execute on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;
grant execute on function fridge_internal.change_household_member_role(uuid, uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;
grant execute on function fridge_internal.leave_household(uuid, uuid, uuid, uuid)
  to fridge_app;

commit;
