-- FridgeScanner BE-05
-- 000058__change_household_ingredient_concept_metadata.sql
-- Governed metadata mutation for current Household-owned IngredientConcept.

begin;

alter table fridge.household_catalog_command_registry
  drop constraint household_catalog_command_registry_intent_ck;

alter table fridge.household_catalog_command_registry
  add constraint household_catalog_command_registry_intent_ck
  check (intent_code in (
    'CREATE_HOUSEHOLD_PRODUCT',
    'CHANGE_HOUSEHOLD_PRODUCT_METADATA',
    'RETIRE_HOUSEHOLD_PRODUCT',
    'CREATE_HOUSEHOLD_INGREDIENT_CONCEPT',
    'CHANGE_HOUSEHOLD_INGREDIENT_CONCEPT_METADATA'
  ));

create table fridge.household_ingredient_concept_metadata_change_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  ingredient_concept_id uuid not null,
  canonical_name text not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_ingredient_concept_metadata_change_command_pk
    primary key (household_id, command_id),
  constraint household_ingredient_concept_metadata_change_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_metadata_change_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_metadata_change_command_concept_fk
    foreign key (ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_metadata_change_command_name_nonblank
    check (btrim(canonical_name) <> ''),
  constraint household_ingredient_concept_metadata_change_command_outcome_ck
    check (outcome_code = 'CHANGED')
);

comment on table fridge.household_ingredient_concept_metadata_change_command is
  'Durable BE-05 ChangeHouseholdIngredientConceptMetadata command identity. Household-scoped CommandId binds actor, target IngredientConcept and exact requested canonical name; committed replay returns the original target identity without restoring later state.';

create or replace function fridge_internal.change_household_ingredient_concept_metadata(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_ingredient_concept_id uuid,
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
  v_existing_actor_user_id uuid;
  v_existing_ingredient_concept_id uuid;
  v_existing_canonical_name text;
  v_existing_outcome_code text;
  v_target_id uuid;
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
    'CHANGE_HOUSEHOLD_INGREDIENT_CONCEPT_METADATA'
  );

  -- Committed replay is resolved before current target validation so retry
  -- never restores later IngredientConcept lifecycle or metadata state.
  select c.actor_user_id,
         c.ingredient_concept_id,
         c.canonical_name,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_ingredient_concept_id,
         v_existing_canonical_name,
         v_existing_outcome_code
    from fridge.household_ingredient_concept_metadata_change_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_ingredient_concept_id is distinct from p_ingredient_concept_id
       or v_existing_canonical_name is distinct from p_canonical_name then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CHANGED' then
      perform fridge_internal.register_household_catalog_command_intent(
        p_household_id,
        p_command_id,
        'CHANGE_HOUSEHOLD_INGREDIENT_CONCEPT_METADATA'
      );
      return query select 'CHANGED'::text, v_existing_ingredient_concept_id;
      return;
    end if;

    raise exception 'unexpected Household IngredientConcept metadata-change command state';
  end if;

  select i.ingredient_concept_id
    into v_target_id
    from fridge.ingredient_concept i
   where i.ingredient_concept_id = p_ingredient_concept_id
     and i.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
     and i.owner_household_id = p_household_id
     and i.lifecycle_status = 'ACTIVE'
   for update;

  if v_target_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  insert into fridge.household_ingredient_concept_metadata_change_command (
    household_id,
    command_id,
    actor_user_id,
    ingredient_concept_id,
    canonical_name,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_ingredient_concept_id,
    p_canonical_name,
    'CHANGED'
  );

  update fridge.ingredient_concept
     set canonical_name = p_canonical_name
   where ingredient_concept_id = p_ingredient_concept_id
     and owner_household_id = p_household_id
     and catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope;

  perform fridge_internal.register_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'CHANGE_HOUSEHOLD_INGREDIENT_CONCEPT_METADATA'
  );

  return query select 'CHANGED'::text, p_ingredient_concept_id;
end;
$$;

comment on function fridge_internal.change_household_ingredient_concept_metadata(uuid, uuid, uuid, uuid, uuid, text) is
  'BE-05 intent-specific Household IngredientConcept metadata mutation. Revalidates current HOUSEHOLD_CATALOG_ADMINISTER authority, hides non-current/foreign/GLOBAL targets, preserves immutable IngredientConcept identity/scope/owner/lifecycle, participates in shared Household catalog CommandId governance and provides non-restoring committed replay.';

revoke all on table fridge.household_ingredient_concept_metadata_change_command from public;
revoke all on function fridge_internal.change_household_ingredient_concept_metadata(uuid, uuid, uuid, uuid, uuid, text) from public;

grant execute on function fridge_internal.change_household_ingredient_concept_metadata(uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;

commit;
