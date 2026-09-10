-- FridgeScanner BE-06
-- 000079_01__ordinary_accepted_excess_contract_compatibility.sql
-- Preserve the accepted ordinary helper as the single fully-auditable implementation while
-- extending its covered pool to accepted substitution excess.

begin;

create or replace function fridge_internal.ordinary_receiving_required_accepted_excess(
  p_household_id uuid,
  p_purchase_item_id uuid,
  p_quantity_num numeric,
  p_quantity_den numeric,
  p_unit_id uuid,
  p_conversion_evidence_id uuid
)
returns table (
  accepted_excess_num numeric,
  accepted_excess_den numeric,
  comparison_unit_id uuid
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_purchase fridge.purchase_item%rowtype;
  v_row record;
  v_converted record;
  v_covered_num numeric := 0;
  v_covered_den numeric := 1;
  v_piece_num numeric;
  v_piece_den numeric;
  v_norm_num numeric;
  v_norm_den numeric;
  v_remaining_num numeric;
  v_remaining_den numeric;
  v_required_num numeric;
  v_required_den numeric;
begin
  select * into v_purchase
    from fridge.purchase_item
   where household_id = p_household_id
     and purchase_item_id = p_purchase_item_id
   for update;

  if not found then
    return;
  end if;

  for v_row in
    select a.allocated_quantity_num as q_num,
           a.allocated_quantity_den as q_den,
           a.allocation_unit_id as unit_id,
           a.conversion_evidence_id,
           r.accepted_excess_quantity_num as accepted_num,
           r.accepted_excess_quantity_den as accepted_den,
           r.accepted_excess_unit_id as accepted_unit_id
      from fridge.purchase_item_receipt_allocation a
      left join fridge.purchase_receiving_exception_resolution r
        on r.household_id = a.household_id
       and r.purchase_item_id = a.purchase_item_id
       and r.ordinary_allocation_id = a.purchase_item_receipt_allocation_id
     where a.household_id = p_household_id
       and a.purchase_item_id = p_purchase_item_id
    union all
    select a.substituted_quantity_num,
           a.substituted_quantity_den,
           a.allocation_unit_id,
           a.conversion_evidence_id,
           r.accepted_excess_quantity_num,
           r.accepted_excess_quantity_den,
           r.accepted_excess_unit_id
      from fridge.purchase_item_substitution_allocation a
      left join fridge.purchase_receiving_exception_resolution r
        on r.household_id = a.household_id
       and r.purchase_item_id = a.purchase_item_id
       and r.substitution_allocation_id = a.purchase_item_substitution_allocation_id
     where a.household_id = p_household_id
       and a.purchase_item_id = p_purchase_item_id
  loop
    select * into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_row.q_num,
        v_row.q_den,
        v_row.unit_id,
        v_purchase.purchased_unit_id,
        v_row.conversion_evidence_id
      );

    v_piece_num := v_converted.quantity_num;
    v_piece_den := v_converted.quantity_den;

    if v_row.accepted_num is not null then
      if v_row.accepted_unit_id is distinct from v_purchase.purchased_unit_id then
        raise exception using
          errcode = '23514',
          message = 'accepted over-receipt excess must use PurchaseItem comparison unit';
      end if;
      if v_row.accepted_num * v_piece_den > v_piece_num * v_row.accepted_den then
        raise exception using
          errcode = '23514',
          message = 'accepted over-receipt excess exceeds linked ordinary allocation or substitution allocation';
      end if;

      select quantity_num, quantity_den into v_piece_num, v_piece_den
        from fridge_internal.normalize_rational(
          v_piece_num * v_row.accepted_den - v_row.accepted_num * v_piece_den,
          v_piece_den * v_row.accepted_den
        );
    end if;

    select quantity_num, quantity_den into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_covered_num * v_piece_den + v_piece_num * v_covered_den,
        v_covered_den * v_piece_den
      );
    v_covered_num := v_norm_num;
    v_covered_den := v_norm_den;
  end loop;

  if v_covered_num * v_purchase.purchased_quantity_den
       > v_purchase.purchased_quantity_num * v_covered_den then
    raise exception using
      errcode = '23514',
      message = 'existing receiving truth exceeds purchased quantity without sufficient accepted excess evidence';
  end if;

  select * into v_converted
    from fridge_internal.quantity_in_target_unit(
      p_household_id,
      p_quantity_num,
      p_quantity_den,
      p_unit_id,
      v_purchase.purchased_unit_id,
      p_conversion_evidence_id
    );

  select quantity_num, quantity_den into v_remaining_num, v_remaining_den
    from fridge_internal.normalize_rational(
      v_purchase.purchased_quantity_num * v_covered_den
        - v_covered_num * v_purchase.purchased_quantity_den,
      v_purchase.purchased_quantity_den * v_covered_den
    );

  v_required_num := v_converted.quantity_num * v_remaining_den
                  - v_remaining_num * v_converted.quantity_den;
  v_required_den := v_converted.quantity_den * v_remaining_den;

  if v_required_num <= 0 then
    return query select 0::numeric, 1::numeric, v_purchase.purchased_unit_id;
    return;
  end if;

  select quantity_num, quantity_den into v_norm_num, v_norm_den
    from fridge_internal.normalize_rational(v_required_num, v_required_den);

  return query select v_norm_num, v_norm_den, v_purchase.purchased_unit_id;
end;
$$;

comment on function fridge_internal.ordinary_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid) is
  'Canonical fully-auditable accepted-excess calculation. Locks one PurchaseItem and returns the exact incremental portion of one proposed receiving allocation outside remaining purchased allowance after subtracting all previously accepted ordinary and substitution allocation-local excess portions.';

create or replace function fridge_internal.receiving_required_accepted_excess(
  p_household_id uuid,
  p_purchase_item_id uuid,
  p_quantity_num numeric,
  p_quantity_den numeric,
  p_unit_id uuid,
  p_conversion_evidence_id uuid
)
returns table (
  accepted_excess_num numeric,
  accepted_excess_den numeric,
  comparison_unit_id uuid
)
language sql
volatile
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
  select * from fridge_internal.ordinary_receiving_required_accepted_excess(
    p_household_id,
    p_purchase_item_id,
    p_quantity_num,
    p_quantity_den,
    p_unit_id,
    p_conversion_evidence_id
  );
$$;

comment on function fridge_internal.receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid) is
  'Compatibility/general entrypoint delegating to the single canonical fully-auditable accepted-excess implementation.';

create or replace function fridge_internal.substitution_receiving_required_accepted_excess(
  p_household_id uuid,
  p_purchase_item_id uuid,
  p_quantity_num numeric,
  p_quantity_den numeric,
  p_unit_id uuid,
  p_conversion_evidence_id uuid
)
returns table (
  accepted_excess_num numeric,
  accepted_excess_den numeric,
  comparison_unit_id uuid
)
language sql
volatile
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
  select * from fridge_internal.ordinary_receiving_required_accepted_excess(
    p_household_id,
    p_purchase_item_id,
    p_quantity_num,
    p_quantity_den,
    p_unit_id,
    p_conversion_evidence_id
  );
$$;

comment on function fridge_internal.substitution_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid) is
  'Substitution acceptance delegates to the single canonical fully-auditable accepted-excess calculation shared with ordinary acceptance.';

revoke all on function fridge_internal.ordinary_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.substitution_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)
  from public, fridge_app, fridge_worker, fridge_readonly;

commit;
