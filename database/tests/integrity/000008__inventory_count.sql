-- FridgeScanner DB-02 integrity checks for 000008__inventory_count.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('71000000-0000-4000-8000-000000000001', 'Count household A'),
  ('71000000-0000-4000-8000-000000000002', 'Count household B');

insert into fridge.storage_location_kind (kind_code, display_name)
values ('COUNT_STORAGE_TEST', 'Count storage test');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'COUNT_STORAGE_TEST',
    'Count location A'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'COUNT_STORAGE_TEST',
    'Count location B'
  );

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('COUNT_RECON_TEST', 'Count reconciliation test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  display_name
) values (
  '73000000-0000-4000-8000-000000000001',
  'COUNT_RECON_UNIT_TEST',
  'COUNT_RECON_TEST',
  'Count reconciliation unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name)
values
  ('74000000-0000-4000-8000-000000000001', 'GLOBAL', 'Count product A'),
  ('74000000-0000-4000-8000-000000000002', 'GLOBAL', 'Count product B');

insert into fridge.stock_item (
  stock_item_id,
  household_id,
  product_id,
  placement_anchor_kind,
  storage_location_id
) values
  (
    '75000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    'LOCATION',
    '72000000-0000-4000-8000-000000000001'
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000002',
    'LOCATION',
    '72000000-0000-4000-8000-000000000001'
  );

insert into fridge.inventory_count (
  inventory_count_id,
  household_id,
  lifecycle_status,
  started_at
) values (
  '76000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'TEST_OPEN',
  '2026-01-21T10:00:00Z'
);

insert into fridge.inventory_ledger_basis (
  inventory_ledger_basis_id,
  household_id,
  product_id,
  watermark_namespace,
  watermark_token,
  cutoff_occurred_at
) values
  (
    '77000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    'LEDGER_TEST',
    'watermark-a-1',
    '2026-01-21T09:59:00Z'
  ),
  (
    '77000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    'LEDGER_TEST',
    'watermark-a-2',
    '2026-01-21T10:01:00Z'
  );

-- Unmatched physical discovery is representable without fabricating a StockItem.
insert into fridge.inventory_count_item (
  inventory_count_item_id,
  household_id,
  inventory_count_id,
  product_id,
  observed_quantity_num,
  observed_quantity_den,
  observed_unit_id,
  observed_at,
  inventory_ledger_basis_id,
  reconciliation_status
) values (
  '78000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  0,
  1,
  '73000000-0000-4000-8000-000000000001',
  '2026-01-21T10:02:00Z',
  '77000000-0000-4000-8000-000000000001',
  'TEST_PENDING'
);

insert into fridge.inventory_count_item (
  inventory_count_item_id,
  household_id,
  inventory_count_id,
  product_id,
  observed_quantity_num,
  observed_quantity_den,
  observed_unit_id,
  stock_item_id,
  placement_anchor_kind,
  storage_location_id,
  observed_at,
  inventory_ledger_basis_id,
  reconciliation_status
) values (
  '78000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  3,
  1,
  '73000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  'LOCATION',
  '72000000-0000-4000-8000-000000000001',
  '2026-01-21T10:03:00Z',
  '77000000-0000-4000-8000-000000000001',
  'TEST_PENDING'
);

-- Observation ordering evidence is all-or-none.
do $$
begin
  begin
    insert into fridge.inventory_count_item (
      inventory_count_item_id,
      household_id,
      inventory_count_id,
      product_id,
      observed_quantity_num,
      observed_quantity_den,
      observed_unit_id,
      observed_at,
      inventory_ledger_basis_id,
      observation_ordering_domain,
      reconciliation_status
    ) values (
      '78000000-0000-4000-8000-000000000003',
      '71000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      1,
      1,
      '73000000-0000-4000-8000-000000000001',
      '2026-01-21T10:04:00Z',
      '77000000-0000-4000-8000-000000000001',
      'ORDER_DOMAIN_TEST',
      'TEST_PENDING'
    );

    raise exception 'half-populated observation ordering evidence unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- CountItem Product must equal its exact ledger basis Product.
do $$
begin
  begin
    insert into fridge.inventory_count_item (
      inventory_count_item_id,
      household_id,
      inventory_count_id,
      product_id,
      observed_quantity_num,
      observed_quantity_den,
      observed_unit_id,
      observed_at,
      inventory_ledger_basis_id,
      reconciliation_status
    ) values (
      '78000000-0000-4000-8000-000000000004',
      '71000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000002',
      1,
      1,
      '73000000-0000-4000-8000-000000000001',
      '2026-01-21T10:05:00Z',
      '77000000-0000-4000-8000-000000000001',
      'TEST_PENDING'
    );

    raise exception 'CountItem with mismatched ledger-basis Product unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- CountItem cannot attach to another Household's count session.
do $$
begin
  begin
    insert into fridge.inventory_count_item (
      inventory_count_item_id,
      household_id,
      inventory_count_id,
      product_id,
      observed_quantity_num,
      observed_quantity_den,
      observed_unit_id,
      observed_at,
      inventory_ledger_basis_id,
      reconciliation_status
    ) values (
      '78000000-0000-4000-8000-000000000005',
      '71000000-0000-4000-8000-000000000002',
      '76000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      1,
      1,
      '73000000-0000-4000-8000-000000000001',
      '2026-01-21T10:06:00Z',
      '77000000-0000-4000-8000-000000000001',
      'TEST_PENDING'
    );

    raise exception 'cross-Household CountItem unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- Deterministic allocation cannot reinterpret the CountItem Product.
do $$
begin
  begin
    insert into fridge.inventory_count_allocation (
      inventory_count_allocation_id,
      household_id,
      inventory_count_item_id,
      product_id,
      target_stock_item_id,
      allocated_quantity_num,
      allocated_quantity_den,
      allocation_unit_id,
      decision_evidence
    ) values (
      '79000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      '78000000-0000-4000-8000-000000000002',
      '74000000-0000-4000-8000-000000000002',
      '75000000-0000-4000-8000-000000000002',
      1,
      1,
      '73000000-0000-4000-8000-000000000001',
      'wrong-product allocation test'
    );

    raise exception 'Count allocation with wrong Product unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.inventory_count_allocation (
  inventory_count_allocation_id,
  household_id,
  inventory_count_item_id,
  product_id,
  target_stock_item_id,
  allocated_quantity_num,
  allocated_quantity_den,
  allocation_unit_id,
  decision_evidence
) values (
  '79000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  3,
  1,
  '73000000-0000-4000-8000-000000000001',
  'deterministic same-stock test'
);

