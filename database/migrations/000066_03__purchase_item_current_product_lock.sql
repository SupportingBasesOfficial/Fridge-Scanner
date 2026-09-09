-- FridgeScanner BE-06 concurrency hardening
-- 000066_03__purchase_item_current_product_lock.sql
-- A PurchaseItem must observe an ACTIVE Product that is visible to its Household
-- at the transaction that commits the item. The trigger acquires FOR SHARE so a
-- concurrent lifecycle UPDATE (normally FOR NO KEY UPDATE) cannot pass between
-- validation and commitment. Historical PurchaseItems remain valid after a later
-- Product retirement; the lock exists only for the creating/updating transaction.

begin;

create or replace function fridge_internal.guard_purchase_item_current_product()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
begin
  select p.product_id
    into v_product_id
    from fridge.product p
   where p.product_id = new.product_id
     and p.lifecycle_status = 'ACTIVE'
     and (
       p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and p.owner_household_id = new.household_id
       )
     )
   for share;

  if v_product_id is null then
    raise exception using
      errcode = 'P6P01',
      message = 'PurchaseItem current Product is unavailable';
  end if;

  return new;
end;
$$;

comment on function fridge_internal.guard_purchase_item_current_product() is
  'BE-06 current-reference serialization guard. Acquires Product FOR SHARE during PurchaseItem insert/reference change so lifecycle updates cannot commit between current-product validation and PurchaseItem commitment. P6P01 is internal and is collapsed by the public CreatePurchase boundary.';

revoke all on function fridge_internal.guard_purchase_item_current_product()
  from public, fridge_app, fridge_worker, fridge_readonly;

drop trigger if exists purchase_item_current_product_guard on fridge.purchase_item;

create trigger purchase_item_current_product_guard
before insert or update of household_id, product_id
on fridge.purchase_item
for each row
execute function fridge_internal.guard_purchase_item_current_product();

commit;
