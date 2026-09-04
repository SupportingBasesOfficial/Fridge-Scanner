-- FridgeScanner DB-02
-- 000022__procurement_shopping_conservation.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Adds exact cross-row conservation guards for the two deliberately independent
-- PurchaseItem allocation pools:
--   1. physical receiving attribution; and
--   2. shopping-intent fulfillment.
--
-- Over-receipt evidence never expands PurchaseItem purchased quantity. Physical
-- excess remains unallocated on ReceiptItem and is represented explicitly by
-- purchase_receiving_exception.

begin;

create or replace function fridge_internal.quantity_in_target_unit(
  p_household_id uuid,
  p_quantity_num numeric,
  p_quantity_den numeric,
  p_source_unit_id uuid,
  p_target_unit_id uuid,
  p_conversion_evidence_id uuid
)
returns table (
  quantity_num numeric,
  quantity_den numeric
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_evidence fridge.measurement_conversion_evidence%rowtype;
begin
  if not fridge_internal.assert_normalized_rational(p_quantity_num, p_quantity_den) then
    raise exception using errcode = '23514', message = 'quantity must be normalized before conversion';
  end if;

  if p_conversion_evidence_id is null then
    if p_source_unit_id <> p_target_unit_id then
      raise exception using
        errcode = '23514',
        message = 'cross-unit allocation requires exact conversion evidence';
    end if;

    quantity_num := p_quantity_num;
    quantity_den := p_quantity_den;
    return next;
    return;
  end if;

  select *
    into v_evidence
    from fridge.measurement_conversion_evidence
   where measurement_conversion_evidence_id = p_conversion_evidence_id;

  if not found then
    raise exception using errcode = '23503', message = 'conversion evidence does not exist or is not visible';
  end if;

  if v_evidence.household_id is not null and v_evidence.household_id <> p_household_id then
    raise exception using errcode = '23514', message = 'conversion evidence belongs to another Household';
  end if;

  if v_evidence.source_unit_id <> p_source_unit_id
     or v_evidence.target_unit_id <> p_target_unit_id
     or not fridge_internal.rational_equal(
       v_evidence.source_quantity_num,
       v_evidence.source_quantity_den,
       p_quantity_num,
       p_quantity_den
     ) then
    raise exception using
      errcode = '23514',
      message = 'conversion evidence does not describe the exact allocation quantity and unit endpoints';
  end if;

  quantity_num := v_evidence.target_quantity_num;
  quantity_den := v_evidence.target_quantity_den;
  return next;
end;
$$;

comment on function fridge_internal.quantity_in_target_unit(uuid,numeric,numeric,uuid,uuid,uuid) is
  'Returns an exact normalized quantity in a target unit. Cross-unit conversion requires pinned MeasurementConversionEvidence whose source quantity/unit exactly matches the committed allocation and whose target unit is exact.';

revoke all on function fridge_internal.quantity_in_target_unit(uuid,numeric,numeric,uuid,uuid,uuid) from public;

create or replace function fridge_internal.assert_purchase_receiving_pool(
  p_household_id uuid,
  p_purchase_item_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_purchase fridge.purchase_item%rowtype;
  v_row record;
  v_converted record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select *
    into v_purchase
    from fridge.purchase_item
   where household_id = p_household_id
     and purchase_item_id = p_purchase_item_id
   for update;

  if not found then
    raise exception using errcode = '23503', message = 'PurchaseItem not found for receiving conservation';
  end if;

  for v_row in
    select allocated_quantity_num as q_num,
           allocated_quantity_den as q_den,
           allocation_unit_id as unit_id,
           conversion_evidence_id
      from fridge.purchase_item_receipt_allocation
     where household_id = p_household_id
       and purchase_item_id = p_purchase_item_id
    union all
    select substituted_quantity_num,
           substituted_quantity_den,
           allocation_unit_id,
           conversion_evidence_id
      from fridge.purchase_item_substitution_allocation
     where household_id = p_household_id
       and purchase_item_id = p_purchase_item_id
  loop
    select *
      into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_row.q_num,
        v_row.q_den,
        v_row.unit_id,
        v_purchase.purchased_unit_id,
        v_row.conversion_evidence_id
      );

    select quantity_num, quantity_den
      into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_converted.quantity_den + v_converted.quantity_num * v_sum_den,
        v_sum_den * v_converted.quantity_den
      );

    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  if v_sum_num * v_purchase.purchased_quantity_den
       > v_purchase.purchased_quantity_num * v_sum_den then
    raise exception using
      errcode = '23514',
      message = 'physical receiving allocations exceed exact PurchaseItem purchased quantity';
  end if;
end;
$$;

comment on function fridge_internal.assert_purchase_receiving_pool(uuid,uuid) is
  'Serializes on PurchaseItem and proves ordinary plus substitution receiving allocations do not exceed purchased quantity after exact evidence-backed conversion.';

revoke all on function fridge_internal.assert_purchase_receiving_pool(uuid,uuid) from public;

