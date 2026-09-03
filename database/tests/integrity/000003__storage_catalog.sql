-- FridgeScanner DB-02 integrity checks for 000003__storage_catalog.sql

begin;

insert into fridge.storage_location_kind (kind_code, display_name)
values ('TEST_STORAGE', 'Test storage');

insert into fridge.compartment_kind (kind_code, display_name)
values ('TEST_COMPARTMENT', 'Test compartment');

insert into fridge.household (household_id, display_name)
values
  ('11000000-0000-4000-8000-000000000001', 'Catalog Household A'),
  ('11000000-0000-4000-8000-000000000002', 'Catalog Household B');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values (
  '12000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'TEST_STORAGE',
  'Fridge A'
);

-- Compartment cannot attach to a StorageLocation from another Household.
do $$
begin
  begin
    insert into fridge.compartment (
      compartment_id,
      household_id,
      storage_location_id,
      kind_code,
      display_name
    ) values (
      '13000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000002',
      '12000000-0000-4000-8000-000000000001',
      'TEST_COMPARTMENT',
      'Wrong household compartment'
    );

    raise exception 'cross-Household compartment unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Valid same-Household compartment succeeds.
insert into fridge.compartment (
  compartment_id,
  household_id,
  storage_location_id,
  kind_code,
  display_name
) values (
  '13000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'TEST_COMPARTMENT',
  'Shelf A'
);

-- GLOBAL catalog rows cannot have Household owners.
do $$
begin
  begin
    insert into fridge.product (
      product_id,
      catalog_scope,
      owner_household_id,
      canonical_name
    ) values (
      '14000000-0000-4000-8000-000000000001',
      'GLOBAL',
      '11000000-0000-4000-8000-000000000001',
      'Invalid global product'
    );

    raise exception 'GLOBAL Product with owner unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- HOUSEHOLD catalog rows require an owner.
do $$
begin
  begin
    insert into fridge.ingredient_concept (
      ingredient_concept_id,
      catalog_scope,
      canonical_name
    ) values (
      '15000000-0000-4000-8000-000000000001',
      'HOUSEHOLD',
      'Invalid private concept'
    );

    raise exception 'HOUSEHOLD IngredientConcept without owner unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.product (
  product_id,
  catalog_scope,
  canonical_name
) values (
  '14000000-0000-4000-8000-000000000002',
  'GLOBAL',
  'Global product'
);

insert into fridge.ingredient_concept (
  ingredient_concept_id,
  catalog_scope,
  canonical_name
) values (
  '15000000-0000-4000-8000-000000000002',
  'GLOBAL',
  'Global concept'
);

insert into fridge.product (
  product_id,
  catalog_scope,
  owner_household_id,
  canonical_name
) values (
  '14000000-0000-4000-8000-000000000003',
  'HOUSEHOLD',
  '11000000-0000-4000-8000-000000000001',
  'Private product A'
);

insert into fridge.ingredient_concept (
  ingredient_concept_id,
  catalog_scope,
  owner_household_id,
  canonical_name
) values (
  '15000000-0000-4000-8000-000000000003',
  'HOUSEHOLD',
  '11000000-0000-4000-8000-000000000001',
  'Private concept A'
);

-- Base DDL permits endpoint existence; GLOBAL/same-Household visibility of compatibility
-- is intentionally validated later by the governed mutation routine and postcondition guard.
insert into fridge.product_ingredient_compatibility (
  compatibility_mapping_id,
  mapping_family_id,
  version_no,
  catalog_scope,
  product_id,
  ingredient_concept_id,
  effective_from
) values (
  '16000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000010',
  1,
  'GLOBAL',
  '14000000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000002',
  '2026-01-01T00:00:00Z'
);

rollback;
