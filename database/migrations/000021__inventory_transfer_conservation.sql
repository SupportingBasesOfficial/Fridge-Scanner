-- FridgeScanner DB-02
-- 000021__inventory_transfer_conservation.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Deferred mathematical/relational postcondition for InventoryTransfer. Policy
-- selection remains in the mutation boundary; this guard only proves that the
-- committed transfer has exactly one paired effect and that both ledger deltas
-- conserve the transfer quantity/product/occurrence/placement evidence.

begin;

create or replace function fridge_internal.assert_inventory_transfer_conserved(
  p_inventory_transfer_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_transfer fridge.inventory_transfer%rowtype;
  v_effect fridge.inventory_transfer_effect%rowtype;
  v_source fridge.inventory_movement%rowtype;
  v_destination fridge.inventory_movement%rowtype;
begin
  select * into v_transfer
  from fridge.inventory_transfer
  where inventory_transfer_id = p_inventory_transfer_id;

  if not found then
    -- Deletion is separately denied by immutable-history guards. A missing row
    -- during deferred cleanup therefore has no postcondition to validate here.
    return;
  end if;

  select * into v_effect
  from fridge.inventory_transfer_effect
  where inventory_transfer_id = p_inventory_transfer_id;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'inventory transfer must have exactly one paired transfer effect';
  end if;

  select * into v_source
  from fridge.inventory_movement
  where inventory_movement_id = v_effect.source_inventory_movement_id;

  select * into v_destination
  from fridge.inventory_movement
  where inventory_movement_id = v_effect.destination_inventory_movement_id;

  if v_source.quantity_num >= 0 then
    raise exception using errcode = '23514', message = 'inventory transfer source movement must be stock-reducing';
  end if;

  if v_destination.quantity_num <= 0 then
    raise exception using errcode = '23514', message = 'inventory transfer destination movement must be stock-increasing';
  end if;

  if v_source.measurement_unit_id <> v_transfer.measurement_unit_id
     or v_destination.measurement_unit_id <> v_transfer.measurement_unit_id then
    raise exception using
      errcode = '23514',
      message = 'inventory transfer effects must use the transfer measurement unit';
  end if;

  if not fridge_internal.rational_equal(
    -v_source.quantity_num,
    v_source.quantity_den,
    v_transfer.quantity_num,
    v_transfer.quantity_den
  ) then
    raise exception using
      errcode = '23514',
      message = 'inventory transfer source magnitude does not equal transfer quantity';
  end if;

  if not fridge_internal.rational_equal(
    v_destination.quantity_num,
    v_destination.quantity_den,
    v_transfer.quantity_num,
    v_transfer.quantity_den
  ) then
    raise exception using
      errcode = '23514',
      message = 'inventory transfer destination magnitude does not equal transfer quantity';
  end if;

  if v_source.occurred_at <> v_transfer.occurred_at
     or v_destination.occurred_at <> v_transfer.occurred_at then
    raise exception using
      errcode = '23514',
      message = 'inventory transfer effects must preserve transfer occurrence time';
  end if;

  if v_source.placement_anchor_kind is distinct from v_transfer.source_anchor_kind
     or v_source.storage_location_id is distinct from v_transfer.source_storage_location_id
     or v_source.compartment_id is distinct from v_transfer.source_compartment_id then
    raise exception using
      errcode = '23514',
      message = 'inventory transfer source movement placement snapshot does not match transfer source';
  end if;

  if v_destination.placement_anchor_kind is distinct from v_transfer.destination_anchor_kind
     or v_destination.storage_location_id is distinct from v_transfer.destination_storage_location_id
     or v_destination.compartment_id is distinct from v_transfer.destination_compartment_id then
    raise exception using
      errcode = '23514',
      message = 'inventory transfer destination movement placement snapshot does not match transfer destination';
  end if;
end;
$$;

comment on function fridge_internal.assert_inventory_transfer_conserved(uuid) is
  'Deferred postcondition validator for one InventoryTransfer: paired effect exists; source/destination signs, exact rational quantity, unit, occurrence and placement snapshots equal the transfer contract.';

revoke all on function fridge_internal.assert_inventory_transfer_conserved(uuid) from public;

create or replace function fridge_internal.inventory_transfer_conservation_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  perform fridge_internal.assert_inventory_transfer_conserved(
    case when tg_op = 'DELETE' then old.inventory_transfer_id else new.inventory_transfer_id end
  );
  return null;
end;
$$;

revoke all on function fridge_internal.inventory_transfer_conservation_trigger() from public;

create constraint trigger inventory_transfer_conservation_from_transfer
  after insert or update on fridge.inventory_transfer
  deferrable initially deferred
  for each row
  execute function fridge_internal.inventory_transfer_conservation_trigger();

create constraint trigger inventory_transfer_conservation_from_effect
  after insert or update or delete on fridge.inventory_transfer_effect
  deferrable initially deferred
  for each row
  execute function fridge_internal.inventory_transfer_conservation_trigger();

commit;
