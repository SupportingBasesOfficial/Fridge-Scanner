-- FridgeScanner BE-05
-- 000060_02__serialize_product_identifier_observation_command.sql
-- Deterministic first-use serialization for Household identifier observation CommandId.

begin;

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

  -- Fast committed replay path. This intentionally precedes current candidate
  -- validation so a retry never depends on later candidate lifecycle changes.
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

  -- An absent command row cannot itself be locked. Reserve and lock the
  -- Household observation CommandId only after first-attempt validation, then
  -- re-check the command row. A concurrent first writer can therefore commit
  -- at most one staged observation; waiters deterministically replay/conflict.
  perform fridge_internal.register_household_identifier_observation_command_intent(
    p_household_id,
    p_command_id,
    'OBSERVE_PRODUCT_IDENTIFIER'
  );

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
      return query select 'OBSERVED'::text, v_existing_result_claim_id;
      return;
    end if;

    raise exception 'unexpected ProductIdentifier observation command state after serialization';
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

  return query select 'OBSERVED'::text, p_candidate_staged_identifier_claim_id;
end;
$$;

comment on function fridge_internal.observe_product_identifier(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz) is
  'BE-05 observation-only ProductIdentifier boundary. Revalidates current Household membership, preserves raw evidence exactly, creates only staged evidence, validates an optional current private candidate, serializes first use of Household observation CommandId after validation, re-checks replay after serialization, and never creates canonical identifier authority.';

revoke all on function fridge_internal.observe_product_identifier(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz) from public;
grant execute on function fridge_internal.observe_product_identifier(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz)
  to fridge_app;

commit;
