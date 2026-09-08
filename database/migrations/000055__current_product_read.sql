-- FridgeScanner BE-05
-- 000055__current_product_read.sql
-- Provider-neutral current Product observations for an authorized Household.

begin;

-- Product observations now cross only governed boundaries. Earlier DB-02
-- capability grants included direct SELECT on fridge.product for runtime roles;
-- retaining that privilege would let callers bypass exact-membership,
-- lifecycle and Household-visibility revalidation.
revoke select on table fridge.product from fridge_app, fridge_worker, fridge_readonly;

-- Some pre-existing RLS policies on dependent resources (Batch and
-- ProductIdentifier) legitimately need Product visibility as part of their own
-- row predicate. Encapsulate that dependency behind narrow SECURITY DEFINER
-- predicates instead of restoring broad Product SELECT to runtime roles.
create or replace function fridge_internal.rls_product_visible_to_current_household(
  p_product_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
      from fridge.product p
     where p.product_id = p_product_id
       and (
         p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
         or p.owner_household_id = fridge_internal.current_household_id()
       )
  )
$$;

create or replace function fridge_internal.rls_product_owned_by_current_household(
  p_product_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
      from fridge.product p
     where p.product_id = p_product_id
       and p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
       and p.owner_household_id = fridge_internal.current_household_id()
  )
$$;

comment on function fridge_internal.rls_product_visible_to_current_household(uuid) is
  'Internal RLS predicate preserving GLOBAL plus same-Household Product visibility for dependent resources without granting direct Product SELECT.';
comment on function fridge_internal.rls_product_owned_by_current_household(uuid) is
  'Internal RLS predicate preserving same-Household private Product ownership checks for dependent resource write policies without granting direct Product SELECT.';

revoke all on function fridge_internal.rls_product_visible_to_current_household(uuid) from public;
revoke all on function fridge_internal.rls_product_owned_by_current_household(uuid) from public;
grant execute on function fridge_internal.rls_product_visible_to_current_household(uuid)
  to fridge_app, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.rls_product_owned_by_current_household(uuid)
  to fridge_app, fridge_worker, fridge_readonly;

drop policy batch_visible on fridge.batch;
create policy batch_visible
  on fridge.batch
  for select
  using (fridge_internal.rls_product_visible_to_current_household(batch.product_id));

drop policy batch_household_write on fridge.batch;
create policy batch_household_write
  on fridge.batch
  for all
  using (fridge_internal.rls_product_owned_by_current_household(batch.product_id))
  with check (fridge_internal.rls_product_owned_by_current_household(batch.product_id));

drop policy product_identifier_visible on fridge.product_identifier;
create policy product_identifier_visible
  on fridge.product_identifier
  for select
  using (fridge_internal.rls_product_visible_to_current_household(product_identifier.product_id));

drop policy product_identifier_household_write on fridge.product_identifier;
create policy product_identifier_household_write
  on fridge.product_identifier
  for all
  using (fridge_internal.rls_product_owned_by_current_household(product_identifier.product_id))
  with check (fridge_internal.rls_product_owned_by_current_household(product_identifier.product_id));

create or replace function fridge_internal.list_current_products(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid
)
returns table (
  authorized boolean,
  product_id uuid,
  catalog_scope text,
  owner_household_id uuid,
  canonical_name text,
  brand_id uuid,
  manufacturer_id uuid,
  product_category_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_membership uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query
    select false, null::uuid, null::text, null::uuid, null::text,
           null::uuid, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select hm.membership_id
    into v_actor_membership
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_actor_user_id
     and hm.membership_id = p_actor_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp());

  if v_actor_membership is null then
    return query
    select false, null::uuid, null::text, null::uuid, null::text,
           null::uuid, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  return query
  select true,
         p.product_id,
         p.catalog_scope::text,
         p.owner_household_id,
         p.canonical_name,
         p.brand_id,
         p.manufacturer_id,
         p.product_category_id,
         p.created_at
    from fridge.product p
   where p.lifecycle_status = 'ACTIVE'
     and (
       p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and p.owner_household_id = p_household_id
       )
     )
   order by p.product_id;

  if not found then
    return query
    select true, null::uuid, null::text, null::uuid, null::text,
           null::uuid, null::uuid, null::uuid, null::timestamptz;
  end if;
end;
$$;

create or replace function fridge_internal.get_current_product(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_product_id uuid
)
returns table (
  outcome_code text,
  result_product_id uuid,
  catalog_scope text,
  owner_household_id uuid,
  canonical_name text,
  brand_id uuid,
  manufacturer_id uuid,
  product_category_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_membership uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query
    select 'UNAUTHORIZED'::text, null::uuid, null::text, null::uuid, null::text,
           null::uuid, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select hm.membership_id
    into v_actor_membership
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_actor_user_id
     and hm.membership_id = p_actor_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp());

  if v_actor_membership is null then
    return query
    select 'UNAUTHORIZED'::text, null::uuid, null::text, null::uuid, null::text,
           null::uuid, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  return query
  select 'FOUND'::text,
         p.product_id,
         p.catalog_scope::text,
         p.owner_household_id,
         p.canonical_name,
         p.brand_id,
         p.manufacturer_id,
         p.product_category_id,
         p.created_at
    from fridge.product p
   where p.product_id = p_product_id
     and p.lifecycle_status = 'ACTIVE'
     and (
       p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and p.owner_household_id = p_household_id
       )
     );

  if not found then
    return query
    select 'NOT_FOUND'::text, null::uuid, null::text, null::uuid, null::text,
           null::uuid, null::uuid, null::uuid, null::timestamptz;
  end if;
end;
$$;

comment on function fridge_internal.list_current_products(uuid, uuid, uuid) is
  'Lists current active Products visible to one authorized Household: GLOBAL plus same-Household private. Foreign private and non-current Products are excluded.';

comment on function fridge_internal.get_current_product(uuid, uuid, uuid, uuid) is
  'Returns one current Product visible to an authorized Household. Missing, non-current and foreign-Household private targets collapse to NOT_FOUND.';

revoke all on function fridge_internal.list_current_products(uuid, uuid, uuid) from public;
revoke all on function fridge_internal.get_current_product(uuid, uuid, uuid, uuid) from public;
grant execute on function fridge_internal.list_current_products(uuid, uuid, uuid) to fridge_app;
grant execute on function fridge_internal.get_current_product(uuid, uuid, uuid, uuid) to fridge_app;

commit;
