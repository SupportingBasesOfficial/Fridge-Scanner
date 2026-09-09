-- FridgeScanner BE-05
-- 000059__retire_household_ingredient_concept.sql
-- Governed retirement for current Household-owned IngredientConcept plus compatibility serialization.

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
    'CHANGE_HOUSEHOLD_INGREDIENT_CONCEPT_METADATA',
    'RETIRE_HOUSEHOLD_INGREDIENT_CONCEPT'
  ));

create table fridge.household_ingredient_concept_retire_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  ingredient_concept_id uuid not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_ingredient_concept_retire_command_pk
    primary key (household_id, command_id),
  constraint household_ingredient_concept_retire_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_retire_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_retire_command_concept_fk
    foreign key (ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint household_ingredient_concept_retire_command_outcome_ck
    check (outcome_code = 'RETIRED')
);

comment on table fridge.household_ingredient_concept_retire_command is
  'Durable BE-05 RetireHouseholdIngredientConcept command identity. Household-scoped CommandId binds actor and target IngredientConcept; committed replay returns the original identity without restoring lifecycle or metadata.';

create or replace function fridge_internal.assert_current_ingredient_concept_reference(
  p_ingredient_concept_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_ingredient_concept_id uuid;
begin
  select i.ingredient_concept_id
    into v_ingredient_concept_id
    from fridge.ingredient_concept i
   where i.ingredient_concept_id = p_ingredient_concept_id
     and i.lifecycle_status = 'ACTIVE'
   for key share;

  if v_ingredient_concept_id is null then
    raise exception using
      errcode = '23514',
      message = 'current compatibility requires an eligible IngredientConcept';
  end if;
end;
$$;

-- Fail closed if any pre-existing current compatibility references a retired
-- IngredientConcept before trigger-only enforcement becomes authoritative.
do $$
begin
  if exists (
    select 1
      from fridge.product_ingredient_compatibility c
      join fridge.ingredient_concept i
        on i.ingredient_concept_id = c.ingredient_concept_id
     where c.lifecycle_status = 'ACTIVE'
       and (c.effective_to is null or c.effective_to > clock_timestamp())
       and i.lifecycle_status <> 'ACTIVE'
  ) then
    raise exception using
      errcode = '23514',
      message = 'pre-existing current compatibility references an ineligible IngredientConcept';
  end if;
end;
$$;

create or replace function fridge_internal.guard_compatibility_current_ingredient_concept()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  if new.lifecycle_status = 'ACTIVE'
     and (new.effective_to is null or new.effective_to > clock_timestamp()) then
    perform fridge_internal.assert_current_ingredient_concept_reference(
      new.ingredient_concept_id
    );
  end if;
  return new;
end;
$$;

create trigger compatibility_current_ingredient_concept_guard
before insert or update of ingredient_concept_id, lifecycle_status, effective_from, effective_to
on fridge.product_ingredient_compatibility
for each row
execute function fridge_internal.guard_compatibility_current_ingredient_concept();

create or replace function fridge_internal.retire_household_ingredient_concept(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_ingredient_concept_id uuid
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
  v_existing_outcome_code text;
  v_target_id uuid;
  v_now timestamptz;
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
    'RETIRE_HOUSEHOLD_INGREDIENT_CONCEPT'
  );

  -- Committed replay is resolved before current target/dependency validation.
  select c.actor_user_id,
         c.ingredient_concept_id,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_ingredient_concept_id,
         v_existing_outcome_code
    from fridge.household_ingredient_concept_retire_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_ingredient_concept_id is distinct from p_ingredient_concept_id then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'RETIRED' then
      perform fridge_internal.register_household_catalog_command_intent(
        p_household_id,
        p_command_id,
        'RETIRE_HOUSEHOLD_INGREDIENT_CONCEPT'
      );
      return query select 'RETIRED'::text, v_existing_ingredient_concept_id;
      return;
    end if;

    raise exception 'unexpected Household IngredientConcept retirement command state';
  end if;

  -- Canonical lock order: Household authority -> target IngredientConcept ->
  -- compatibility rows ordered by identity. Current compatibility writers take
  -- IngredientConcept KEY SHARE, so concurrent current-reference creation and
  -- retirement cannot both commit.
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

  -- Lock ACTIVE compatibility rows before sampling time so a wait cannot leave
  -- a stale effective-time decision.
  perform c.compatibility_mapping_id
    from fridge.product_ingredient_compatibility c
   where c.ingredient_concept_id = p_ingredient_concept_id
     and c.lifecycle_status = 'ACTIVE'
   order by c.compatibility_mapping_id
   for update;

  v_now := clock_timestamp();

  if exists (
    select 1
      from fridge.product_ingredient_compatibility c
     where c.ingredient_concept_id = p_ingredient_concept_id
       and c.lifecycle_status = 'ACTIVE'
       and (c.effective_to is null or c.effective_to > v_now)
  ) then
    return query select 'DEPENDENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  insert into fridge.household_ingredient_concept_retire_command (
    household_id,
    command_id,
    actor_user_id,
    ingredient_concept_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_ingredient_concept_id,
    'RETIRED'
  );

  update fridge.ingredient_concept
     set lifecycle_status = 'RETIRED'
   where ingredient_concept_id = p_ingredient_concept_id
     and owner_household_id = p_household_id
     and catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope;

  perform fridge_internal.register_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'RETIRE_HOUSEHOLD_INGREDIENT_CONCEPT'
  );

  return query select 'RETIRED'::text, p_ingredient_concept_id;
end;
$$;

comment on function fridge_internal.retire_household_ingredient_concept(uuid, uuid, uuid, uuid, uuid) is
  'BE-05 intent-specific Household IngredientConcept retirement. Revalidates current HOUSEHOLD_CATALOG_ADMINISTER authority, hides non-current/foreign/GLOBAL targets, blocks current compatibility dependencies, preserves historical compatibility/evidence, participates in shared Household catalog CommandId governance and provides non-restoring committed replay.';

revoke all on table fridge.household_ingredient_concept_retire_command from public;
revoke all on function fridge_internal.assert_current_ingredient_concept_reference(uuid) from public;
revoke all on function fridge_internal.guard_compatibility_current_ingredient_concept() from public;
revoke all on function fridge_internal.retire_household_ingredient_concept(uuid, uuid, uuid, uuid, uuid) from public;

grant execute on function fridge_internal.retire_household_ingredient_concept(uuid, uuid, uuid, uuid, uuid)
  to fridge_app;

commit;
