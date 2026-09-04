-- FridgeScanner DB-02 integrity checks for 000011__shopping_replenishment.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('b1000000-0000-4000-8000-000000000001', 'Shopping household A'),
  ('b1000000-0000-4000-8000-000000000002', 'Shopping household B');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('SHOP_COUNT_TEST', 'Shopping count test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  'b2000000-0000-4000-8000-000000000001',
  'SHOP_UNIT_TEST',
  'SHOP_COUNT_TEST',
  'Shopping unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values
  ('b3000000-0000-4000-8000-000000000001', 'GLOBAL', 'Shopping product A'),
  ('b3000000-0000-4000-8000-000000000002', 'GLOBAL', 'Shopping product B');

insert into fridge.ingredient_concept (
  ingredient_concept_id,
  catalog_scope,
  canonical_name
) values (
  'b4000000-0000-4000-8000-000000000001',
  'GLOBAL',
  'Shopping concept'
);

insert into fridge.storage_location_kind (kind_code, display_name)
values ('SHOP_STORAGE_TEST', 'Shopping storage test');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values
  (
    'b5000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'SHOP_STORAGE_TEST',
    'Shopping location A'
  ),
  (
    'b5000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'SHOP_STORAGE_TEST',
    'Shopping location B'
  );

insert into fridge.household_product_policy (
  household_product_policy_id,
  household_id,
  product_id,
  desired_quantity_num,
  desired_quantity_den,
  desired_unit_id,
  lifecycle_status
) values (
  'b6000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  2,
  1,
  'b2000000-0000-4000-8000-000000000001',
  'TEST_ACTIVE'
);

insert into fridge.household_product_storage_preference (
  household_product_storage_preference_id,
  household_id,
  household_product_policy_id,
  preference_rank,
  storage_location_id,
  lifecycle_status
) values (
  'b7000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001',
  1,
  'b5000000-0000-4000-8000-000000000001',
  'TEST_ACTIVE'
);

-- Storage preference cannot cross Household boundaries.
do $$
begin
  begin
    insert into fridge.household_product_storage_preference (
      household_product_storage_preference_id,
      household_id,
      household_product_policy_id,
      preference_rank,
      storage_location_id,
      lifecycle_status
    ) values (
      'b7000000-0000-4000-8000-000000000002',
      'b1000000-0000-4000-8000-000000000001',
      'b6000000-0000-4000-8000-000000000001',
      2,
      'b5000000-0000-4000-8000-000000000002',
      'TEST_ACTIVE'
    );

    raise exception 'cross-Household storage preference unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Preferred-storage target is exact-one.
do $$
begin
  begin
    insert into fridge.household_product_storage_preference (
      household_product_storage_preference_id,
      household_id,
      household_product_policy_id,
      preference_rank,
      storage_location_id,
      storage_location_kind_code,
      lifecycle_status
    ) values (
      'b7000000-0000-4000-8000-000000000003',
      'b1000000-0000-4000-8000-000000000001',
      'b6000000-0000-4000-8000-000000000001',
      3,
      'b5000000-0000-4000-8000-000000000001',
      'SHOP_STORAGE_TEST',
      'TEST_ACTIVE'
    );

    raise exception 'storage preference with two targets unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.shopping_list (
  shopping_list_id,
  household_id,
  lifecycle_status
) values (
  'b8000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'TEST_OPEN'
);

insert into fridge.shopping_list_item (
  shopping_list_item_id,
  household_id,
  shopping_list_id,
  requested_product_id,
  requested_quantity_num,
  requested_quantity_den,
  requested_unit_id,
  lifecycle_status
) values
  (
    'b9000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'b8000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    1,
    1,
    'b2000000-0000-4000-8000-000000000001',
    'TEST_OPEN'
  ),
  (
    'b9000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000001',
    'b8000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    1,
    1,
    'b2000000-0000-4000-8000-000000000001',
    'TEST_OPEN'
  );

-- Shopping item cannot carry Product and IngredientConcept simultaneously.
do $$
begin
  begin
    insert into fridge.shopping_list_item (
      shopping_list_item_id,
      household_id,
      shopping_list_id,
      requested_product_id,
      requested_ingredient_concept_id,
      requested_quantity_num,
      requested_quantity_den,
      requested_unit_id,
      lifecycle_status
    ) values (
      'b9000000-0000-4000-8000-000000000002',
      'b1000000-0000-4000-8000-000000000001',
      'b8000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000001',
      1,
      1,
      'b2000000-0000-4000-8000-000000000001',
      'TEST_OPEN'
    );

    raise exception 'ShoppingListItem with two subjects unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.currency (currency_code, display_name)
values ('BRL', 'Brazilian Real');

insert into fridge.purchase (
  purchase_id,
  household_id,
  transaction_currency_code,
  occurred_at
) values
  (
    'ba000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'BRL',
    '2026-01-30T10:00:00Z'
  ),
  (
    'ba000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'BRL',
    '2026-01-30T10:00:00Z'
  );

insert into fridge.purchase_item (
  purchase_item_id,
  household_id,
  purchase_id,
  product_id,
  purchased_quantity_num,
  purchased_quantity_den,
  purchased_unit_id
) values
  (
    'bb000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'ba000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    2,
    1,
    'b2000000-0000-4000-8000-000000000001'
  ),
  (
    'bb000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000001',
    2,
    1,
    'b2000000-0000-4000-8000-000000000001'
  );

insert into fridge.shopping_list_fulfillment (
  shopping_list_fulfillment_id,
  household_id,
  shopping_list_item_id,
  purchase_item_id,
  purchase_product_id,
  allocated_quantity_num,
  allocated_quantity_den,
  allocation_unit_id
) values (
  'bc000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b9000000-0000-4000-8000-000000000001',
  'bb000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  1,
  1,
  'b2000000-0000-4000-8000-000000000001'
);

-- Shopping fulfillment cannot consume another Household's PurchaseItem.
do $$
begin
  begin
    insert into fridge.shopping_list_fulfillment (
      shopping_list_fulfillment_id,
      household_id,
      shopping_list_item_id,
      purchase_item_id,
      purchase_product_id,
      allocated_quantity_num,
      allocated_quantity_den,
      allocation_unit_id
    ) values (
      'bc000000-0000-4000-8000-000000000002',
      'b1000000-0000-4000-8000-000000000001',
      'b9000000-0000-4000-8000-000000000001',
      'bb000000-0000-4000-8000-000000000002',
      'b3000000-0000-4000-8000-000000000001',
      1,
      1,
      'b2000000-0000-4000-8000-000000000001'
    );

    raise exception 'cross-Household ShoppingListFulfillment unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Purchase Product identity is pinned and cannot be rewritten by fulfillment.
-- A dedicated ShoppingListItem avoids colliding with the pair uniqueness that is
-- independently exercised by the valid fulfillment above.
do $$
begin
  begin
    insert into fridge.shopping_list_fulfillment (
      shopping_list_fulfillment_id,
      household_id,
      shopping_list_item_id,
      purchase_item_id,
      purchase_product_id,
      allocated_quantity_num,
      allocated_quantity_den,
      allocation_unit_id
    ) values (
      'bc000000-0000-4000-8000-000000000003',
      'b1000000-0000-4000-8000-000000000001',
      'b9000000-0000-4000-8000-000000000004',
      'bb000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000002',
      1,
      1,
      'b2000000-0000-4000-8000-000000000001'
    );

    raise exception 'ShoppingListFulfillment with wrong PurchaseItem Product unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

rollback;
