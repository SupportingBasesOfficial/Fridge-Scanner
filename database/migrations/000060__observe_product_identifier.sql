-- FridgeScanner BE-05
-- 000060__observe_product_identifier.sql
-- Household-scoped raw ProductIdentifier observation as staged evidence.

begin;

create table fridge.household_identifier_observation_command_registry (
  household_id uuid not null,
  command_id uuid not null,
  intent_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_identifier_observation_command_registry_pk
    primary key (household_id, command_id),
  constraint household_identifier_observation_command_registry_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_identifier_observation_command_registry_intent_ck
    check (intent_code in ('OBSERVE_PRODUCT_IDENTIFIER'))
);

comment on table fridge.household_identifier_observation_command_registry is
  'Household-scoped CommandId-to-intent reservation for identifier observation workflows. This scope is intentionally distinct from Household catalog mutation authority.';

create table fridge.household_product_identifier_observation_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  candidate_product_id uuid,
  scheme_code text not null,
  issuer_namespace text,
  source_value text not null,
  observed_at timestamptz not null,
  result_staged_identifier_claim_id uuid not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_product_identifier_observation_command_pk
    primary key (household_id, command_id),
  constraint household_product_identifier_observation_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_product_identifier_observation_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_product_identifier_observation_command_candidate_fk
    foreign key (household_id, candidate_product_id)
    references fridge.product (owner_household_id, product_id)
    on update restrict on delete restrict,
  constraint household_product_identifier_observation_command_result_fk
    foreign key (result_staged_identifier_claim_id)
    references fridge.staged_identifier_claim (staged_identifier_claim_id)
    on update restrict on delete restrict,
  constraint household_product_identifier_observation_command_scheme_nonblank
    check (btrim(scheme_code) <> ''),
  constraint household_product_identifier_observation_command_issuer_nonblank
    check (issuer_namespace is null or btrim(issuer_namespace) <> ''),
  constraint household_product_identifier_observation_command_source_nonempty
    check (source_value <> ''),
  constraint household_product_identifier_observation_command_outcome_ck
    check (outcome_code = 'OBSERVED')
);

comment on table fridge.household_product_identifier_observation_command is
  'Durable BE-05 ObserveProductIdentifier command identity. Household-scoped CommandId binds actor and exact raw observation facts; the first committed server-generated staged claim identity is returned on replay.';

