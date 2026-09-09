-- FridgeScanner BE-06
-- 000070_03__pricing_money_canonical_numeric.sql
-- Canonicalize persisted computed pricing money after the governed rounding boundary.
-- MoneyRoundingPolicy preserves executed decimal scale/algorithm evidence; insignificant
-- trailing zeros are presentation, not a second monetary meaning.

begin;

create or replace function fridge_internal.canonicalize_computed_line_gross()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.semantic_role = 'LINE_GROSS' and not new.is_source_fact then
    new.amount := trim_scale(new.amount);
  end if;
  return new;
end;
$$;

comment on function fridge_internal.canonicalize_computed_line_gross() is
  'Canonical persistence boundary for platform-computed LINE_GROSS. The rounding policy records scale/algorithm; trailing decimal zeros do not become monetary fact identity.';

revoke all on function fridge_internal.canonicalize_computed_line_gross()
  from public, fridge_app, fridge_worker, fridge_readonly;

drop trigger if exists purchase_item_computed_line_gross_canonical
  on fridge.purchase_item_money_fact;
create trigger purchase_item_computed_line_gross_canonical
before insert on fridge.purchase_item_money_fact
for each row execute function fridge_internal.canonicalize_computed_line_gross();

create or replace function fridge_internal.canonicalize_pricing_discrepancy_money()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.source_amount := trim_scale(new.source_amount);
  new.computed_amount := trim_scale(new.computed_amount);
  return new;
end;
$$;

comment on function fridge_internal.canonicalize_pricing_discrepancy_money() is
  'Canonical persistence boundary for immutable source/computed amounts stored in PricingDiscrepancy evidence.';

revoke all on function fridge_internal.canonicalize_pricing_discrepancy_money()
  from public, fridge_app, fridge_worker, fridge_readonly;

drop trigger if exists purchase_item_pricing_discrepancy_money_canonical
  on fridge.purchase_item_pricing_discrepancy;
create trigger purchase_item_pricing_discrepancy_money_canonical
before insert on fridge.purchase_item_pricing_discrepancy
for each row execute function fridge_internal.canonicalize_pricing_discrepancy_money();

commit;
