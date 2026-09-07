-- FridgeScanner BE-03
-- 000037__end_household_membership.sql
-- History-preserving, retry-safe administrative membership end and self-leave.

begin;

create table fridge.household_membership_end_command (
  household_id uuid not null,
  command_id uuid not null,
  intent_code text not null,
  actor_user_id uuid not null,
  target_user_id uuid not null,
  source_membership_id uuid,
  outcome_code text not null default 'PENDING',
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_membership_end_command_pk
    primary key (household_id, command_id),
  constraint household_membership_end_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_membership_end_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_membership_end_command_target_fk
    foreign key (target_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_membership_end_command_intent_ck
    check (intent_code in ('ADMIN_END', 'SELF_LEAVE')),
  constraint household_membership_end_command_outcome_ck
    check (outcome_code in ('PENDING', 'ENDED')),
  constraint household_membership_end_command_result_ck
    check (
      (outcome_code = 'PENDING' and source_membership_id is null)
      or
      (outcome_code = 'ENDED' and source_membership_id is not null)
    )
);

comment on table fridge.household_membership_end_command is
  'Internal BE-03 idempotency and actor-provenance ledger for committed membership-end intents. Stable command identity binds intent, actor and target so replay cannot end a later rejoined interval or cross from self-leave into administrative removal.';

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
  v_source_membership_id uuid;
  v_effective_at timestamptz;
  v_survivability boolean;
begin
  if p_intent_code not in ('ADMIN_END', 'SELF_LEAVE') then
    return query select 'INVALID_INTENT'::text, null::uuid;
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

  select hm.membership_id
    into v_source_membership_id
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_target_user_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp())
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

  v_effective_at := statement_timestamp();

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

create or replace function fridge_internal.end_household_membership(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_target_user_id uuid
)
returns table (outcome_code text, ended_membership_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Administrative end requires the accepted stronger authority. Acquisition
  -- establishes canonical Household-first serialization before actor/target locks.
  v_actor_role_code := fridge_internal.acquire_household_membership_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );
  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  return query
  select c.outcome_code, c.ended_membership_id
    from fridge_internal.end_household_membership_core(
      p_household_id,
      p_actor_user_id,
      p_command_id,
      p_target_user_id,
      'ADMIN_END'
    ) c;
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
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Self-leave is current-membership authority, not administration authority.
  -- It still begins with the same Household serialization anchor so concurrent
  -- authority-reducing operations cannot write-skew around survivability.
  select h.household_id
    into v_household_locked
    from fridge.household h
   where h.household_id = p_household_id
   for update;
  if v_household_locked is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Revalidate the exact membership observed by the accepted authorized
  -- transaction. A stale handle cannot be used to leave a later rejoined interval.
  select hm.membership_id
    into v_actor_membership_locked
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.membership_id = p_actor_membership_id
     and hm.user_id = p_actor_user_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp())
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

comment on function fridge_internal.end_household_membership(uuid, uuid, uuid, uuid, uuid) is
  'BE-03 governed administrative membership end. Revalidates membership-administration authority, closes current history atomically with survivability, records durable actor provenance, and makes committed retries non-restoring.';

comment on function fridge_internal.leave_household(uuid, uuid, uuid, uuid) is
  'BE-03 governed self-leave. Revalidates the actor current membership without requiring administration capability, serializes on Household, enforces last-administrator survivability, and makes committed retries non-restoring.';

revoke all on table fridge.household_membership_end_command from public;
revoke all on function fridge_internal.end_household_membership_core(uuid, uuid, uuid, uuid, text) from public;
revoke all on function fridge_internal.end_household_membership(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function fridge_internal.leave_household(uuid, uuid, uuid, uuid) from public;

grant execute on function fridge_internal.end_household_membership(uuid, uuid, uuid, uuid, uuid)
  to fridge_app;
grant execute on function fridge_internal.leave_household(uuid, uuid, uuid, uuid)
  to fridge_app;

commit;
