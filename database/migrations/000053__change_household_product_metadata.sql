-- FridgeScanner BE-05
-- 000053__change_household_product_metadata.sql
-- Governed metadata mutation for current Household-owned Product.

begin;

alter table fridge.household_catalog_command_registry
  drop constraint household_catalog_command_registry_intent_ck;

alter table fridge.household_catalog_command_registry
  add constraint household_catalog_command_registry_intent_ck
  check (intent_code in (
    'CREATE_HOUSEHOLD_PRODUCT',
    'CHANGE_HOUSEHOLD_PRODUCT_METADATA'
  ));

create table fridge.household_product_metadata_change_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  product_id uuid not null,
  canonical_name text not null,
  brand_id uuid,
  manufacturer_id uuid,
  product_category_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_product_metadata_change_command_pk
    primary key (household_id, command_id),
  constraint household_product_metadata_change_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_product_metadata_change_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_product_metadata_change_command_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint household_product_metadata_change_command_brand_fk
    foreign key (brand_id)
    references fridge.brand (brand_id)
    on update restrict on delete restrict,
  constraint household_product_metadata_change_command_manufacturer_fk
    foreign key (manufacturer_id)
    references fridge.manufacturer (manufacturer_id)
    on update restrict on delete restrict,
  constraint household_product_metadata_change_command_category_fk
    foreign key (product_category_id)
    references fridge.product_category (product_category_id)
    on update restrict on delete restrict,
  constraint household_product_metadata_change_command_name_nonblank
    check (btrim(canonical_name) <> ''),
  constraint household_product_metadata_change_command_outcome_ck
    check (outcome_code = 'CHANGED')
);

comment on table fridge.household_product_metadata_change_command is
  'Durable BE-05 ChangeHouseholdProductMetadata command identity. Household-scoped CommandId binds actor, target Product and exact requested metadata; committed replay returns the original target identity without restoring later Product state.';

create or replace function fridge_internal.change_household_product_metadata(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_product_id uuid,
  p_canonical_name text,
  p_brand_id uuid,
  p_manufacturer_id uuid,
  p_product_category_id uuid
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
  v_existing_actor_user_id uuid;
  v_existing_product_id uuid;
  v_existing_canonical_name text;
  v_existing_brand_id uuid;
  v_existing_manufacturer_id uuid;
  v_existing_product_category_id uuid;
  v_existing_outcome_code text;
  v_target_id uuid;
  v_reference_ok boolean;
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
    'CHANGE_HOUSEHOLD_PRODUCT_METADATA'
  );

  -- Committed replay is resolved before current target/reference validation so
  -- retry never restores later Product lifecycle or metadata state.
  select c.actor_user_id,
         c.product_id,
         c.canonical_name,
         c.brand_id,
         c.manufacturer_id,
         c.product_category_id,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_product_id,
         v_existing_canonical_name,
         v_existing_brand_id,
         v_existing_manufacturer_id,
         v_existing_product_category_id,
         v_existing_outcome_code
    from fridge.household_product_metadata_change_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_product_id is distinct from p_product_id
       or v_existing_canonical_name is distinct from p_canonical_name
       or v_existing_brand_id is distinct from p_brand_id
       or v_existing_manufacturer_id is distinct from p_manufacturer_id
       or v_existing_product_category_id is distinct from p_product_category_id then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CHANGED' then
      perform fridge_internal.register_household_catalog_command_intent(
        p_household_id,
        p_command_id,
        'CHANGE_HOUSEHOLD_PRODUCT_METADATA'
      );
      return query select 'CHANGED'::text, v_existing_product_id;
      return;
    end if;

    raise exception 'unexpected Household Product metadata-change command state';
  end if;

  -- Canonical lock order for this intent:
  -- Household authority -> Product -> Brand -> Manufacturer -> ProductCategory.
  select p.product_id
    into v_target_id
    from fridge.product p
   where p.product_id = p_product_id
     and p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
     and p.owner_household_id = p_household_id
     and p.lifecycle_status = 'ACTIVE'
   for update;

  if v_target_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  if p_brand_id is not null then
    select true
      into v_reference_ok
      from fridge.brand b
     where b.brand_id = p_brand_id
       and b.lifecycle_status = 'ACTIVE'
     for share;
    if coalesce(v_reference_ok, false) is false then
      return query select 'INVALID_REFERENCE'::text, null::uuid;
      return;
    end if;
  end if;

  v_reference_ok := null;
  if p_manufacturer_id is not null then
    select true
      into v_reference_ok
      from fridge.manufacturer m
     where m.manufacturer_id = p_manufacturer_id
       and m.lifecycle_status = 'ACTIVE'
     for share;
    if coalesce(v_reference_ok, false) is false then
      return query select 'INVALID_REFERENCE'::text, null::uuid;
      return;
    end if;
  end if;

  v_reference_ok := null;
  if p_product_category_id is not null then
    select true
      into v_reference_ok
      from fridge.product_category pc
     where pc.product_category_id = p_product_category_id
       and pc.lifecycle_status = 'ACTIVE'
     for share;
    if coalesce(v_reference_ok, false) is false then
      return query select 'INVALID_REFERENCE'::text, null::uuid;
      return;
    end if;
  end if;

  insert into fridge.household_product_metadata_change_command (
    household_id,
    command_id,
    actor_user_id,
    product_id,
    canonical_name,
    brand_id,
    manufacturer_id,
    product_category_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_product_id,
    p_canonical_name,
    p_brand_id,
    p_manufacturer_id,
    p_product_category_id,
    'CHANGED'
  );

  update fridge.product
     set canonical_name = p_canonical_name,
         brand_id = p_brand_id,
         manufacturer_id = p_manufacturer_id,
         product_category_id = p_product_category_id
   where product_id = p_product_id
     and owner_household_id = p_household_id
     and catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope;

  perform fridge_internal.register_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'CHANGE_HOUSEHOLD_PRODUCT_METADATA'
  );

  return query select 'CHANGED'::text, p_product_id;
end;
$$;

comment on function fridge_internal.change_household_product_metadata(uuid, uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) is
  'BE-05 intent-specific Household Product metadata mutation. Revalidates current HOUSEHOLD_CATALOG_ADMINISTER authority, hides non-current/foreign/GLOBAL targets, locks the current Product before ACTIVE global references, preserves immutable Product identity/scope/owner, participates in shared Household catalog CommandId governance and provides non-restoring committed replay.';

revoke all on table fridge.household_product_metadata_change_command from public;
revoke all on function fridge_internal.change_household_product_metadata(uuid, uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) from public;

grant execute on function fridge_internal.change_household_product_metadata(uuid, uuid, uuid, uuid, uuid, text, uuid, uuid, uuid)
  to fridge_app;

commit;
