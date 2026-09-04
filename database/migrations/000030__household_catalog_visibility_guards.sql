-- FridgeScanner DB-02
-- 000030__household_catalog_visibility_guards.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Ensures Household-scoped operational rows may reference only GLOBAL catalog
-- objects or private catalog objects owned by that same Household.

begin;

create or replace function fridge_internal.assert_product_visible_to_household(
  p_product_id uuid,
  p_household_id uuid,
  p_context text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_product fridge.product%rowtype;
begin
  select * into v_product from fridge.product where product_id = p_product_id;
  if not found then
    raise exception using errcode = '23503', message = format('%s Product does not exist', p_context);
  end if;
  if not fridge_internal.catalog_object_visible_to_household(
    v_product.catalog_scope,
    v_product.owner_household_id,
    p_household_id
  ) then
    raise exception using errcode = '23514', message = format('%s Product is not visible to Household', p_context);
  end if;
end;
$$;

create or replace function fridge_internal.assert_concept_visible_to_household(
  p_ingredient_concept_id uuid,
  p_household_id uuid,
  p_context text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_concept fridge.ingredient_concept%rowtype;
begin
  select * into v_concept
    from fridge.ingredient_concept
   where ingredient_concept_id = p_ingredient_concept_id;
  if not found then
    raise exception using errcode = '23503', message = format('%s IngredientConcept does not exist', p_context);
  end if;
  if not fridge_internal.catalog_object_visible_to_household(
    v_concept.catalog_scope,
    v_concept.owner_household_id,
    p_household_id
  ) then
    raise exception using errcode = '23514', message = format('%s IngredientConcept is not visible to Household', p_context);
  end if;
end;
$$;

revoke all on function fridge_internal.assert_product_visible_to_household(uuid,uuid,text) from public;
revoke all on function fridge_internal.assert_concept_visible_to_household(uuid,uuid,text) from public;

create or replace function fridge_internal.guard_household_catalog_visibility()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
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

revoke all on function fridge_internal.guard_household_catalog_visibility() from public;

create constraint trigger purchase_item_catalog_visibility_guard
after insert or update on fridge.purchase_item
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

create constraint trigger receipt_item_catalog_visibility_guard
after insert or update on fridge.receipt_item
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

create constraint trigger stock_item_catalog_visibility_guard
after insert or update on fridge.stock_item
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

create constraint trigger inventory_movement_catalog_visibility_guard
after insert or update on fridge.inventory_movement
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

create constraint trigger preparation_output_catalog_visibility_guard
after insert or update on fridge.preparation_output
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

create constraint trigger household_product_policy_catalog_visibility_guard
after insert or update on fridge.household_product_policy
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

create constraint trigger shopping_list_item_catalog_visibility_guard
after insert or update on fridge.shopping_list_item
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

create constraint trigger alert_rule_subject_catalog_visibility_guard
after insert or update on fridge.alert_rule_subject
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

create constraint trigger alert_trigger_subject_catalog_visibility_guard
after insert or update on fridge.alert_trigger_subject
deferrable initially deferred
for each row execute function fridge_internal.guard_household_catalog_visibility();

commit;
