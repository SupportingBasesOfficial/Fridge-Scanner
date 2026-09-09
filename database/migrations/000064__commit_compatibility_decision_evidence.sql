-- FridgeScanner BE-05
-- 000064__commit_compatibility_decision_evidence.sql
-- Governed Household commit of immutable compatibility decision evidence.

begin;

create table fridge.household_compatibility_evidence_command_registry (
  household_id uuid not null,
  command_id uuid not null,
  intent_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_compatibility_evidence_command_registry_pk
    primary key (household_id, command_id),
  constraint household_compatibility_evidence_command_registry_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_compatibility_evidence_command_registry_intent_ck
    check (intent_code in ('COMMIT_COMPATIBILITY_DECISION_EVIDENCE'))
);

comment on table fridge.household_compatibility_evidence_command_registry is
  'Household-scoped CommandId reservation for immutable compatibility decision evidence workflows. This command scope is intentionally separate from catalog mutation authority.';

create table fridge.household_compatibility_evidence_commit_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  compatibility_mapping_id uuid not null,
  provenance text not null,
  result_compatibility_evidence_id uuid not null,
  result_evaluation_anchor timestamptz not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_compatibility_evidence_commit_command_pk
    primary key (household_id, command_id),
  constraint household_compatibility_evidence_commit_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_compatibility_evidence_commit_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_compatibility_evidence_commit_command_mapping_fk
    foreign key (compatibility_mapping_id)
    references fridge.product_ingredient_compatibility (compatibility_mapping_id)
    on update restrict on delete restrict,
  constraint household_compatibility_evidence_commit_command_result_fk
    foreign key (result_compatibility_evidence_id)
    references fridge.compatibility_decision_evidence (compatibility_evidence_id)
    on update restrict on delete restrict,
  constraint household_compatibility_evidence_commit_command_provenance_nonblank
    check (btrim(provenance) <> ''),
  constraint household_compatibility_evidence_commit_command_outcome_ck
    check (outcome_code = 'COMMITTED')
);

comment on table fridge.household_compatibility_evidence_commit_command is
  'Durable BE-05 CommitCompatibilityDecisionEvidence identity. Household CommandId binds actor, exact mapping and provenance; server-sampled evaluation anchor and server-generated evidence identity are replayed from the first commit.';

