-- FridgeScanner DB-02 integrity checks for 000013__integrations_imports.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('a1000000-0000-4000-8000-000000000001', 'Import household A'),
  ('a1000000-0000-4000-8000-000000000002', 'Import household B');

insert into fridge.integration (
  integration_id,
  integration_scope,
  household_id,
  provider_code,
  provider_account_ref,
  credential_ref,
  lifecycle_status
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'HOUSEHOLD',
    'a1000000-0000-4000-8000-000000000001',
    'PROVIDER_TEST',
    'acct-a',
    'vault://credential/test-a',
    'TEST_ACTIVE'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'GLOBAL',
    null,
    'GLOBAL_PROVIDER_TEST',
    'global-acct',
    null,
    'TEST_ACTIVE'
  );

-- Integration scope/Household shape is exact.
do $$
begin
  begin
    insert into fridge.integration (
      integration_id,
      integration_scope,
      household_id,
      provider_code,
      lifecycle_status
    ) values (
      'a2000000-0000-4000-8000-000000000003',
      'GLOBAL',
      'a1000000-0000-4000-8000-000000000001',
      'INVALID_SCOPE_TEST',
      'TEST_ACTIVE'
    );

    raise exception 'GLOBAL integration with Household unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into fridge.import_run (
  import_run_id,
  integration_id,
  household_id,
  source_run_identity,
  lifecycle_status,
  requested_at,
  started_at
) values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'source-run-001',
  'TEST_RUNNING',
  '2026-01-25T10:00:00Z',
  '2026-01-25T10:01:00Z'
);

-- ImportRun chronology cannot complete before it starts.
do $$
begin
  begin
    insert into fridge.import_run (
      import_run_id,
      integration_id,
      household_id,
      source_run_identity,
      lifecycle_status,
      requested_at,
      started_at,
      completed_at
    ) values (
      'a3000000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'source-run-invalid-time',
      'TEST_FAILED',
      '2026-01-25T10:00:00Z',
      '2026-01-25T10:05:00Z',
      '2026-01-25T10:04:00Z'
    );

    raise exception 'ImportRun completed before start unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into fridge.external_reference (
  external_reference_id,
  external_reference_scope,
  integration_id,
  import_run_id,
  household_id,
  provider_namespace,
  provider_entity_type,
  provider_entity_value,
  normalization_status,
  reconciliation_status,
  first_seen_at,
  last_seen_at
) values (
  'a4000000-0000-4000-8000-000000000001',
  'HOUSEHOLD',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'inventory',
  'product',
  'provider-product-001',
  'TEST_NORMALIZED',
  'TEST_RESOLVED',
  '2026-01-25T10:02:00Z',
  '2026-01-25T10:03:00Z'
);

-- ExternalReference cannot claim the ImportRun through another Household.
do $$
begin
  begin
    insert into fridge.external_reference (
      external_reference_id,
      external_reference_scope,
      integration_id,
      import_run_id,
      household_id,
      provider_namespace,
      provider_entity_type,
      provider_entity_value,
      normalization_status,
      reconciliation_status,
      first_seen_at,
      last_seen_at
    ) values (
      'a4000000-0000-4000-8000-000000000002',
      'HOUSEHOLD',
      'a2000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'inventory',
      'product',
      'provider-product-002',
      'TEST_PENDING',
      'TEST_PENDING',
      '2026-01-25T10:02:00Z',
      '2026-01-25T10:03:00Z'
    );

    raise exception 'cross-Household ExternalReference/ImportRun unexpectedly accepted';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

-- ExternalReference cannot bind the same ImportRun under another Integration.
do $$
begin
  begin
    insert into fridge.external_reference (
      external_reference_id,
      external_reference_scope,
      integration_id,
      import_run_id,
      household_id,
      provider_namespace,
      provider_entity_type,
      provider_entity_value,
      normalization_status,
      reconciliation_status,
      first_seen_at,
      last_seen_at
    ) values (
      'a4000000-0000-4000-8000-000000000003',
      'HOUSEHOLD',
      'a2000000-0000-4000-8000-000000000002',
      'a3000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'inventory',
      'product',
      'provider-product-003',
      'TEST_PENDING',
      'TEST_PENDING',
      '2026-01-25T10:02:00Z',
      '2026-01-25T10:03:00Z'
    );

    raise exception 'ExternalReference with wrong Integration for ImportRun unexpectedly accepted';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

-- Provider identity uniqueness is contextual to integration + scope + namespace/type/value.
do $$
begin
  begin
    insert into fridge.external_reference (
      external_reference_id,
      external_reference_scope,
      integration_id,
      household_id,
      provider_namespace,
      provider_entity_type,
      provider_entity_value,
      normalization_status,
      reconciliation_status,
      first_seen_at,
      last_seen_at
    ) values (
      'a4000000-0000-4000-8000-000000000004',
      'HOUSEHOLD',
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'inventory',
      'product',
      'provider-product-001',
      'TEST_PENDING',
      'TEST_PENDING',
      '2026-01-25T10:04:00Z',
      '2026-01-25T10:04:00Z'
    );

    raise exception 'duplicate provider identity unexpectedly accepted';
  exception
    when unique_violation then null;
  end;
end;
$$;

-- last_seen_at cannot precede first_seen_at.
do $$
begin
  begin
    insert into fridge.external_reference (
      external_reference_id,
      external_reference_scope,
      integration_id,
      household_id,
      provider_namespace,
      provider_entity_type,
      provider_entity_value,
      normalization_status,
      reconciliation_status,
      first_seen_at,
      last_seen_at
    ) values (
      'a4000000-0000-4000-8000-000000000005',
      'GLOBAL',
      'a2000000-0000-4000-8000-000000000002',
      null,
      'catalog',
      'product',
      'global-product-001',
      'TEST_PENDING',
      'TEST_PENDING',
      '2026-01-25T10:05:00Z',
      '2026-01-25T10:04:00Z'
    );

    raise exception 'ExternalReference last_seen before first_seen unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

rollback;
