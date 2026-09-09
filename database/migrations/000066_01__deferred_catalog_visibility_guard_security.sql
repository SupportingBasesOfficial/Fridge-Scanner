-- FridgeScanner BE-06 hardening
-- 000066_01__deferred_catalog_visibility_guard_security.sql
-- Deferred catalog-visibility constraint triggers fire at COMMIT, after an
-- intent-specific SECURITY DEFINER writer has returned to the least-privileged
-- runtime role. Keep the underlying assertion helpers private and make the
-- trigger boundary itself the narrowly privileged execution seam.

begin;

create or replace function fridge_internal.guard_household_catalog_visibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_table_name = 'purchase_item' then
    perform fridge_internal.assert_product_visible_to_household(new.product_id, new.household_id, 'PurchaseItem');
  elsif tg_table_name = 'receipt_item' then
    perform fridge_internal.assert_product_visible_to_household(new.product_id, new.household_id, 'ReceiptItem');
  elsif tg_table_name = 'stock_item' then
    perform fridge_internal.assert_product_visible_to_household(new.product_id, new.household_id, 'StockItem');
  elsif tg_table_name = 'inventory_movement' then
    perform fridge_internal.assert_product_visible_to_household(new.product_id, new.household_id, 'InventoryMovement');
  elsif tg_table_name = 'preparation_output' then
    perform fridge_internal.assert_product_visible_to_household(new.product_id, new.household_id, 'PreparationOutput');
  elsif tg_table_name = 'household_product_policy' then
    perform fridge_internal.assert_product_visible_to_household(new.product_id, new.household_id, 'HouseholdProductPolicy');
  elsif tg_table_name = 'shopping_list_item' then
    if new.requested_product_id is not null then
      perform fridge_internal.assert_product_visible_to_household(new.requested_product_id, new.household_id, 'ShoppingListItem');
    else
      perform fridge_internal.assert_concept_visible_to_household(new.requested_ingredient_concept_id, new.household_id, 'ShoppingListItem');
    end if;
  elsif tg_table_name = 'alert_rule_subject' then
    if new.product_id is not null then
      perform fridge_internal.assert_product_visible_to_household(new.product_id, new.household_id, 'AlertRuleSubject');
    end if;
  elsif tg_table_name = 'alert_trigger_subject' then
    if new.product_id is not null then
      perform fridge_internal.assert_product_visible_to_household(new.product_id, new.household_id, 'AlertTriggerSubject');
    end if;
  end if;

  return null;
end;
$$;

comment on function fridge_internal.guard_household_catalog_visibility() is
  'Deferred constraint-trigger privilege boundary. Executes catalog visibility assertions with owner authority at COMMIT while assertion helpers remain unavailable to runtime roles.';

revoke all on function fridge_internal.guard_household_catalog_visibility() from public;

commit;
