-- FridgeScanner BE-04 hardening
-- 000050__current_stock_topology_guard.sql
-- Serialize current StockItem placement against topology retirement.

begin;

create or replace function fridge_internal.assert_current_stock_topology(
  p_household_id uuid,
  p_lifecycle_status text,
  p_retired_at timestamptz,
  p_placement_anchor_kind fridge.inventory_placement_anchor_kind,
  p_storage_location_id uuid,
  p_compartment_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_parent_id uuid;
  v_locked_location_id uuid;
  v_locked_compartment_id uuid;
begin
  -- Historical/non-current StockItems may continue to reference historical
  -- topology. Only current stock placement must require current topology.
  if p_lifecycle_status is distinct from 'ACTIVE' or p_retired_at is not null then
    return;
  end if;

  if p_placement_anchor_kind = 'UNPLACED' then
    return;
  end if;

  if p_placement_anchor_kind = 'LOCATION' then
    select sl.storage_location_id
      into v_locked_location_id
      from fridge.storage_location sl
     where sl.household_id = p_household_id
       and sl.storage_location_id = p_storage_location_id
       and sl.lifecycle_status = 'ACTIVE'
       and sl.retired_at is null
     for key share;

    if v_locked_location_id is null then
      raise exception using
        errcode = '23514',
        message = 'current StockItem LOCATION placement requires a current StorageLocation';
    end if;

    return;
  end if;

  if p_placement_anchor_kind = 'COMPARTMENT' then
    -- Compartment parentage is immutable in BE-04. Discover parent identity only
    -- so the lock order remains StorageLocation -> Compartment.
    select c.storage_location_id
      into v_parent_id
      from fridge.compartment c
     where c.household_id = p_household_id
       and c.compartment_id = p_compartment_id;

    if v_parent_id is null then
      raise exception using
        errcode = '23514',
        message = 'current StockItem COMPARTMENT placement requires a same-Household Compartment';
    end if;

    select sl.storage_location_id
      into v_locked_location_id
      from fridge.storage_location sl
     where sl.household_id = p_household_id
       and sl.storage_location_id = v_parent_id
       and sl.lifecycle_status = 'ACTIVE'
       and sl.retired_at is null
     for key share;

    if v_locked_location_id is null then
      raise exception using
        errcode = '23514',
        message = 'current StockItem COMPARTMENT placement requires a current parent StorageLocation';
    end if;

    select c.compartment_id
      into v_locked_compartment_id
      from fridge.compartment c
     where c.household_id = p_household_id
       and c.compartment_id = p_compartment_id
       and c.storage_location_id = v_parent_id
       and c.lifecycle_status = 'ACTIVE'
       and c.retired_at is null
     for key share;

    if v_locked_compartment_id is null then
      raise exception using
        errcode = '23514',
        message = 'current StockItem COMPARTMENT placement requires a current Compartment';
    end if;

    return;
  end if;

  raise exception using
    errcode = '23514',
    message = 'unsupported current StockItem placement anchor kind';
end;
$$;

comment on function fridge_internal.assert_current_stock_topology(uuid,text,timestamptz,fridge.inventory_placement_anchor_kind,uuid,uuid) is
  'DB guard for current StockItem placement. Acquires current topology KEY SHARE locks so placement serializes with BE-04 topology FOR UPDATE retirement; historical StockItems remain allowed to reference historical topology.';

revoke all on function fridge_internal.assert_current_stock_topology(uuid,text,timestamptz,fridge.inventory_placement_anchor_kind,uuid,uuid) from public;

create or replace function fridge_internal.guard_current_stock_topology()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform fridge_internal.assert_current_stock_topology(
    new.household_id,
    new.lifecycle_status,
    new.retired_at,
    new.placement_anchor_kind,
    new.storage_location_id,
    new.compartment_id
  );
  return new;
end;
$$;

comment on function fridge_internal.guard_current_stock_topology() is
  'BE-04 current-stock placement guard. Runs before StockItem insertion or placement/lifecycle update and revalidates current topology under locks compatible with future governed inventory mutations.';

revoke all on function fridge_internal.guard_current_stock_topology() from public;

drop trigger if exists stock_item_current_topology_guard on fridge.stock_item;
create trigger stock_item_current_topology_guard
before insert or update of household_id, lifecycle_status, retired_at,
  placement_anchor_kind, storage_location_id, compartment_id
on fridge.stock_item
for each row execute function fridge_internal.guard_current_stock_topology();

commit;
