-- FridgeScanner BE-06
-- 000077_01__over_receipt_resolution_conservation.sql
-- Resolution evidence itself must preserve PurchaseItem receiving conservation.

begin;

create or replace function fridge_internal.guard_over_receipt_resolution_conservation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  perform fridge_internal.assert_purchase_receiving_pool(new.household_id, new.purchase_item_id);
  return null;
end;
$$;

create constraint trigger over_receipt_resolution_conservation_ct
after insert on fridge.purchase_receiving_exception_resolution
deferrable initially deferred
for each row execute function fridge_internal.guard_over_receipt_resolution_conservation();

revoke all on function fridge_internal.guard_over_receipt_resolution_conservation()
  from public, fridge_app, fridge_worker, fridge_readonly;

commit;