create or replace function fridge_internal.acquire_household_compatibility_evidence_authority(
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
  v_effective_from timestamptz;
  v_effective_to timestamptz;
  v_role_locked text;
  v_observed_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return null;
  end if;

  select h.household_id
    into v_household_locked
    from fridge.household h
   where h.household_id = p_household_id
   for share;

  if v_household_locked is null then
    return null;
  end if;

  select hm.role_code, hm.effective_from, hm.effective_to
    into v_role_code, v_effective_from, v_effective_to
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_user_id
     and hm.membership_id = p_membership_id
     and hm.lifecycle_status = 'ACTIVE'
   for update;

  if v_role_code is null then
    return null;
  end if;

  select r.role_code
    into v_role_locked
    from fridge.household_role r
   where r.role_code = v_role_code
     and r.lifecycle_status = 'ACTIVE'
   for share;

  if v_role_locked is null then
    return null;
  end if;

  v_observed_at := clock_timestamp();
  if v_effective_from > v_observed_at
     or (v_effective_to is not null and v_effective_to <= v_observed_at) then
    return null;
  end if;

  return v_role_code;
end;
$$;

comment on function fridge_internal.acquire_household_compatibility_evidence_authority(uuid,uuid,uuid) is
  'Revalidates exact current Household membership and current role for compatibility decision evidence commit. It confers no catalog mutation authority.';

create or replace function fridge_internal.assert_household_compatibility_evidence_command_intent(
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
    from fridge.household_compatibility_evidence_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id;

  if v_existing_intent is not null
     and v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P5I01',
      message = 'Household compatibility evidence command id is reserved for another intent';
  end if;
end;
$$;

create or replace function fridge_internal.register_household_compatibility_evidence_command_intent(
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
  insert into fridge.household_compatibility_evidence_command_registry (
    household_id, command_id, intent_code
  ) values (
    p_household_id, p_command_id, p_intent_code
  )
  on conflict (household_id, command_id) do nothing;

  select r.intent_code
    into v_existing_intent
    from fridge.household_compatibility_evidence_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id
   for update;

  if v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P5I01',
      message = 'Household compatibility evidence command id is reserved for another intent';
  end if;
end;
$$;

-- The original DB-02 evidence scope trigger is deferred and SECURITY INVOKER.
-- Governed app inserts need a narrow definer guard at COMMIT without exposing
-- the underlying assertion helper to runtime roles.
create or replace function fridge_internal.guard_compatibility_evidence_scope_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform fridge_internal.assert_compatibility_evidence_scope(
    new.compatibility_evidence_id
  );
  return null;
end;
$$;

comment on function fridge_internal.guard_compatibility_evidence_scope_row() is
  'Internal deferred compatibility evidence scope guard. Executes assertion logic with definer authority while remaining unavailable as a direct runtime endpoint.';

revoke all on function fridge_internal.guard_compatibility_evidence_scope_row() from public;

drop trigger compatibility_evidence_scope_guard
  on fridge.compatibility_decision_evidence;

create constraint trigger compatibility_evidence_scope_guard
after insert or update on fridge.compatibility_decision_evidence
deferrable initially deferred
for each row
execute function fridge_internal.guard_compatibility_evidence_scope_row();

create or replace function fridge_internal.commit_compatibility_decision_evidence(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_compatibility_evidence_id uuid,
  p_compatibility_mapping_id uuid,
  p_provenance text
)
returns table (
  outcome_code text,
  result_compatibility_evidence_id uuid,
  result_evaluation_anchor timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_existing_actor_user_id uuid;
  v_existing_mapping_id uuid;
  v_existing_provenance text;
  v_existing_evidence_id uuid;
  v_existing_evaluation_anchor timestamptz;
  v_existing_outcome_code text;
  v_product_id uuid;
  v_ingredient_concept_id uuid;
  v_mapping_scope fridge.catalog_scope;
  v_mapping_owner_household_id uuid;
  v_mapping_effective_from timestamptz;
  v_mapping_effective_to timestamptz;
  v_mapping_lifecycle_status text;
  v_locked_product_id uuid;
  v_locked_concept_id uuid;
  v_locked_mapping_id uuid;
  v_evaluation_anchor timestamptz;
begin
  if p_provenance is null or btrim(p_provenance) = '' then
    raise exception using errcode = '22023', message = 'compatibility evidence provenance must be nonblank';
  end if;

  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::timestamptz;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_compatibility_evidence_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::timestamptz;
    return;
  end if;

  perform fridge_internal.assert_household_compatibility_evidence_command_intent(
    p_household_id,
    p_command_id,
    'COMMIT_COMPATIBILITY_DECISION_EVIDENCE'
  );

  -- Fast committed replay path. It intentionally precedes current mapping
  -- eligibility checks so later retirement cannot invalidate a retry.
  select c.actor_user_id,
         c.compatibility_mapping_id,
         c.provenance,
         c.result_compatibility_evidence_id,
         c.result_evaluation_anchor,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_mapping_id,
         v_existing_provenance,
         v_existing_evidence_id,
         v_existing_evaluation_anchor,
         v_existing_outcome_code
    from fridge.household_compatibility_evidence_commit_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_mapping_id is distinct from p_compatibility_mapping_id
       or v_existing_provenance is distinct from p_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::timestamptz;
      return;
    end if;

    if v_existing_outcome_code = 'COMMITTED' then
      perform fridge_internal.register_household_compatibility_evidence_command_intent(
        p_household_id,
        p_command_id,
        'COMMIT_COMPATIBILITY_DECISION_EVIDENCE'
      );
      return query
        select 'COMMITTED'::text,
               v_existing_evidence_id,
               v_existing_evaluation_anchor;
      return;
    end if;

    raise exception 'unexpected compatibility evidence command state';
  end if;

  -- Read endpoint identities without locking the mapping first. All compatibility
  -- lifecycle writers use endpoint locks before their mapping lock; preserving
  -- that order prevents lock inversion.
  select m.product_id,
         m.ingredient_concept_id,
         m.catalog_scope,
         m.owner_household_id,
         m.effective_from,
         m.effective_to,
         m.lifecycle_status
    into v_product_id,
         v_ingredient_concept_id,
         v_mapping_scope,
         v_mapping_owner_household_id,
         v_mapping_effective_from,
         v_mapping_effective_to,
         v_mapping_lifecycle_status
    from fridge.product_ingredient_compatibility m
   where m.compatibility_mapping_id = p_compatibility_mapping_id
     and (
       m.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         m.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and m.owner_household_id = p_household_id
       )
     );

  if v_product_id is null or v_ingredient_concept_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select p.product_id
    into v_locked_product_id
    from fridge.product p
   where p.product_id = v_product_id
     and p.lifecycle_status = 'ACTIVE'
     and (
       p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and p.owner_household_id = p_household_id
       )
     )
   for key share;

  if v_locked_product_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select i.ingredient_concept_id
    into v_locked_concept_id
    from fridge.ingredient_concept i
   where i.ingredient_concept_id = v_ingredient_concept_id
     and i.lifecycle_status = 'ACTIVE'
     and (
       i.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         i.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and i.owner_household_id = p_household_id
       )
     )
   for key share;

  if v_locked_concept_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select m.compatibility_mapping_id,
         m.effective_from,
         m.effective_to,
         m.lifecycle_status
    into v_locked_mapping_id,
         v_mapping_effective_from,
         v_mapping_effective_to,
         v_mapping_lifecycle_status
    from fridge.product_ingredient_compatibility m
   where m.compatibility_mapping_id = p_compatibility_mapping_id
     and m.product_id = v_product_id
     and m.ingredient_concept_id = v_ingredient_concept_id
     and (
       m.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         m.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and m.owner_household_id = p_household_id
       )
     )
   for share;

  if v_locked_mapping_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::timestamptz;
    return;
  end if;

  v_evaluation_anchor := clock_timestamp();

  if v_mapping_lifecycle_status <> 'ACTIVE'
     or v_mapping_effective_from > v_evaluation_anchor
     or (v_mapping_effective_to is not null and v_mapping_effective_to <= v_evaluation_anchor) then
    return query select 'NOT_FOUND'::text, null::uuid, null::timestamptz;
    return;
  end if;

  -- Serialize first use of an absent CommandId only after first-attempt target
  -- validation. Waiters re-check the durable command row and deterministically
  -- replay or conflict instead of leaking unique-constraint failures.
  perform fridge_internal.register_household_compatibility_evidence_command_intent(
    p_household_id,
    p_command_id,
    'COMMIT_COMPATIBILITY_DECISION_EVIDENCE'
  );

  select c.actor_user_id,
         c.compatibility_mapping_id,
         c.provenance,
         c.result_compatibility_evidence_id,
         c.result_evaluation_anchor,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_mapping_id,
         v_existing_provenance,
         v_existing_evidence_id,
         v_existing_evaluation_anchor,
         v_existing_outcome_code
    from fridge.household_compatibility_evidence_commit_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_mapping_id is distinct from p_compatibility_mapping_id
       or v_existing_provenance is distinct from p_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::timestamptz;
      return;
    end if;

    if v_existing_outcome_code = 'COMMITTED' then
      return query
        select 'COMMITTED'::text,
               v_existing_evidence_id,
               v_existing_evaluation_anchor;
      return;
    end if;

    raise exception 'unexpected compatibility evidence command state after serialization';
  end if;

  insert into fridge.compatibility_decision_evidence (
    compatibility_evidence_id,
    household_id,
    product_id,
    ingredient_concept_id,
    compatibility_mapping_id,
    evaluation_anchor,
    approved_by_user_id,
    approval_reason,
    provenance,
    recorded_at
  ) values (
    p_candidate_compatibility_evidence_id,
    p_household_id,
    v_product_id,
    v_ingredient_concept_id,
    p_compatibility_mapping_id,
    v_evaluation_anchor,
    null,
    null,
    p_provenance,
    v_evaluation_anchor
  );

  insert into fridge.household_compatibility_evidence_commit_command (
    household_id,
    command_id,
    actor_user_id,
    compatibility_mapping_id,
    provenance,
    result_compatibility_evidence_id,
    result_evaluation_anchor,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_compatibility_mapping_id,
    p_provenance,
    p_candidate_compatibility_evidence_id,
    v_evaluation_anchor,
    'COMMITTED'
  );

  return query
    select 'COMMITTED'::text,
           p_candidate_compatibility_evidence_id,
           v_evaluation_anchor;
end;
$$;

comment on function fridge_internal.commit_compatibility_decision_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text) is
  'BE-05 CommitCompatibilityDecisionEvidence boundary. Revalidates current Household membership without catalog mutation authority, accepts only a currently effective visible mapping with current visible endpoints, samples evaluation anchor after locks, derives endpoint identity from the pinned mapping, persists immutable provenance without fabricating approver identity, serializes first use of evidence CommandId, and provides non-restoring replay.';

revoke all on table fridge.household_compatibility_evidence_command_registry from public;
revoke all on table fridge.household_compatibility_evidence_commit_command from public;
revoke all on function fridge_internal.acquire_household_compatibility_evidence_authority(uuid,uuid,uuid) from public;
revoke all on function fridge_internal.assert_household_compatibility_evidence_command_intent(uuid,uuid,text) from public;
revoke all on function fridge_internal.register_household_compatibility_evidence_command_intent(uuid,uuid,text) from public;
revoke all on function fridge_internal.commit_compatibility_decision_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text) from public;

grant execute on function fridge_internal.commit_compatibility_decision_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text)
  to fridge_app;

commit;
