-- FridgeScanner DB-02
-- 000027__receipt_inventory_effect_conservation.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create or replace function fridge_internal.assert_receipt_item_inventory_effects(
  p_household_id uuid,
  p_receipt_item_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_receipt fridge.receipt_item%rowtype;
  v_edge record;
  v_movement fridge.inventory_movement%rowtype;
  v_converted record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select * into v_receipt
    from fridge.receipt_item
   where household_id = p_household_id
     and receipt_item_id = p_receipt_item_id
   for update;

  if not found then
    return;
  end if;

  for v_edge in
    select *
      from fridge.receipt_item_inventory_effect
     where household_id = p_household_id
       and receipt_item_id = p_receipt_item_id
  loop
    select * into v_movement
      from fridge.inventory_movement
     where household_id = p_household_id
       and inventory_movement_id = v_edge.inventory_movement_id;

    if not found then
      raise exception using errcode = '23503', message = 'ReceiptItem inventory movement endpoint is missing';
    end if;

    if v_movement.quantity_num <= 0 then
      raise exception using errcode = '23514', message = 'ReceiptItem must materialize through stock-increasing InventoryMovement';
    end if;

    if v_movement.measurement_unit_id <> v_receipt.received_unit_id then
      raise exception using
        errcode = '23514',
        message = 'ReceiptItem and inventory movement must share one canonical reconciliation unit';
    end if;

    select * into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_edge.quantity_num,
        v_edge.quantity_den,
        v_edge.measurement_unit_id,
        v_receipt.received_unit_id,
        v_edge.conversion_evidence_id
      );

    if not fridge_internal.rational_equal(
      v_converted.quantity_num,
      v_converted.quantity_den,
      v_movement.quantity_num,
      v_movement.quantity_den
    ) then
      raise exception using
        errcode = '23514',
        message = 'ReceiptItem inventory edge does not exactly reconcile to ledger increment';
    end if;

    select quantity_num, quantity_den into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_converted.quantity_den + v_converted.quantity_num * v_sum_den,
        v_sum_den * v_converted.quantity_den
      );
    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  if not fridge_internal.rational_equal(
    v_sum_num,
    v_sum_den,
    v_receipt.received_quantity_num,
    v_receipt.received_quantity_den
  ) then
    raise exception using
      errcode = '23514',
      message = 'ReceiptItem inventory effects do not exactly sum to physical received quantity';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_receipt_item_inventory_effects(uuid,uuid) from public;

create or replace function fridge_internal.guard_receipt_item_parent_inventory_effects()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'DELETE' then
    perform fridge_internal.assert_receipt_item_inventory_effects(new.household_id, new.receipt_item_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_receipt_item_inventory_effect()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_receipt_item_inventory_effects(old.household_id, old.receipt_item_id);
  end if;
  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old.household_id is distinct from new.household_id
    or old.receipt_item_id is distinct from new.receipt_item_id
  ) then
    perform fridge_internal.assert_receipt_item_inventory_effects(new.household_id, new.receipt_item_id);
  end if;
  return null;
end;
$$;

revoke all on function fridge_internal.guard_receipt_item_parent_inventory_effects() from public;
revoke all on function fridge_internal.guard_receipt_item_inventory_effect() from public;

create constraint trigger receipt_item_parent_inventory_effects_ct
  after insert or update
  on fridge.receipt_item
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_receipt_item_parent_inventory_effects();

create constraint trigger receipt_item_inventory_effect_conservation_ct
  after insert or update or delete
  on fridge.receipt_item_inventory_effect
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_receipt_item_inventory_effect();

commit;
