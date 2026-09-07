-- FridgeScanner BE-03
-- 000036__change_household_member_role.sql
-- History-preserving, retry-safe Household membership role transition.

begin;

create table fridge.household_membership_role_change_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  target_user_id uuid not null,
  requested_role_code text not null,
  candidate_membership_id uuid not null,
  source_membership_id uuid,
  result_membership_id uuid,
  outcome_code text not null default 'PENDING',
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_membership_role_change_command_pk
    primary key (household_id, command_id),
  constraint household_membership_role_change_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_membership_role_change_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_membership_role_change_command_target_fk
    foreign key (target_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_membership_role_change_command_role_fk
    foreign key (requested_role_code) references fridge.household_role (role_code)
    on update restrict on delete restrict,
  constraint household_membership_role_change_command_outcome_ck
    check (outcome_code in ('PENDING', 'ROLE_CHANGED')),
  constraint household_membership_role_change_command_result_ck
    check (
      (outcome_code = 'PENDING' and source_membership_id is null and result_membership_id is null)
      or
      (outcome_code = 'ROLE_CHANGED' and source_membership_id is not null and result_membership_id is not null)
    )
);

comment on table fridge.household_membership_role_change_command is
  'Internal BE-03 idempotency ledger for committed Household membership role transitions. Stable command identity binds actor, target and requested post-role and replays the original result without applying another historical transition.';

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

  -- Canonical BE-03 lock order starts with Household through authority acquisition.
  v_actor_role_code := fridge_internal.acquire_household_membership_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );
  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Target is platform identity, not provider metadata. SHARE keeps lifecycle ACTIVE
  -- authoritative through commit while still permitting ordinary reads.
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

  -- Requested post-role must be current governed assignable reference data.
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

  -- Reserve stable command identity before target-state interpretation so a
  -- committed role transition can always be replayed to its original result.
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

  -- Current target state is database truth. Lock the exact effective interval.
  select hm.membership_id, hm.role_code
    into v_source_membership_id, v_source_role_code
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

  if v_source_role_code = p_role_code then
    return query select 'ROLE_UNCHANGED'::text, null::uuid;
    return;
  end if;

  -- Self-role-change is explicitly allowed under the same policy as any target:
  -- the actor had administration authority at transaction start and the post-state
  -- must preserve the survivability invariant atomically.
  v_survivability := fridge_internal.household_membership_survivability_allows(
    p_household_id,
    v_source_membership_id,
    p_role_code
  );
  if not v_survivability then
    return query select 'SURVIVABILITY_CONFLICT'::text, null::uuid;
    return;
  end if;

  v_effective_at := statement_timestamp();

  -- Preserve prior authority history by closing the source interval. Never rewrite
  -- role_code on a historical membership row.
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

comment on function fridge_internal.change_household_member_role(uuid, uuid, uuid, uuid, uuid, uuid, text) is
  'BE-03 governed role transition. Revalidates actor authority, validates target/role, preserves history via interval closure plus a new membership row, enforces atomic last-administrator survivability, and replays committed CommandId results without applying a second transition.';

revoke all on table fridge.household_membership_role_change_command from public;
revoke all on function fridge_internal.change_household_member_role(uuid, uuid, uuid, uuid, uuid, uuid, text) from public;

grant execute on function fridge_internal.change_household_member_role(uuid, uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;

commit;
