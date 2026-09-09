-- FridgeScanner BE-05
-- 000062__create_household_compatibility_mapping.sql
-- Governed creation of the first version in a Household compatibility mapping family.

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
    'CREATE_HOUSEHOLD_COMPATIBILITY_MAPPING'
  ));

-- The original DB-02 compatibility scope trigger is deferred and SECURITY
-- INVOKER. A governed app write therefore needs a dedicated definer guard at
-- COMMIT without receiving EXECUTE on the underlying assertion helper.
create or replace function fridge_internal.guard_compatibility_mapping_scope_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform fridge_internal.assert_compatibility_mapping_scope(
    new.compatibility_mapping_id
  );
  return null;
end;
$$;

comment on function fridge_internal.guard_compatibility_mapping_scope_row() is
  'Internal deferred compatibility mapping scope guard. Runs with definer authority so a governed app write can commit without exposing assertion helpers to runtime roles.';

revoke all on function fridge_internal.guard_compatibility_mapping_scope_row() from public;

drop trigger compatibility_mapping_scope_guard
  on fridge.product_ingredient_compatibility;

create constraint trigger compatibility_mapping_scope_guard
after insert or update on fridge.product_ingredient_compatibility
deferrable initially deferred
for each row
execute function fridge_internal.guard_compatibility_mapping_scope_row();

create table fridge.household_compatibility_mapping_create_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  product_id uuid not null,
  ingredient_concept_id uuid not null,
  result_mapping_family_id uuid not null,
  result_compatibility_mapping_id uuid not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_compatibility_mapping_create_command_pk
    primary key (household_id, command_id),
  constraint household_compatibility_mapping_create_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_compatibility_mapping_create_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_compatibility_mapping_create_command_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint household_compatibility_mapping_create_command_concept_fk
    foreign key (ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint household_compatibility_mapping_create_command_mapping_fk
    foreign key (result_compatibility_mapping_id)
    references fridge.product_ingredient_compatibility (compatibility_mapping_id)
    on update restrict on delete restrict,
  constraint household_compatibility_mapping_create_command_outcome_ck
    check (outcome_code = 'CREATED')
);

comment on table fridge.household_compatibility_mapping_create_command is
  'Durable BE-05 CreateHouseholdCompatibilityMapping command identity. Household CommandId binds actor plus exact Product/IngredientConcept endpoints; server-generated family/mapping candidates are excluded from the semantic fingerprint and committed replay returns the original identities.';

