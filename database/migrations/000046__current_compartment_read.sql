-- FridgeScanner BE-04
-- 000046__current_compartment_read.sql
-- Provider-neutral current Compartment observations for an authorized Household.

begin;

create or replace function fridge_internal.list_current_compartments(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_storage_location_id uuid
)
returns table (
  authorized boolean,
  parent_found boolean,
  compartment_id uuid,
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
  v_parent uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select false, false, null::uuid, null::uuid, null::text, null::text, null::integer, null::timestamptz;
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
    return query select false, false, null::uuid, null::uuid, null::text, null::text, null::integer, null::timestamptz;
    return;
  end if;

  select sl.storage_location_id
    into v_parent
    from fridge.storage_location sl
   where sl.household_id = p_household_id
     and sl.storage_location_id = p_storage_location_id
     and sl.lifecycle_status = 'ACTIVE'
     and sl.retired_at is null;

  if v_parent is null then
    return query select true, false, null::uuid, null::uuid, null::text, null::text, null::integer, null::timestamptz;
    return;
  end if;

  return query
  select true,
         true,
         c.compartment_id,
         c.storage_location_id,
         c.kind_code,
         c.display_name,
         c.sort_order,
         c.created_at
    from fridge.compartment c
   where c.household_id = p_household_id
     and c.storage_location_id = p_storage_location_id
     and c.lifecycle_status = 'ACTIVE'
     and c.retired_at is null
   order by c.sort_order nulls last, c.compartment_id;

  if not found then
    return query select true, true, null::uuid, p_storage_location_id, null::text, null::text, null::integer, null::timestamptz;
  end if;
end;
$$;

create or replace function fridge_internal.get_current_compartment(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_compartment_id uuid
)
returns table (
  outcome_code text,
  result_compartment_id uuid,
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
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid, null::text, null::text, null::integer, null::timestamptz;
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
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid, null::text, null::text, null::integer, null::timestamptz;
    return;
  end if;

  return query
  select 'FOUND'::text,
         c.compartment_id,
         c.storage_location_id,
         c.kind_code,
         c.display_name,
         c.sort_order,
         c.created_at
    from fridge.compartment c
    join fridge.storage_location sl
      on sl.household_id = c.household_id
     and sl.storage_location_id = c.storage_location_id
   where c.household_id = p_household_id
     and c.compartment_id = p_compartment_id
     and c.lifecycle_status = 'ACTIVE'
     and c.retired_at is null
     and sl.lifecycle_status = 'ACTIVE'
     and sl.retired_at is null;

  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::text, null::text, null::integer, null::timestamptz;
  end if;
end;
$$;

comment on function fridge_internal.list_current_compartments(uuid, uuid, uuid, uuid) is
  'Lists current active Compartments beneath one current active same-Household StorageLocation after revalidating the exact acting current membership. Empty current parents remain distinguishable from hidden parents.';

comment on function fridge_internal.get_current_compartment(uuid, uuid, uuid, uuid) is
  'Returns one current Compartment only when both Compartment and parent StorageLocation are current and active after revalidating the exact acting current membership. Hidden states collapse to NOT_FOUND.';

revoke all on function fridge_internal.list_current_compartments(uuid, uuid, uuid, uuid) from public;
revoke all on function fridge_internal.get_current_compartment(uuid, uuid, uuid, uuid) from public;
grant execute on function fridge_internal.list_current_compartments(uuid, uuid, uuid, uuid) to fridge_app;
grant execute on function fridge_internal.get_current_compartment(uuid, uuid, uuid, uuid) to fridge_app;

commit;
