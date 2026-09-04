-- FridgeScanner DB-02 integrity checks for 000030__household_catalog_visibility_guards.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('f1000000-0000-4000-8000-000000000001', 'Visibility household A'),
  ('f1000000-0000-4000-8000-000000000002', 'Visibility household B');

insert into fridge.product (
  product_id, catalog_scope, owner_household_id, canonical_name
) values
  ('f2000000-0000-4000-8000-000000000001', 'GLOBAL', null, 'Visibility global product'),
  ('f2000000-0000-4000-8000-000000000002', 'HOUSEHOLD', 'f1000000-0000-4000-8000-000000000001', 'Visibility private A product'),
  ('f2000000-0000-4000-8000-000000000003', 'HOUSEHOLD', 'f1000000-0000-4000-8000-000000000002', 'Visibility private B product');

insert into fridge.ingredient_concept (
  ingredient_concept_id, catalog_scope, owner_household_id, canonical_name
) values
  ('f3000000-0000-4000-8000-000000000001', 'GLOBAL', null, 'Visibility global concept'),
  ('f3000000-0000-4000-8000-000000000002', 'HOUSEHOLD', 'f1000000-0000-4000-8000-000000000001', 'Visibility private A concept'),
  ('f3000000-0000-4000-8000-000000000003', 'HOUSEHOLD', 'f1000000-0000-4000-8000-000000000002', 'Visibility private B concept');

-- Direct helper contract.
select fridge_internal.assert_product_visible_to_household(
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'test-global'
);
select fridge_internal.assert_product_visible_to_household(
  'f2000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  'test-private-a'
);
select fridge_internal.assert_concept_visible_to_household(
  'f3000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'test-global-concept'
);
select fridge_internal.assert_concept_visible_to_household(
  'f3000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  'test-private-a-concept'
);

do $$
begin
  begin
    perform fridge_internal.assert_product_visible_to_household(
      'f2000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      'cross-household-product'
    );
    raise exception 'private Product from Household B unexpectedly visible to A';
  exception when check_violation then null;
  end;

  begin
    perform fridge_internal.assert_concept_visible_to_household(
      'f3000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      'cross-household-concept'
    );
    raise exception 'private IngredientConcept from Household B unexpectedly visible to A';
  exception when check_violation then null;
  end;
end;
$$;

insert into fridge.currency (currency_code, display_name)
values ('VSG', 'Visibility Test Currency');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('VISIBILITY_COUNT', 'Visibility count');
insert into fridge.measurement_unit (
  measurement_unit_id, unit_code, dimension_code, display_name
) values (
  'f4000000-0000-4000-8000-000000000001',
  'VISIBILITY_UNIT', 'VISIBILITY_COUNT', 'Visibility unit'
);

insert into fridge.purchase (
  purchase_id, household_id, transaction_currency_code, occurred_at
) values (
  'f5000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'VSG',
  '2026-01-01T00:00:00Z'
);

-- Representative operational consumer accepts same-Household private Product.
insert into fridge.purchase_item (
  purchase_item_id, household_id, purchase_id, product_id,
  purchased_quantity_num, purchased_quantity_den, purchased_unit_id
) values (
  'f5100000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  1, 1,
  'f4000000-0000-4000-8000-000000000001'
);
select fridge_internal.assert_product_visible_to_household(
  'f2000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  'PurchaseItem'
);

-- Representative operational consumer cannot attach private Product from B.
do $$
begin
  begin
    insert into fridge.purchase_item (
      purchase_item_id, household_id, purchase_id, product_id,
      purchased_quantity_num, purchased_quantity_den, purchased_unit_id
    ) values (
      'f5100000-0000-4000-8000-000000000002',
      'f1000000-0000-4000-8000-000000000001',
      'f5000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000003',
      1, 1,
      'f4000000-0000-4000-8000-000000000001'
    );
    perform fridge_internal.assert_product_visible_to_household(
      'f2000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      'PurchaseItem'
    );
    raise exception 'PurchaseItem cross-Household private Product unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

insert into fridge.shopping_list (
  shopping_list_id, household_id, lifecycle_status
) values (
  'f6000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'TEST_OPEN'
);

-- Shopping intent may target a same-Household private concept.
insert into fridge.shopping_list_item (
  shopping_list_item_id, household_id, shopping_list_id,
  requested_ingredient_concept_id,
  requested_quantity_num, requested_quantity_den, requested_unit_id,
  lifecycle_status
) values (
  'f6100000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000002',
  1, 1,
  'f4000000-0000-4000-8000-000000000001',
  'TEST_OPEN'
);
select fridge_internal.assert_concept_visible_to_household(
  'f3000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  'ShoppingListItem'
);

-- Shopping intent cannot target another Household's private concept.
do $$
begin
  begin
    insert into fridge.shopping_list_item (
      shopping_list_item_id, household_id, shopping_list_id,
      requested_ingredient_concept_id,
      requested_quantity_num, requested_quantity_den, requested_unit_id,
      lifecycle_status
    ) values (
      'f6100000-0000-4000-8000-000000000002',
      'f1000000-0000-4000-8000-000000000001',
      'f6000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000003',
      1, 1,
      'f4000000-0000-4000-8000-000000000001',
      'TEST_OPEN'
    );
    perform fridge_internal.assert_concept_visible_to_household(
      'f3000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      'ShoppingListItem'
    );
    raise exception 'ShoppingListItem cross-Household private concept unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- All operational visibility guards must remain deferred constraint triggers.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from pg_catalog.pg_trigger
   where tgname in (
     'purchase_item_catalog_visibility_guard',
     'receipt_item_catalog_visibility_guard',
     'stock_item_catalog_visibility_guard',
     'inventory_movement_catalog_visibility_guard',
     'preparation_output_catalog_visibility_guard',
     'household_product_policy_catalog_visibility_guard',
     'shopping_list_item_catalog_visibility_guard',
     'alert_rule_subject_catalog_visibility_guard',
     'alert_trigger_subject_catalog_visibility_guard'
   )
     and (tgconstraint = 0 or not tgdeferrable or not tginitdeferred);
  if v_bad <> 0 then
    raise exception 'one or more Household catalog visibility guards are not deferred constraint triggers';
  end if;
end;
$$;

rollback;
