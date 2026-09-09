-- FridgeScanner BE-05
-- 000057__create_household_ingredient_concept.sql
-- Governed, idempotent creation of a Household-owned IngredientConcept.

begin;

alter table fridge.household_catalog_command_registry
  drop constraint household_catalog_command_registry_intent_ck;

alter table fridge.household_catalog_command_registry
  add constraint household_catalog_command_registry_intent_ck
  check (intent_code in (
    'CREATE_HOUSEHOLD_PRODUCT',
    'CHANGE_HOUSEHOLD_PRODUCT_METADATA',
    'RETIRE_HOUSEHOLD_PRODUCT',
    'CREATE_HOUSEHOLD_INGREDIENT_CONCEPT'
  ));

create table fridge.household_ingredient_concept_create_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  candidate_ingredient_concept_id uuid not null,
  canonical_name text not null,
  result_ingredient_concept_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_ingredient_concept_create_command_pk
    primary key (household_id, command_id),
  constraint household_ingredient_concept_create_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_create_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_create_command_result_fk
    foreign key (result_ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_create_command_name_nonblank
    check (btrim(canonical_name) <> ''),
  constraint household_ingredient_concept_create_command_outcome_ck
    check (outcome_code in ('PENDING', 'CREATED')),
  constraint household_ingredient_concept_create_command_result_ck
    check (
      (outcome_code = 'CREATED' and result_ingredient_concept_id is not null)
      or (outcome_code = 'PENDING' and result_ingredient_concept_id is null)
    )
);

comment on table fridge.household_ingredient_concept_create_command is
  'Durable BE-05 CreateHouseholdIngredientConcept command identity. Household-scoped CommandId binds actor and exact canonical name; first committed internal candidate identity is returned by replay.';

create or replace function fridge_internal.create_household_ingredient_concept(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_ingredient_concept_id uuid,
  p_canonical_name text
)
returns table (
  outcome_code text,
  result_ingredient_concept_id uuid
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
  v_existing_canonical_name text;
  v_existing_outcome_code text;
  v_existing_result_ingredient_concept_id uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_catalog_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_HOUSEHOLD_INGREDIENT_CONCEPT'
  );

  -- Replay precedes any new entity-state application. Candidate identity is
  -- server-generated and deliberately excluded from the semantic fingerprint.
  select c.actor_user_id,
         c.canonical_name,
         c.outcome_code,
         c.result_ingredient_concept_id
    into v_existing_actor_user_id,
         v_existing_canonical_name,
         v_existing_outcome_code,
         v_existing_result_ingredient_concept_id
    from fridge.household_ingredient_concept_create_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_canonical_name is distinct from p_canonical_name then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CREATED'
       and v_existing_result_ingredient_concept_id is not null then
      perform fridge_internal.register_household_catalog_command_intent(
        p_household_id,
        p_command_id,
        'CREATE_HOUSEHOLD_INGREDIENT_CONCEPT'
      );
      return query select 'CREATED'::text, v_existing_result_ingredient_concept_id;
      return;
    end if;

    raise exception 'unexpected pending Household IngredientConcept create command';
  end if;

  v_created_at := clock_timestamp();

  insert into fridge.household_ingredient_concept_create_command (
    household_id,
    command_id,
    actor_user_id,
    candidate_ingredient_concept_id,
    canonical_name,
    result_ingredient_concept_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_candidate_ingredient_concept_id,
    p_canonical_name,
    null,
    'PENDING'
  );

  insert into fridge.ingredient_concept (
    ingredient_concept_id,
    catalog_scope,
    owner_household_id,
    canonical_name,
    lifecycle_status,
    created_at
  ) values (
    p_candidate_ingredient_concept_id,
    'HOUSEHOLD'::fridge.catalog_scope,
    p_household_id,
    p_canonical_name,
    'ACTIVE',
    v_created_at
  );

  update fridge.household_ingredient_concept_create_command
     set outcome_code = 'CREATED',
         result_ingredient_concept_id = p_candidate_ingredient_concept_id
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_HOUSEHOLD_INGREDIENT_CONCEPT'
  );

  return query select 'CREATED'::text, p_candidate_ingredient_concept_id;
end;
$$;

comment on function fridge_internal.create_household_ingredient_concept(uuid, uuid, uuid, uuid, uuid, text) is
  'BE-05 intent-specific CreateHouseholdIngredientConcept boundary. Revalidates current HOUSEHOLD_CATALOG_ADMINISTER authority, forces HOUSEHOLD scope and exact owner Household, durably binds command semantics and first internal identity, and provides non-reapplying committed replay.';

revoke all on table fridge.household_ingredient_concept_create_command from public;
revoke all on function fridge_internal.create_household_ingredient_concept(uuid, uuid, uuid, uuid, uuid, text) from public;

grant execute on function fridge_internal.create_household_ingredient_concept(uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;

commit;