create or replace function fridge_internal.assert_receipt_item_allocation_pool(
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
  v_row record;
  v_converted record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select *
    into v_receipt
    from fridge.receipt_item
   where household_id = p_household_id
     and receipt_item_id = p_receipt_item_id
   for update;

  if not found then
    raise exception using errcode = '23503', message = 'ReceiptItem not found for allocation conservation';
  end if;

  for v_row in
    select allocated_quantity_num as q_num,
           allocated_quantity_den as q_den,
           allocation_unit_id as unit_id,
           conversion_evidence_id
      from fridge.purchase_item_receipt_allocation
     where household_id = p_household_id
       and receipt_item_id = p_receipt_item_id
    union all
    select substituted_quantity_num,
           substituted_quantity_den,
           allocation_unit_id,
           conversion_evidence_id
      from fridge.purchase_item_substitution_allocation
     where household_id = p_household_id
       and receipt_item_id = p_receipt_item_id
  loop
    select *
      into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_row.q_num,
        v_row.q_den,
        v_row.unit_id,
        v_receipt.received_unit_id,
        v_row.conversion_evidence_id
      );

    select quantity_num, quantity_den
      into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_converted.quantity_den + v_converted.quantity_num * v_sum_den,
        v_sum_den * v_converted.quantity_den
      );

    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  if v_sum_num * v_receipt.received_quantity_den
       > v_receipt.received_quantity_num * v_sum_den then
    raise exception using
      errcode = '23514',
      message = 'receiving allocations exceed exact ReceiptItem physical quantity';
  end if;
end;
$$;

comment on function fridge_internal.assert_receipt_item_allocation_pool(uuid,uuid) is
  'Serializes on ReceiptItem and proves ordinary plus substitution attribution never consumes more physical quantity than actually arrived.';

revoke all on function fridge_internal.assert_receipt_item_allocation_pool(uuid,uuid) from public;

create or replace function fridge_internal.assert_shopping_purchase_pool(
  p_household_id uuid,
  p_purchase_item_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_purchase fridge.purchase_item%rowtype;
  v_row record;
  v_converted record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select *
    into v_purchase
    from fridge.purchase_item
   where household_id = p_household_id
     and purchase_item_id = p_purchase_item_id
   for update;

  if not found then
    raise exception using errcode = '23503', message = 'PurchaseItem not found for shopping conservation';
  end if;

  for v_row in
    select allocated_quantity_num as q_num,
           allocated_quantity_den as q_den,
           allocation_unit_id as unit_id,
           conversion_evidence_id
      from fridge.shopping_list_fulfillment
     where household_id = p_household_id
       and purchase_item_id = p_purchase_item_id
  loop
    select *
      into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_row.q_num,
        v_row.q_den,
        v_row.unit_id,
        v_purchase.purchased_unit_id,
        v_row.conversion_evidence_id
      );

    select quantity_num, quantity_den
      into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_converted.quantity_den + v_converted.quantity_num * v_sum_den,
        v_sum_den * v_converted.quantity_den
      );

    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  if v_sum_num * v_purchase.purchased_quantity_den
       > v_purchase.purchased_quantity_num * v_sum_den then
    raise exception using
      errcode = '23514',
      message = 'shopping fulfillments exceed exact PurchaseItem purchased quantity';
  end if;
end;
$$;

comment on function fridge_internal.assert_shopping_purchase_pool(uuid,uuid) is
  'Serializes on PurchaseItem and caps the shopping-intent fulfillment pool independently from physical receiving.';

revoke all on function fridge_internal.assert_shopping_purchase_pool(uuid,uuid) from public;

create or replace function fridge_internal.guard_receiving_allocation_conservation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_purchase_receiving_pool(old.household_id, old.purchase_item_id);
    perform fridge_internal.assert_receipt_item_allocation_pool(old.household_id, old.receipt_item_id);
  end if;

  if tg_op <> 'DELETE' then
    if tg_op = 'INSERT'
       or old.household_id is distinct from new.household_id
       or old.purchase_item_id is distinct from new.purchase_item_id then
      perform fridge_internal.assert_purchase_receiving_pool(new.household_id, new.purchase_item_id);
    end if;

    if tg_op = 'INSERT'
       or old.household_id is distinct from new.household_id
       or old.receipt_item_id is distinct from new.receipt_item_id then
      perform fridge_internal.assert_receipt_item_allocation_pool(new.household_id, new.receipt_item_id);
    end if;
  end if;

  return null;
end;
$$;

revoke all on function fridge_internal.guard_receiving_allocation_conservation() from public;

create constraint trigger ordinary_receiving_conservation_ct
  after insert or update or delete
  on fridge.purchase_item_receipt_allocation
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_receiving_allocation_conservation();

create constraint trigger substitution_receiving_conservation_ct
  after insert or update or delete
  on fridge.purchase_item_substitution_allocation
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_receiving_allocation_conservation();

create or replace function fridge_internal.guard_shopping_purchase_conservation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_shopping_purchase_pool(old.household_id, old.purchase_item_id);
  end if;

  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old.household_id is distinct from new.household_id
    or old.purchase_item_id is distinct from new.purchase_item_id
  ) then
    perform fridge_internal.assert_shopping_purchase_pool(new.household_id, new.purchase_item_id);
  end if;

  return null;
end;
$$;

revoke all on function fridge_internal.guard_shopping_purchase_conservation() from public;

create constraint trigger shopping_purchase_conservation_ct
  after insert or update or delete
  on fridge.shopping_list_fulfillment
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_shopping_purchase_conservation();

commit;
