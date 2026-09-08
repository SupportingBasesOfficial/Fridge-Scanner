-- FridgeScanner BE-05
-- 000054__retire_household_product.sql
-- Governed retirement for current Household-owned Product plus current-reference serialization.

begin;

alter table fridge.household_catalog_command_registry
  drop constraint household_catalog_command_registry_intent_ck;

alter table fridge.household_catalog_command_registry
  add constraint household_catalog_command_registry_intent_ck
  check (intent_code in (
    'CREATE_HOUSEHOLD_PRODUCT',
    'CHANGE_HOUSEHOLD_PRODUCT_METADATA',
    'RETIRE_HOUSEHOLD_PRODUCT'
  ));

create table fridge.household_product_retire_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  product_id uuid not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_product_retire_command_pk
    primary key (household_id, command_id),
  constraint household_product_retire_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_product_retire_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_product_retire_command_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint household_product_retire_command_outcome_ck
    check (outcome_code = 'RETIRED')
);

comment on table fridge.household_product_retire_command is
  'Durable BE-05 RetireHouseholdProduct command identity. Household-scoped CommandId binds actor and target Product; committed replay returns the original identity without restoring Product lifecycle or metadata.';

create or replace function fridge_internal.assert_current_product_visible_to_household(
  p_product_id uuid,
  p_household_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
begin
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
    raise exception using
      errcode = '23514',
      message = 'current Household-scoped Product reference requires an eligible Product';
  end if;
end;
$$;

create or replace function fridge_internal.assert_current_product_reference(
  p_product_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
begin
  select p.product_id
    into v_product_id
    from fridge.product p
   where p.product_id = p_product_id
     and p.lifecycle_status = 'ACTIVE'
   for key share;

  if v_product_id is null then
    raise exception using
      errcode = '23514',
      message = 'current Product reference requires an eligible Product';
  end if;
end;
$$;

create or replace function fridge_internal.guard_stock_item_current_product()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  if new.lifecycle_status = 'ACTIVE' and new.retired_at is null then
    perform fridge_internal.assert_current_product_visible_to_household(
      new.product_id,
      new.household_id
    );
  end if;
  return new;
end;
$$;

create trigger stock_item_current_product_guard
before insert or update of household_id, product_id, lifecycle_status, retired_at
on fridge.stock_item
for each row
execute function fridge_internal.guard_stock_item_current_product();

create or replace function fridge_internal.guard_product_identifier_current_product()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  if new.lifecycle_status = 'ACTIVE' and new.retired_at is null then
    perform fridge_internal.assert_current_product_reference(new.product_id);
  end if;
  return new;
end;
$$;

create trigger product_identifier_current_product_guard
before insert or update of product_id, lifecycle_status, retired_at
on fridge.product_identifier
for each row
execute function fridge_internal.guard_product_identifier_current_product();

create or replace function fridge_internal.guard_compatibility_current_product()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  if new.lifecycle_status = 'ACTIVE'
     and (new.effective_to is null or new.effective_to > clock_timestamp()) then
    perform fridge_internal.assert_current_product_reference(new.product_id);
  end if;
  return new;
end;
$$;

create trigger compatibility_current_product_guard
before insert or update of product_id, lifecycle_status, effective_from, effective_to
on fridge.product_ingredient_compatibility
for each row
execute function fridge_internal.guard_compatibility_current_product();

create or replace function fridge_internal.retire_household_product(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_product_id uuid
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
    'RETIRE_HOUSEHOLD_PRODUCT'
  );

  -- Committed replay is resolved before current target/dependency validation.
  select c.actor_user_id,
         c.product_id,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_product_id,
         v_existing_outcome_code
    from fridge.household_product_retire_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_product_id is distinct from p_product_id then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'RETIRED' then
      perform fridge_internal.register_household_catalog_command_intent(
        p_household_id,
        p_command_id,
        'RETIRE_HOUSEHOLD_PRODUCT'
      );
      return query select 'RETIRED'::text, v_existing_product_id;
      return;
    end if;

    raise exception 'unexpected Household Product retirement command state';
  end if;

  -- Canonical retirement lock order starts from accepted Household authority,
  -- then the target Product. Current-reference writers take Product KEY SHARE,
  -- so concurrent reference creation and Product retirement cannot both commit.
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

  -- Lock current StockItem dependencies deterministically.
  perform s.stock_item_id
    from fridge.stock_item s
   where s.product_id = p_product_id
     and s.lifecycle_status = 'ACTIVE'
     and s.retired_at is null
   order by s.stock_item_id
   for update;

  if found then
    return query select 'DEPENDENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  -- Lock current canonical ProductIdentifier dependencies deterministically.
  perform i.product_identifier_id
    from fridge.product_identifier i
   where i.product_id = p_product_id
     and i.lifecycle_status = 'ACTIVE'
     and i.retired_at is null
   order by i.product_identifier_id
   for update;

  if found then
    return query select 'DEPENDENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  -- Lock ACTIVE compatibility rows before sampling time, because waiting on
  -- one of these rows must not leave a stale effective-time decision.
  perform c.compatibility_mapping_id
    from fridge.product_ingredient_compatibility c
   where c.product_id = p_product_id
     and c.lifecycle_status = 'ACTIVE'
   order by c.compatibility_mapping_id
   for update;

  v_now := clock_timestamp();

  if exists (
    select 1
      from fridge.product_ingredient_compatibility c
     where c.product_id = p_product_id
       and c.lifecycle_status = 'ACTIVE'
       and (c.effective_to is null or c.effective_to > v_now)
  ) then
    return query select 'DEPENDENCY_CONFLICT'::text, null::uuid;
    return;
  end if;

  insert into fridge.household_product_retire_command (
    household_id,
    command_id,
    actor_user_id,
    product_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_product_id,
    'RETIRED'
  );

  update fridge.product
     set lifecycle_status = 'RETIRED'
   where product_id = p_product_id
     and owner_household_id = p_household_id
     and catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope;

  perform fridge_internal.register_household_catalog_command_intent(
    p_household_id,
    p_command_id,
    'RETIRE_HOUSEHOLD_PRODUCT'
  );

  return query select 'RETIRED'::text, p_product_id;
end;
$$;

comment on function fridge_internal.retire_household_product(uuid, uuid, uuid, uuid, uuid) is
  'BE-05 intent-specific Household Product retirement. Revalidates current HOUSEHOLD_CATALOG_ADMINISTER authority, hides non-current/foreign/GLOBAL targets, blocks current StockItem/ProductIdentifier/non-ended compatibility dependencies, participates in shared Household catalog CommandId governance and provides non-restoring committed replay. Historical references are preserved and never cascaded.';

revoke all on table fridge.household_product_retire_command from public;
revoke all on function fridge_internal.assert_current_product_visible_to_household(uuid, uuid) from public;
revoke all on function fridge_internal.assert_current_product_reference(uuid) from public;
revoke all on function fridge_internal.guard_stock_item_current_product() from public;
revoke all on function fridge_internal.guard_product_identifier_current_product() from public;
revoke all on function fridge_internal.guard_compatibility_current_product() from public;
revoke all on function fridge_internal.retire_household_product(uuid, uuid, uuid, uuid, uuid) from public;

grant execute on function fridge_internal.retire_household_product(uuid, uuid, uuid, uuid, uuid)
  to fridge_app;

commit;
