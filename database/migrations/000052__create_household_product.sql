-- FridgeScanner BE-05
-- 000052__create_household_product.sql
-- Governed, idempotent creation of a Household-owned Product plus shared Household catalog CommandId registry.

begin;

create table fridge.household_catalog_command_registry (
  household_id uuid not null,
  command_id uuid not null,
  intent_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_catalog_command_registry_pk
    primary key (household_id, command_id),
  constraint household_catalog_command_registry_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_catalog_command_registry_intent_ck
    check (intent_code in ('CREATE_HOUSEHOLD_PRODUCT'))
);

comment on table fridge.household_catalog_command_registry is
  'Canonical BE-05 Household-scoped CommandId-to-intent reservation. A committed Household catalog CommandId belongs to exactly one semantic catalog intent.';

create or replace function fridge_internal.assert_household_catalog_command_intent(
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
    from fridge.household_catalog_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id;

  if v_existing_intent is not null
     and v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P5I01',
      message = 'Household catalog command id is reserved for another intent';
  end if;
end;
$$;

create or replace function fridge_internal.register_household_catalog_command_intent(
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
  insert into fridge.household_catalog_command_registry (
    household_id,
    command_id,
    intent_code
  ) values (
    p_household_id,
    p_command_id,
    p_intent_code
  )
  on conflict (household_id, command_id) do nothing;

  select r.intent_code
    into v_existing_intent
    from fridge.household_catalog_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id
   for update;

  if v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P5I01',
      message = 'Household catalog command id is reserved for another intent';
  end if;
end;
$$;

create table fridge.household_product_create_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  candidate_product_id uuid not null,
  canonical_name text not null,
  result_product_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_product_create_command_pk
    primary key (household_id, command_id),
  constraint household_product_create_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_product_create_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_product_create_command_result_fk
    foreign key (result_product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint household_product_create_command_name_nonblank
    check (btrim(canonical_name) <> ''),
  constraint household_product_create_command_outcome_ck
    check (outcome_code in ('PENDING', 'CREATED')),
  constraint household_product_create_command_result_ck
    check (
      (outcome_code = 'CREATED' and result_product_id is not null)
      or (outcome_code = 'PENDING' and result_product_id is null)
    )
);

comment on table fridge.household_product_create_command is
  'Durable BE-05 CreateHouseholdProduct command identity. The Household-scoped CommandId binds actor and exact canonical name; the first committed server-generated candidate ProductId becomes the durable result returned by replay.';

create or replace function fridge_internal.create_household_product(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_product_id uuid,
  p_canonical_name text
)
returns table (
  outcome_code text,
  result_product_id uuid
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
  v_existing_result_product_id uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  -- Authority acquisition establishes the Household serialization anchor and
  -- performs fresh post-governance-lock current-authority validation.
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
    'CREATE_HOUSEHOLD_PRODUCT'
  );

  -- Replay is checked before any new Product state is applied. Candidate identity
  -- is deliberately excluded from the semantic fingerprint.
  select c.actor_user_id,
         c.canonical_name,
         c.outcome_code,
         c.result_product_id
    into v_existing_actor_user_id,
         v_existing_canonical_name,
         v_existing_outcome_code,
         v_existing_result_product_id
    from fridge.household_product_create_command c
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
       and v_existing_result_product_id is not null then
      perform fridge_internal.register_household_catalog_command_intent(
        p_household_id,
        p_command_id,
        'CREATE_HOUSEHOLD_PRODUCT'
      );
      return query select 'CREATED'::text, v_existing_result_product_id;
      return;
    end if;

    raise exception 'unexpected pending Household Product create command';
  end if;

  -- The creation instant is sampled only after Household authority serialization.
  v_created_at := clock_timestamp();

  insert into fridge.household_product_create_command (
    household_id,
    command_id,
    actor_user_id,
    candidate_product_id,
    canonical_name,
    result_product_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_candidate_product_id,
    p_canonical_name,
    null,
    'PENDING'
  );

  insert into fridge.product (
    product_id,
    catalog_scope,
    owner_household_id,
    canonical_name,
    brand_id,
    manufacturer_id,
    product_category_id,
    lifecycle_status,
    created_at
  ) values (
    p_candidate_product_id,
    'HOUSEHOLD'::fridge.catalog_scope,
    p_household_id,
    p_canonical_name,
    null,
    null,
    null,
    'ACTIVE',
    v_created_at
  );

  update fridge.household_product_create_command
     set outcome_code = 'CREATED',
         result_product_id = p_candidate_product_id
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_HOUSEHOLD_PRODUCT'
  );

  return query select 'CREATED'::text, p_candidate_product_id;
end;
$$;

comment on function fridge_internal.create_household_product(uuid, uuid, uuid, uuid, uuid, text) is
  'BE-05 intent-specific CreateHouseholdProduct persistence boundary. Revalidates current HOUSEHOLD_CATALOG_ADMINISTER authority, forces HOUSEHOLD scope and exact owner Household, durably binds stable command facts and first internal Product candidate, samples creation time after authority serialization and provides non-reapplying committed replay.';

revoke all on table fridge.household_catalog_command_registry from public;
revoke all on table fridge.household_product_create_command from public;
revoke all on function fridge_internal.assert_household_catalog_command_intent(uuid, uuid, text) from public;
revoke all on function fridge_internal.register_household_catalog_command_intent(uuid, uuid, text) from public;
revoke all on function fridge_internal.create_household_product(uuid, uuid, uuid, uuid, uuid, text) from public;

grant execute on function fridge_internal.create_household_product(uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;

commit;