-- Outcome must preserve the exact basis used by the count line.
do $$
begin
  begin
    insert into fridge.inventory_reconciliation_outcome (
      inventory_reconciliation_outcome_id,
      household_id,
      inventory_count_item_id,
      inventory_ledger_basis_id,
      product_id,
      evidence_set_identity,
      outcome_status,
      rationale,
      decided_at
    ) values (
      '7a000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      '78000000-0000-4000-8000-000000000002',
      '77000000-0000-4000-8000-000000000002',
      '74000000-0000-4000-8000-000000000001',
      'wrong-basis-evidence-set',
      'TEST_ADJUSTED',
      'wrong basis must fail',
      '2026-01-21T10:10:00Z'
    );

    raise exception 'reconciliation outcome with a different basis unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.inventory_movement (
  inventory_movement_id,
  household_id,
  movement_kind,
  product_id,
  quantity_num,
  quantity_den,
  measurement_unit_id,
  occurred_at
) values (
  '7b000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'COUNT_ADJUSTMENT_TEST',
  '74000000-0000-4000-8000-000000000002',
  1,
  1,
  '73000000-0000-4000-8000-000000000001',
  '2026-01-21T10:11:00Z'
);

-- Adjustment movement cannot belong to another Product.
do $$
begin
  begin
    insert into fridge.inventory_reconciliation_outcome (
      inventory_reconciliation_outcome_id,
      household_id,
      inventory_count_item_id,
      inventory_ledger_basis_id,
      product_id,
      evidence_set_identity,
      outcome_status,
      adjustment_inventory_movement_id,
      rationale,
      decided_at
    ) values (
      '7a000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000001',
      '78000000-0000-4000-8000-000000000002',
      '77000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      'wrong-adjustment-product-set',
      'TEST_ADJUSTED',
      '7b000000-0000-4000-8000-000000000001',
      'wrong adjustment Product must fail',
      '2026-01-21T10:12:00Z'
    );

    raise exception 'reconciliation outcome with wrong adjustment Product unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

rollback;