create or replace function fridge_internal.create_household_compatibility_mapping(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_mapping_family_id uuid,
  p_candidate_compatibility_mapping_id uuid,
  p_product_id uuid,
  p_ingredient_concept_id uuid
)
returns table (
  outcome_code text,
  result_mapping_family_id uuid,
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
  v_existing_product_id uuid;
  v_existing_ingredient_concept_id uuid;
  v_existing_mapping_family_id uuid;
  v_existing_compatibility_mapping_id uuid;
  v_existing_outcome_code text;
  v_product_id uuid;
  v_concept_id uuid;
  v_effective_from timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid;
    return;
  end if;

  -- Household catalog authority is the serialization anchor for every private
  -- compatibility mutation and is revalidated after its governance locks.
  v_actor_role_code := fridge_internal.acquire_household_catalog_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_HOUSEHOLD_COMPATIBILITY_MAPPING'
  );

  -- Committed replay precedes current endpoint validation. A later endpoint or
  -- mapping retirement must not cause a retry to re-create/reactivate truth.
  select c.actor_user_id,
         c.product_id,
         c.ingredient_concept_id,
         c.result_mapping_family_id,
         c.result_compatibility_mapping_id,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_product_id,
         v_existing_ingredient_concept_id,
         v_existing_mapping_family_id,
         v_existing_compatibility_mapping_id,
         v_existing_outcome_code
    from fridge.household_compatibility_mapping_create_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_product_id is distinct from p_product_id
       or v_existing_ingredient_concept_id is distinct from p_ingredient_concept_id then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CREATED' then
      perform fridge_internal.register_household_catalog_command_intent(
        p_household_id,
        p_command_id,
        'CREATE_HOUSEHOLD_COMPATIBILITY_MAPPING'
      );
      return query
        select 'CREATED'::text,
               v_existing_mapping_family_id,
               v_existing_compatibility_mapping_id;
      return;
    end if;

    raise exception 'unexpected Household compatibility mapping create command state';
  end if;

  -- Current endpoint locks serialize with Product/IngredientConcept retirement.
  -- A HOUSEHOLD mapping may point at GLOBAL or same-Household catalog truth.
  select p.product_id
    into v_product_id
    from fridge.product p
   where p.product_id = p_product_id
     and p.lifecycle_status = 'ACTIVE'
     and (
       p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and p.owner_household_id = p_household_id
       )
     )
   for key share;

  if v_product_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  select i.ingredient_concept_id
    into v_concept_id
    from fridge.ingredient_concept i
   where i.ingredient_concept_id = p_ingredient_concept_id
     and i.lifecycle_status = 'ACTIVE'
     and (
       i.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         i.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and i.owner_household_id = p_household_id
       )
     )
   for key share;

  if v_concept_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  -- One Household lineage per endpoint pair. Any future semantic change must
  -- version this family instead of fragmenting history into parallel families.
  perform c.compatibility_mapping_id
    from fridge.product_ingredient_compatibility c
   where c.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
     and c.owner_household_id = p_household_id
     and c.product_id = p_product_id
     and c.ingredient_concept_id = p_ingredient_concept_id
   order by c.mapping_family_id, c.version_no, c.compatibility_mapping_id
   for update;

  if found then
    return query select 'CONFLICT'::text, null::uuid, null::uuid;
    return;
  end if;

  -- Current time is sampled only after authority and endpoint/history locks.
  v_effective_from := clock_timestamp();

  insert into fridge.product_ingredient_compatibility (
    compatibility_mapping_id,
    mapping_family_id,
    version_no,
    catalog_scope,
    owner_household_id,
    product_id,
    ingredient_concept_id,
    effective_from,
    effective_to,
    lifecycle_status,
    recorded_at
  ) values (
    p_candidate_compatibility_mapping_id,
    p_candidate_mapping_family_id,
    1,
    'HOUSEHOLD',
    p_household_id,
    p_product_id,
    p_ingredient_concept_id,
    v_effective_from,
    null,
    'ACTIVE',
    v_effective_from
  );

  insert into fridge.household_compatibility_mapping_create_command (
    household_id,
    command_id,
    actor_user_id,
    product_id,
    ingredient_concept_id,
    result_mapping_family_id,
    result_compatibility_mapping_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_product_id,
    p_ingredient_concept_id,
    p_candidate_mapping_family_id,
    p_candidate_compatibility_mapping_id,
    'CREATED'
  );

  perform fridge_internal.register_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_HOUSEHOLD_COMPATIBILITY_MAPPING'
  );

  return query
    select 'CREATED'::text,
           p_candidate_mapping_family_id,
           p_candidate_compatibility_mapping_id;
end;
$$;

comment on function fridge_internal.create_household_compatibility_mapping(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) is
  'BE-05 intent-specific CreateHouseholdCompatibilityMapping boundary. Revalidates HOUSEHOLD_CATALOG_ADMINISTER authority, forces HOUSEHOLD scope/owner, accepts only current GLOBAL or same-Household Product and IngredientConcept endpoints, creates family version 1 with database-sampled effective time, rejects parallel family fragmentation, participates in shared Household CommandId governance, and provides non-restoring committed replay.';

revoke all on table fridge.household_compatibility_mapping_create_command from public;
revoke all on function fridge_internal.create_household_compatibility_mapping(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public;

grant execute on function fridge_internal.create_household_compatibility_mapping(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid)
  to fridge_app;

commit;
