-- FridgeScanner DB-02 integrity checks for 000013_01__external_reference_import_context.sql

begin;

insert into fridge.integration (
  integration_id,
  integration_scope,
  provider_code,
  lifecycle_status
) values
  ('a5000000-0000-4000-8000-000000000001', 'GLOBAL', 'GLOBAL_A', 'TEST_ACTIVE'),
  ('a5000000-0000-4000-8000-000000000002', 'GLOBAL', 'GLOBAL_B', 'TEST_ACTIVE');

insert into fridge.import_run (
  import_run_id,
  integration_id,
  household_id,
  source_run_identity,
  lifecycle_status,
  requested_at
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  null,
  'global-run-a',
  'TEST_COMPLETE',
  '2026-01-26T10:00:00Z'
);

-- NULL Household must not short-circuit Integration/ImportRun identity.
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
      'a7000000-0000-4000-8000-000000000001',
      'GLOBAL',
      'a5000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000001',
      null,
      'catalog',
      'product',
      'wrong-integration-global-ref',
      'TEST_PENDING',
      'TEST_PENDING',
      '2026-01-26T10:01:00Z',
      '2026-01-26T10:01:00Z'
    );

    raise exception 'GLOBAL ExternalReference cited ImportRun from another Integration';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

rollback;
