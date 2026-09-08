-- FridgeScanner BE-04
-- 000045__current_storage_location_read.sql
-- Provider-neutral current StorageLocation observations for an authorized Household.

begin;

create or replace function fridge_internal.list_current_storage_locations(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid
)
returns table (
  authorized boolean,
  storage_location_id uuid,
  kind_code text,
  display_name text,
  sort_order integer,
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
    return query select false, null::uuid, null::text, null::text, null::integer, null::timestamptz;
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
    return query select false, null::uuid, null::text, null::text, null::integer, null::timestamptz;
    return;
  end if;

  return query
  select true,
         sl.storage_location_id,
         sl.kind_code,
         sl.display_name,
         sl.sort_order,
         sl.created_at
    from fridge.storage_location sl
   where sl.household_id = p_household_id
     and sl.lifecycle_status = 'ACTIVE'
     and sl.retired_at is null
   order by sl.sort_order nulls last, sl.storage_location_id;

  if not found then
    return query select true, null::uuid, null::text, null::text, null::integer, null::timestamptz;
  end if;
end;
$$;

create or replace function fridge_internal.get_current_storage_location(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_storage_location_id uuid
)
returns table (
  outcome_code text,
  result_storage_location_id uuid,
  kind_code text,
  display_name text,
  sort_order integer,
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
    return query select 'UNAUTHORIZED'::text, null::uuid, null::text, null::text, null::integer, null::timestamptz;
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
    return query select 'UNAUTHORIZED'::text, null::uuid, null::text, null::text, null::integer, null::timestamptz;
    return;
  end if;

  return query
  select 'FOUND'::text,
         sl.storage_location_id,
         sl.kind_code,
         sl.display_name,
         sl.sort_order,
         sl.created_at
    from fridge.storage_location sl
   where sl.household_id = p_household_id
     and sl.storage_location_id = p_storage_location_id
     and sl.lifecycle_status = 'ACTIVE'
     and sl.retired_at is null;

  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::text, null::text, null::integer, null::timestamptz;
  end if;
end;
$$;

comment on function fridge_internal.list_current_storage_locations(uuid, uuid, uuid) is
  'Lists current active StorageLocations for one Household after revalidating the exact acting current membership. Empty authorized Households remain distinguishable from unauthorized callers.';

comment on function fridge_internal.get_current_storage_location(uuid, uuid, uuid, uuid) is
  'Returns one current active StorageLocation after revalidating the exact acting current membership. Missing, foreign-Household and retired targets collapse to NOT_FOUND.';

revoke all on function fridge_internal.list_current_storage_locations(uuid, uuid, uuid) from public;
revoke all on function fridge_internal.get_current_storage_location(uuid, uuid, uuid, uuid) from public;
grant execute on function fridge_internal.list_current_storage_locations(uuid, uuid, uuid) to fridge_app;
grant execute on function fridge_internal.get_current_storage_location(uuid, uuid, uuid, uuid) to fridge_app;

commit;
