-- FridgeScanner BE-05
-- 000056__current_ingredient_concept_read.sql
-- Provider-neutral current IngredientConcept observations for an authorized Household.

begin;

revoke select on table fridge.ingredient_concept from fridge_app, fridge_worker, fridge_readonly;

create or replace function fridge_internal.list_current_ingredient_concepts(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid
)
returns table (
  authorized boolean,
  ingredient_concept_id uuid,
  catalog_scope text,
  owner_household_id uuid,
  canonical_name text,
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
    select false, null::uuid, null::text, null::uuid, null::text, null::timestamptz;
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
    select false, null::uuid, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  return query
  select true,
         i.ingredient_concept_id,
         i.catalog_scope::text,
         i.owner_household_id,
         i.canonical_name,
         i.created_at
    from fridge.ingredient_concept i
   where i.lifecycle_status = 'ACTIVE'
     and (
       i.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         i.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and i.owner_household_id = p_household_id
       )
     )
   order by i.ingredient_concept_id;

  if not found then
    return query
    select true, null::uuid, null::text, null::uuid, null::text, null::timestamptz;
  end if;
end;
$$;

create or replace function fridge_internal.get_current_ingredient_concept(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_ingredient_concept_id uuid
)
returns table (
  outcome_code text,
  result_ingredient_concept_id uuid,
  catalog_scope text,
  owner_household_id uuid,
  canonical_name text,
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
    select 'UNAUTHORIZED'::text, null::uuid, null::text, null::uuid, null::text, null::timestamptz;
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
    select 'UNAUTHORIZED'::text, null::uuid, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  return query
  select 'FOUND'::text,
         i.ingredient_concept_id,
         i.catalog_scope::text,
         i.owner_household_id,
         i.canonical_name,
         i.created_at
    from fridge.ingredient_concept i
   where i.ingredient_concept_id = p_ingredient_concept_id
     and i.lifecycle_status = 'ACTIVE'
     and (
       i.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         i.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and i.owner_household_id = p_household_id
       )
     );

  if not found then
    return query
    select 'NOT_FOUND'::text, null::uuid, null::text, null::uuid, null::text, null::timestamptz;
  end if;
end;
$$;

revoke all on function fridge_internal.list_current_ingredient_concepts(uuid, uuid, uuid) from public;
revoke all on function fridge_internal.get_current_ingredient_concept(uuid, uuid, uuid, uuid) from public;
grant execute on function fridge_internal.list_current_ingredient_concepts(uuid, uuid, uuid) to fridge_app;
grant execute on function fridge_internal.get_current_ingredient_concept(uuid, uuid, uuid, uuid) to fridge_app;

commit;
