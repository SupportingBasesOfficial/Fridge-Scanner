-- FridgeScanner DB-02
-- 000025__lineage_waste_conservation.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create or replace function fridge_internal.assert_inventory_lineage_movement(
  p_household_id uuid,
  p_inventory_movement_id uuid,
  p_direction text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_movement fridge.inventory_movement%rowtype;
  v_row record;
  v_converted record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select * into v_movement
    from fridge.inventory_movement
   where household_id = p_household_id
     and inventory_movement_id = p_inventory_movement_id
   for update;

  if not found then
    return;
  end if;

  if p_direction = 'SOURCE' then
    if v_movement.quantity_num >= 0 then
      raise exception using errcode = '23514', message = 'lineage source must be a stock-decreasing InventoryMovement';
    end if;

    for v_row in
      select l.*,
             d.measurement_unit_id as destination_unit_id
        from fridge.inventory_quantity_lineage l
        join fridge.inventory_movement d
          on d.household_id = l.household_id
         and d.inventory_movement_id = l.destination_inventory_movement_id
       where l.household_id = p_household_id
         and l.source_inventory_movement_id = p_inventory_movement_id
    loop
      if v_row.destination_unit_id <> v_movement.measurement_unit_id then
        raise exception using errcode = '23514', message = 'lineage source and destination movements must share canonical reconciliation unit';
      end if;

      select * into v_converted
        from fridge_internal.quantity_in_target_unit(
          p_household_id,
          v_row.quantity_num,
          v_row.quantity_den,
          v_row.measurement_unit_id,
          v_movement.measurement_unit_id,
          v_row.conversion_evidence_id
        );

      select quantity_num, quantity_den into v_norm_num, v_norm_den
        from fridge_internal.normalize_rational(
          v_sum_num * v_converted.quantity_den + v_converted.quantity_num * v_sum_den,
          v_sum_den * v_converted.quantity_den
        );
      v_sum_num := v_norm_num;
      v_sum_den := v_norm_den;
    end loop;

    if not fridge_internal.rational_equal(v_sum_num, v_sum_den, -v_movement.quantity_num, v_movement.quantity_den) then
      raise exception using errcode = '23514', message = 'lineage outgoing quantity does not exactly exhaust source movement';
    end if;
  elsif p_direction = 'DESTINATION' then
    if v_movement.quantity_num <= 0 then
      raise exception using errcode = '23514', message = 'lineage destination must be a stock-increasing InventoryMovement';
    end if;

    for v_row in
      select l.*,
             s.measurement_unit_id as source_unit_id
        from fridge.inventory_quantity_lineage l
        join fridge.inventory_movement s
          on s.household_id = l.household_id
         and s.inventory_movement_id = l.source_inventory_movement_id
       where l.household_id = p_household_id
         and l.destination_inventory_movement_id = p_inventory_movement_id
    loop
      if v_row.source_unit_id <> v_movement.measurement_unit_id then
        raise exception using errcode = '23514', message = 'lineage source and destination movements must share canonical reconciliation unit';
      end if;

      select * into v_converted
        from fridge_internal.quantity_in_target_unit(
          p_household_id,
          v_row.quantity_num,
          v_row.quantity_den,
          v_row.measurement_unit_id,
          v_movement.measurement_unit_id,
          v_row.conversion_evidence_id
        );

      select quantity_num, quantity_den into v_norm_num, v_norm_den
        from fridge_internal.normalize_rational(
          v_sum_num * v_converted.quantity_den + v_converted.quantity_num * v_sum_den,
          v_sum_den * v_converted.quantity_den
        );
      v_sum_num := v_norm_num;
      v_sum_den := v_norm_den;
    end loop;

    if not fridge_internal.rational_equal(v_sum_num, v_sum_den, v_movement.quantity_num, v_movement.quantity_den) then
      raise exception using errcode = '23514', message = 'lineage incoming quantity does not exactly materialize destination movement';
    end if;
  else
    raise exception using errcode = '22023', message = 'unsupported lineage direction';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_inventory_lineage_movement(uuid,uuid,text) from public;

create or replace function fridge_internal.guard_inventory_lineage_conservation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_inventory_lineage_movement(old.household_id, old.source_inventory_movement_id, 'SOURCE');
    perform fridge_internal.assert_inventory_lineage_movement(old.household_id, old.destination_inventory_movement_id, 'DESTINATION');
  end if;

  if tg_op <> 'DELETE' then
    if tg_op = 'INSERT'
       or old.household_id is distinct from new.household_id
       or old.source_inventory_movement_id is distinct from new.source_inventory_movement_id then
      perform fridge_internal.assert_inventory_lineage_movement(new.household_id, new.source_inventory_movement_id, 'SOURCE');
    end if;
    if tg_op = 'INSERT'
       or old.household_id is distinct from new.household_id
       or old.destination_inventory_movement_id is distinct from new.destination_inventory_movement_id then
      perform fridge_internal.assert_inventory_lineage_movement(new.household_id, new.destination_inventory_movement_id, 'DESTINATION');
    end if;
  end if;

  return null;
end;
$$;

revoke all on function fridge_internal.guard_inventory_lineage_conservation() from public;

create constraint trigger inventory_lineage_conservation_ct
  after insert or update or delete
  on fridge.inventory_quantity_lineage
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_inventory_lineage_conservation();

create or replace function fridge_internal.assert_waste_record(
  p_household_id uuid,
  p_waste_record_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_record fridge.waste_record%rowtype;
  v_edge record;
  v_movement fridge.inventory_movement%rowtype;
  v_converted record;
  v_count integer := 0;
begin
  select * into v_record
    from fridge.waste_record
   where household_id = p_household_id
     and waste_record_id = p_waste_record_id
   for update;

  if not found then
    return;
  end if;

  for v_edge in
    select *
      from fridge.waste_record_movement
     where household_id = p_household_id
       and waste_record_id = p_waste_record_id
  loop
    v_count := v_count + 1;

    select * into v_movement
      from fridge.inventory_movement
     where household_id = p_household_id
       and inventory_movement_id = v_edge.inventory_movement_id;

    if v_movement.quantity_num >= 0 then
      raise exception using errcode = '23514', message = 'WasteRecord must reference stock-decreasing InventoryMovement';
    end if;

    select * into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_edge.quantity_num,
        v_edge.quantity_den,
        v_edge.measurement_unit_id,
        v_movement.measurement_unit_id,
        v_edge.conversion_evidence_id
      );

    if not fridge_internal.rational_equal(
      v_converted.quantity_num,
      v_converted.quantity_den,
      -v_movement.quantity_num,
      v_movement.quantity_den
    ) then
      raise exception using errcode = '23514', message = 'WasteRecord movement quantity does not exactly match ledger decrement';
    end if;
  end loop;

  if v_count = 0 then
    raise exception using errcode = '23514', message = 'committed WasteRecord requires at least one stock-decreasing movement';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_waste_record(uuid,uuid) from public;

create or replace function fridge_internal.guard_waste_record_parent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'DELETE' then
    perform fridge_internal.assert_waste_record(new.household_id, new.waste_record_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_waste_record_movement()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_waste_record(old.household_id, old.waste_record_id);
  end if;
  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old.household_id is distinct from new.household_id
    or old.waste_record_id is distinct from new.waste_record_id
  ) then
    perform fridge_internal.assert_waste_record(new.household_id, new.waste_record_id);
  end if;
  return null;
end;
$$;

revoke all on function fridge_internal.guard_waste_record_parent() from public;
revoke all on function fridge_internal.guard_waste_record_movement() from public;

create constraint trigger waste_record_parent_conservation_ct
  after insert or update
  on fridge.waste_record
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_waste_record_parent();

create constraint trigger waste_record_movement_conservation_ct
  after insert or update or delete
  on fridge.waste_record_movement
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_waste_record_movement();

commit;