create or replace function fridge_internal.acquire_household_identifier_observation_authority(
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

  -- Observation is membership authority, not catalog-administration authority.
  -- SHARE permits concurrent observations while preserving the canonical
  -- Household -> membership -> role lock order used by governance changes.
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

comment on function fridge_internal.acquire_household_identifier_observation_authority(uuid, uuid, uuid) is
  'Revalidates exact current Household membership for identifier observation after Household/membership/role lock waits. It deliberately does not require HOUSEHOLD_CATALOG_ADMINISTER and confers no canonical catalog mutation authority.';

create or replace function fridge_internal.assert_household_identifier_observation_command_intent(
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
    from fridge.household_identifier_observation_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id;

  if v_existing_intent is not null
     and v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P5I01',
      message = 'Household identifier observation command id is reserved for another intent';
  end if;
end;
$$;

create or replace function fridge_internal.register_household_identifier_observation_command_intent(
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
  insert into fridge.household_identifier_observation_command_registry (
    household_id, command_id, intent_code
  ) values (
    p_household_id, p_command_id, p_intent_code
  )
  on conflict (household_id, command_id) do nothing;

  select r.intent_code
    into v_existing_intent
    from fridge.household_identifier_observation_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id
   for update;

  if v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P5I01',
      message = 'Household identifier observation command id is reserved for another intent';
  end if;
end;
$$;

create or replace function fridge_internal.observe_product_identifier(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_staged_identifier_claim_id uuid,
  p_candidate_product_id uuid,
  p_scheme_code text,
  p_issuer_namespace text,
  p_source_value text,
  p_observed_at timestamptz
)
returns table (
  outcome_code text,
  result_staged_identifier_claim_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_existing_actor_user_id uuid;
  v_existing_candidate_product_id uuid;
  v_existing_scheme_code text;
  v_existing_issuer_namespace text;
  v_existing_source_value text;
  v_existing_observed_at timestamptz;
  v_existing_result_claim_id uuid;
  v_existing_outcome_code text;
  v_candidate_id uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_identifier_observation_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_identifier_observation_command_intent(
    p_household_id,
    p_command_id,
    'OBSERVE_PRODUCT_IDENTIFIER'
  );

  -- Replay precedes candidate-current validation and does not rewrite later
  -- normalization/resolution state on the staged claim.
  select c.actor_user_id,
         c.candidate_product_id,
         c.scheme_code,
         c.issuer_namespace,
         c.source_value,
         c.observed_at,
         c.result_staged_identifier_claim_id,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_candidate_product_id,
         v_existing_scheme_code,
         v_existing_issuer_namespace,
         v_existing_source_value,
         v_existing_observed_at,
         v_existing_result_claim_id,
         v_existing_outcome_code
    from fridge.household_product_identifier_observation_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_candidate_product_id is distinct from p_candidate_product_id
       or v_existing_scheme_code is distinct from p_scheme_code
       or v_existing_issuer_namespace is distinct from p_issuer_namespace
       or v_existing_source_value is distinct from p_source_value
       or v_existing_observed_at is distinct from p_observed_at then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'OBSERVED' then
      perform fridge_internal.register_household_identifier_observation_command_intent(
        p_household_id,
        p_command_id,
        'OBSERVE_PRODUCT_IDENTIFIER'
      );
      return query select 'OBSERVED'::text, v_existing_result_claim_id;
      return;
    end if;

    raise exception 'unexpected ProductIdentifier observation command state';
  end if;

  if p_candidate_product_id is not null then
    select p.product_id
      into v_candidate_id
      from fridge.product p
     where p.product_id = p_candidate_product_id
       and p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
       and p.owner_household_id = p_household_id
       and p.lifecycle_status = 'ACTIVE'
     for key share;

    if v_candidate_id is null then
      return query select 'CANDIDATE_NOT_FOUND'::text, null::uuid;
      return;
    end if;
  end if;

  insert into fridge.staged_identifier_claim (
    staged_identifier_claim_id,
    household_id,
    candidate_product_id,
    scheme_code,
    issuer_namespace,
    source_value,
    normalized_value,
    normalization_rule_id,
    lifecycle_status,
    provenance,
    observed_at,
    resolved_product_identifier_id,
    resolved_at
  ) values (
    p_candidate_staged_identifier_claim_id,
    p_household_id,
    p_candidate_product_id,
    p_scheme_code,
    p_issuer_namespace,
    p_source_value,
    null,
    null,
    'STAGED',
    'BE-05 ObserveProductIdentifier',
    p_observed_at,
    null,
    null
  );

  insert into fridge.household_product_identifier_observation_command (
    household_id,
    command_id,
    actor_user_id,
    candidate_product_id,
    scheme_code,
    issuer_namespace,
    source_value,
    observed_at,
    result_staged_identifier_claim_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_candidate_product_id,
    p_scheme_code,
    p_issuer_namespace,
    p_source_value,
    p_observed_at,
    p_candidate_staged_identifier_claim_id,
    'OBSERVED'
  );

  perform fridge_internal.register_household_identifier_observation_command_intent(
    p_household_id,
    p_command_id,
    'OBSERVE_PRODUCT_IDENTIFIER'
  );

  return query select 'OBSERVED'::text, p_candidate_staged_identifier_claim_id;
end;
$$;

comment on function fridge_internal.observe_product_identifier(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz) is
  'BE-05 observation-only ProductIdentifier boundary. Revalidates current Household membership, preserves raw evidence exactly, creates only a staged claim with no normalization/canonical reservation, validates optional current same-Household candidate Product, and provides durable non-reapplying replay.';

revoke all on table fridge.household_identifier_observation_command_registry from public;
revoke all on table fridge.household_product_identifier_observation_command from public;
revoke all on function fridge_internal.acquire_household_identifier_observation_authority(uuid, uuid, uuid) from public;
revoke all on function fridge_internal.assert_household_identifier_observation_command_intent(uuid, uuid, text) from public;
revoke all on function fridge_internal.register_household_identifier_observation_command_intent(uuid, uuid, text) from public;
revoke all on function fridge_internal.observe_product_identifier(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz) from public;

grant execute on function fridge_internal.observe_product_identifier(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz)
  to fridge_app;

commit;
