-- FridgeScanner BE-06
-- 000077__ordinary_over_receipt_acceptance_foundation.sql
-- Append-only resolution evidence and exception-aware receiving conservation.

begin;

-- Strengthen historical identities so a resolution can structurally bind the
-- exact detected exception and exact ordinary allocation it resolves.
alter table fridge.receipt_item_intent_over_receipt_exception
  add constraint receipt_item_intent_over_receipt_exception_resolution_identity_uq
  unique (
    household_id,
    receipt_item_intent_id,
    purchase_item_id,
    purchase_receiving_exception_id
  );

alter table fridge.purchase_item_receipt_allocation
  add constraint ordinary_allocation_resolution_identity_uq
  unique (
    household_id,
    purchase_item_id,
    receipt_item_id,
    purchase_item_receipt_allocation_id
  );

create table fridge.purchase_receiving_exception_resolution (
  purchase_receiving_exception_resolution_id uuid primary key,
  household_id uuid not null,
  purchase_receiving_exception_id uuid not null,
  receipt_item_intent_id uuid not null,
  purchase_item_id uuid not null,
  receipt_item_id uuid not null,
  ordinary_allocation_id uuid not null,
  accepted_excess_quantity_num numeric not null,
  accepted_excess_quantity_den numeric not null,
  accepted_excess_unit_id uuid not null,
  resolution_kind text not null,
  approved_by_user_id uuid not null,
  provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receiving_exception_resolution_detection_fk
    foreign key (
      household_id,
      receipt_item_intent_id,
      purchase_item_id,
      purchase_receiving_exception_id
    ) references fridge.receipt_item_intent_over_receipt_exception (
      household_id,
      receipt_item_intent_id,
      purchase_item_id,
      purchase_receiving_exception_id
    )
    on update restrict on delete restrict,
  constraint receiving_exception_resolution_allocation_fk
    foreign key (
      household_id,
      purchase_item_id,
      receipt_item_id,
      ordinary_allocation_id
    ) references fridge.purchase_item_receipt_allocation (
      household_id,
      purchase_item_id,
      receipt_item_id,
      purchase_item_receipt_allocation_id
    )
    on update restrict on delete restrict,
  constraint receiving_exception_resolution_unit_fk
    foreign key (accepted_excess_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint receiving_exception_resolution_approver_fk
    foreign key (approved_by_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint receiving_exception_resolution_exception_uq
    unique (household_id, purchase_receiving_exception_id),
  constraint receiving_exception_resolution_allocation_uq
    unique (household_id, ordinary_allocation_id),
  constraint receiving_exception_resolution_receipt_item_uq
    unique (household_id, receipt_item_id),
  constraint receiving_exception_resolution_quantity_positive_normalized
    check (
      accepted_excess_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        accepted_excess_quantity_num,
        accepted_excess_quantity_den
      )
    ),
  constraint receiving_exception_resolution_kind_ck
    check (resolution_kind = 'ACCEPTED_ORDINARY_EXCESS'),
  constraint receiving_exception_resolution_provenance_ck
    check (btrim(provenance) <> '')
);

comment on table fridge.purchase_receiving_exception_resolution is
  'Append-only BE-06 resolution evidence. ACCEPTED_ORDINARY_EXCESS binds one detected over-receipt exception to the exact ordinary allocation and exact portion of that allocation accepted outside purchased quantity. It never changes PurchaseItem purchased quantity.';

alter table fridge.purchase_receiving_exception_resolution enable row level security;
create policy household_isolation on fridge.purchase_receiving_exception_resolution
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

create trigger purchase_receiving_exception_resolution_immutable
before update or delete on fridge.purchase_receiving_exception_resolution
for each row execute function fridge_internal.reject_historical_mutation();

-- Compute the exact incremental portion of one proposed ordinary allocation
-- that must be explicitly accepted as excess. Existing accepted excess is
-- subtracted allocation-by-allocation from the normal purchased-quantity pool.
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
          message = 'accepted over-receipt excess exceeds linked ordinary allocation';
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

  -- Substitution over-receipt acceptance is intentionally not part of this
  -- slice, therefore substitution allocations remain fully covered by the
  -- purchased receiving pool.
  for v_row in
    select substituted_quantity_num as q_num,
           substituted_quantity_den as q_den,
           allocation_unit_id as unit_id,
           conversion_evidence_id
      from fridge.purchase_item_substitution_allocation
     where household_id = p_household_id
       and purchase_item_id = p_purchase_item_id
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

    select quantity_num, quantity_den into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_covered_num * v_converted.quantity_den + v_converted.quantity_num * v_covered_den,
        v_covered_den * v_converted.quantity_den
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
  'Locks one PurchaseItem and returns the exact incremental portion of one proposed ordinary allocation that lies outside the remaining purchased receiving allowance after subtracting previously accepted ordinary excess portions.';

revoke all on function fridge_internal.ordinary_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)
  from public, fridge_app, fridge_worker, fridge_readonly;

-- Replace the global receiving conservation proof with an exception-aware
-- form. Purchased quantity remains unchanged; only the exact accepted portion
-- of a linked ordinary allocation is excluded from the normal receiving pool.
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
  v_covered_num numeric := 0;
  v_covered_den numeric := 1;
  v_piece_num numeric;
  v_piece_den numeric;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select * into v_purchase
    from fridge.purchase_item
   where household_id = p_household_id
     and purchase_item_id = p_purchase_item_id
   for update;

  if not found then
    raise exception using errcode = '23503', message = 'PurchaseItem not found for receiving conservation';
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
          message = 'accepted over-receipt excess exceeds linked ordinary allocation';
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

  for v_row in
    select substituted_quantity_num as q_num,
           substituted_quantity_den as q_den,
           allocation_unit_id as unit_id,
           conversion_evidence_id
      from fridge.purchase_item_substitution_allocation
     where household_id = p_household_id
       and purchase_item_id = p_purchase_item_id
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

    select quantity_num, quantity_den into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_covered_num * v_converted.quantity_den + v_converted.quantity_num * v_covered_den,
        v_covered_den * v_converted.quantity_den
      );
    v_covered_num := v_norm_num;
    v_covered_den := v_norm_den;
  end loop;

  if v_covered_num * v_purchase.purchased_quantity_den
       > v_purchase.purchased_quantity_num * v_covered_den then
    raise exception using
      errcode = '23514',
      message = 'physical receiving allocations exceed exact PurchaseItem purchased quantity after accepted excess portions';
  end if;
end;
$$;

comment on function fridge_internal.assert_purchase_receiving_pool(uuid,uuid) is
  'Serializes on PurchaseItem and proves ordinary covered quantity plus substitution receiving does not exceed purchased quantity. Exact ordinary portions backed by ACCEPTED_ORDINARY_EXCESS resolution evidence are excluded from the purchased allowance without modifying PurchaseItem truth.';

revoke all on table fridge.purchase_receiving_exception_resolution
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.assert_purchase_receiving_pool(uuid,uuid)
  from public, fridge_app, fridge_worker, fridge_readonly;

commit;
