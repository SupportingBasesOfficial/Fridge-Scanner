-- FridgeScanner DB-02
-- 000073_03__receipt_allocation_identity_reconciliation.sql
--
-- A receiving allocation may carry conversion evidence specifically to
-- reconcile its physical quantity into the PurchaseItem purchased unit. When
-- the allocation is already expressed in the ReceiptItem received unit, the
-- receipt-side conservation proof is an exact identity and must not reinterpret
-- that purchase-side evidence as a second conversion with a different target.

begin;

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
        case
          when v_row.unit_id = v_receipt.received_unit_id then null::uuid
          else v_row.conversion_evidence_id
        end
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
  'Serializes on ReceiptItem and proves ordinary plus substitution attribution never consumes more physical quantity than actually arrived. Allocation already expressed in the received unit reconciles by exact identity; purchase-side conversion evidence is not reapplied.';

revoke all on function fridge_internal.assert_receipt_item_allocation_pool(uuid,uuid)
  from public, fridge_app, fridge_worker, fridge_readonly;

commit;
