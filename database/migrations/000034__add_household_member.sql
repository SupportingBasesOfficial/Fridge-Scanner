-- FridgeScanner BE-03
-- 000034__add_household_member.sql
-- Governed, history-preserving add/rejoin mutation for an existing platform principal.

begin;

create table fridge.household_membership_add_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  target_user_id uuid not null,
  role_code text not null,
  candidate_membership_id uuid not null,
  result_membership_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_membership_add_command_pk
    primary key (household_id, command_id),
  constraint household_membership_add_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_membership_add_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_membership_add_command_target_fk
    foreign key (target_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_membership_add_command_role_fk
    foreign key (role_code)
    references fridge.household_role (role_code)
    on update restrict on delete restrict,
  constraint household_membership_add_command_outcome_ck
    check (outcome_code in ('PENDING', 'ADDED', 'CURRENT_MEMBERSHIP_EXISTS')),
  constraint household_membership_add_command_result_ck
    check (
      (outcome_code = 'ADDED' and result_membership_id is not null)
      or (outcome_code <> 'ADDED' and result_membership_id is null)
    )
);

comment on table fridge.household_membership_add_command is
  'Durable BE-03 command identity for add/rejoin membership intent. A committed command cannot later be replayed as a new authority interval after the original membership has ended.';

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
begin
  -- Household context is server-set inside the accepted transaction boundary.
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Revalidate and lock the actor's stronger administration authority in this
  -- exact transaction. A TypeScript brand is never the only security boundary.
  v_actor_role_code := fridge_internal.acquire_household_membership_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Lifecycle validation must remain true through the mutation. FOR SHARE blocks
  -- a concurrent non-key lifecycle update/retirement of the target principal.
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

  -- Collapse target-existence and role-governance failure so this privileged
  -- surface is not useful as a global principal-existence oracle.
  if coalesce(v_target_exists, false) is false
     or coalesce(v_role_assignable, false) is false then
    return query select 'TARGET_OR_ROLE_INVALID'::text, null::uuid;
    return;
  end if;

  -- Reserve command identity before inspecting current target membership. A
  -- replay of a previously committed add therefore resolves from the durable
  -- command record even if that membership was later ended.
  insert into fridge.household_membership_add_command (
    household_id,
    command_id,
    actor_user_id,
    target_user_id,
    role_code,
    candidate_membership_id,
    result_membership_id,
    outcome_code
  )
  values (
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

    -- A committed PENDING row is forbidden by this function's transaction model.
    -- Treat any such unexpected durable state as an internal contract failure.
    raise exception 'unexpected pending Household membership add command';
  end if;

  -- The partial unique index protects one open interval, but current authority is
  -- the effective interval. Explicitly lock and reject any membership that is
  -- still effective now, including a row whose effective_to is non-null but in
  -- the future, so immediate add cannot create overlapping current authority.
  select hm.membership_id
    into v_current_membership_id
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_target_user_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp())
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
    )
    values (
      p_candidate_membership_id,
      p_household_id,
      p_target_user_id,
      p_role_code,
      'ACTIVE',
      statement_timestamp(),
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

comment on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, uuid, text) is
  'BE-03 intent-specific add/rejoin mutation with durable command identity. Revalidates Household membership-administration authority, locks active target lifecycle and governed role facts, prevents overlapping current authority, preserves prior history, and makes committed command replay non-mutating.';

revoke all on table fridge.household_membership_add_command from public;
revoke all on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, uuid, text) from public;
grant execute on function fridge_internal.add_household_member(uuid, uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;

commit;
