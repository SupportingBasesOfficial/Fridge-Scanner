-- FridgeScanner BE-06
-- 000070_02__late_source_pricing_reconciliation.sql
-- Make B6-020 source-vs-computed LINE_GROSS reconciliation arrival-order independent.

begin;

create or replace function fridge_internal.reconcile_late_source_line_gross()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_computed_amount numeric;
  v_rounding_policy_id uuid;
  v_conversion_evidence_id uuid;
begin
  if new.semantic_role <> 'LINE_GROSS' or not new.is_source_fact then
    return new;
  end if;

  select mf.amount, mf.money_rounding_policy_id
    into v_computed_amount, v_rounding_policy_id
    from fridge.purchase_item_money_fact mf
   where mf.household_id = new.household_id
     and mf.purchase_item_id = new.purchase_item_id
     and mf.semantic_role = 'LINE_GROSS'
     and not mf.is_source_fact
   for key share;

  -- If computation has not happened yet, the governed 5B extension will perform
  -- reconciliation when it later commits the computed LINE_GROSS.
  if v_computed_amount is null then
    return new;
  end if;

  if v_computed_amount is not distinct from new.amount then
    return new;
  end if;

  select pi.pricing_conversion_evidence_id
    into v_conversion_evidence_id
    from fridge.purchase_item pi
   where pi.household_id = new.household_id
     and pi.purchase_id = new.purchase_id
     and pi.purchase_item_id = new.purchase_item_id
   for key share;

  -- The immutable source fact identity is reused as the late-discrepancy
  -- identity. This is deterministic, requires no hidden UUID generator and
  -- cannot collide with another source LINE_GROSS for the same item because
  -- source semantic roles are already unique per PurchaseItem.
  insert into fridge.purchase_item_pricing_discrepancy (
    purchase_item_pricing_discrepancy_id,
    household_id,
    purchase_id,
    purchase_item_id,
    source_amount,
    computed_amount,
    currency_code,
    money_rounding_policy_id,
    quantity_conversion_evidence_id,
    reason,
    resolution_status,
    resolution_provenance
  ) values (
    new.purchase_item_money_fact_id,
    new.household_id,
    new.purchase_id,
    new.purchase_item_id,
    new.amount,
    v_computed_amount,
    new.currency_code,
    v_rounding_policy_id,
    v_conversion_evidence_id,
    'SOURCE_LINE_GROSS_MISMATCH',
    'OPEN',
    null
  );

  return new;
end;
$$;

comment on function fridge_internal.reconcile_late_source_line_gross() is
  'B6-020 arrival-order invariant. When a source LINE_GROSS is inserted after an immutable computed LINE_GROSS, preserves both and atomically creates OPEN PricingDiscrepancy evidence on mismatch.';

revoke all on function fridge_internal.reconcile_late_source_line_gross()
  from public, fridge_app, fridge_worker, fridge_readonly;

drop trigger if exists purchase_item_money_fact_late_pricing_reconciliation
  on fridge.purchase_item_money_fact;
create trigger purchase_item_money_fact_late_pricing_reconciliation
after insert on fridge.purchase_item_money_fact
for each row execute function fridge_internal.reconcile_late_source_line_gross();

commit;
