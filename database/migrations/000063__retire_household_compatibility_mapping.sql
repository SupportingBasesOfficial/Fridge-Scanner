-- FridgeScanner BE-05
-- 000063__retire_household_compatibility_mapping.sql
-- Governed retirement of the current version in a Household compatibility mapping family.

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
    'RETIRE_HOUSEHOLD_INGREDIENT_CONCEPT',
    'CREATE_HOUSEHOLD_COMPATIBILITY_MAPPING',
    'RETIRE_HOUSEHOLD_COMPATIBILITY_MAPPING'
  ));

create table fridge.household_compatibility_mapping_retire_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  compatibility_mapping_id uuid not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_compatibility_mapping_retire_command_pk
    primary key (household_id, command_id),
  constraint household_compatibility_mapping_retire_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_compatibility_mapping_retire_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_compatibility_mapping_retire_command_mapping_fk
    foreign key (compatibility_mapping_id)
    references fridge.product_ingredient_compatibility (compatibility_mapping_id)
    on update restrict on delete restrict,
  constraint household_compatibility_mapping_retire_command_outcome_ck
    check (outcome_code = 'RETIRED')
);

comment on table fridge.household_compatibility_mapping_retire_command is
  'Durable BE-05 RetireHouseholdCompatibilityMapping command identity. Household CommandId binds actor plus exact compatibility mapping identity; committed replay is non-restoring.';

create or replace function fridge_internal.retire_household_compatibility_mapping(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_compatibility_mapping_id uuid
)
returns table (
  outcome_code text,
  result_compatibility_mapping_id uuid
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
  v_existing_outcome_code text;
  v_product_id uuid;
  v_ingredient_concept_id uuid;
  v_locked_mapping_id uuid;
  v_effective_from timestamptz;
  v_effective_to timestamptz;
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
    'RETIRE_HOUSEHOLD_COMPATIBILITY_MAPPING'
  );

  -- Committed replay is resolved before current mapping validation. A retry
  -- cannot restore, re-retire or otherwise rewrite later administrative state.
  select c.actor_user_id,
         c.compatibility_mapping_id,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_mapping_id,
         v_existing_outcome_code
    from fridge.household_compatibility_mapping_retire_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_mapping_id is distinct from p_compatibility_mapping_id then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'RETIRED' then
      perform fridge_internal.register_household_catalog_command_intent(
        p_household_id,
        p_command_id,
        'RETIRE_HOUSEHOLD_COMPATIBILITY_MAPPING'
      );
      return query select 'RETIRED'::text, v_existing_mapping_id;
      return;
    end if;

    raise exception 'unexpected Household compatibility mapping retire command state';
  end if;

  -- Read only a currently eligible Household-owned mapping to obtain endpoint
  -- identities. Foreign/GLOBAL/already-ended/already-retired/missing identities
  -- deliberately collapse to the same NOT_FOUND outcome.
  select c.product_id,
         c.ingredient_concept_id,
         c.effective_from
    into v_product_id,
         v_ingredient_concept_id,
         v_effective_from
    from fridge.product_ingredient_compatibility c
   where c.compatibility_mapping_id = p_compatibility_mapping_id
     and c.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
     and c.owner_household_id = p_household_id
     and c.lifecycle_status = 'ACTIVE'
     and c.effective_to is null;

  if v_product_id is null or v_ingredient_concept_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  -- Keep endpoint lock order aligned with compatibility creation. These locks
  -- serialize retirement against endpoint mutation without requiring endpoints
  -- to remain semantically current merely to clean up a mapping.
  perform p.product_id
    from fridge.product p
   where p.product_id = v_product_id
   for key share;

  if not found then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  perform i.ingredient_concept_id
    from fridge.ingredient_concept i
   where i.ingredient_concept_id = v_ingredient_concept_id
   for key share;

  if not found then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  -- Re-lock and revalidate the exact mapping after endpoint locks so any
  -- concurrent state change is observed before the effective end is sampled.
  select c.compatibility_mapping_id,
         c.effective_from
    into v_locked_mapping_id,
         v_effective_from
    from fridge.product_ingredient_compatibility c
   where c.compatibility_mapping_id = p_compatibility_mapping_id
     and c.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
     and c.owner_household_id = p_household_id
     and c.product_id = v_product_id
     and c.ingredient_concept_id = v_ingredient_concept_id
     and c.lifecycle_status = 'ACTIVE'
     and c.effective_to is null
   for update;

  if v_locked_mapping_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  v_effective_to := clock_timestamp();
  while v_effective_to <= v_effective_from loop
    v_effective_to := clock_timestamp();
  end loop;

  update fridge.product_ingredient_compatibility
     set effective_to = v_effective_to,
         lifecycle_status = 'RETIRED'
   where compatibility_mapping_id = p_compatibility_mapping_id;

  insert into fridge.household_compatibility_mapping_retire_command (
    household_id,
    command_id,
    actor_user_id,
    compatibility_mapping_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_compatibility_mapping_id,
    'RETIRED'
  );

  perform fridge_internal.register_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'RETIRE_HOUSEHOLD_COMPATIBILITY_MAPPING'
  );

  return query select 'RETIRED'::text, p_compatibility_mapping_id;
end;
$$;

comment on function fridge_internal.retire_household_compatibility_mapping(uuid, uuid, uuid, uuid, uuid) is
  'BE-05 intent-specific RetireHouseholdCompatibilityMapping boundary. Revalidates HOUSEHOLD_CATALOG_ADMINISTER authority, accepts only current same-Household mapping identity, serializes with endpoint mutation, samples an effective end after locks, changes only lifecycle/effective end, preserves family/version/endpoints/history, and provides non-restoring committed replay.';

revoke all on table fridge.household_compatibility_mapping_retire_command from public;
revoke all on function fridge_internal.retire_household_compatibility_mapping(uuid, uuid, uuid, uuid, uuid) from public;

grant execute on function fridge_internal.retire_household_compatibility_mapping(uuid, uuid, uuid, uuid, uuid)
  to fridge_app;

commit;
