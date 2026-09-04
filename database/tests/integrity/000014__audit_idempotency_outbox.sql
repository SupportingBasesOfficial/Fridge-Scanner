-- FridgeScanner DB-02 integrity checks for 000014__audit_idempotency_outbox.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('b1000000-0000-4000-8000-000000000001', 'Audit household A'),
  ('b1000000-0000-4000-8000-000000000002', 'Audit household B');

insert into fridge.audit_event (
  audit_event_id,
  household_id,
  principal_identity,
  action_code,
  target_type,
  target_identity,
  occurred_at,
  trace_identity
) values (
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'principal:test',
  'ACTION_TEST',
  'PRODUCT',
  'product:test',
  '2026-01-27T10:00:00Z',
  'trace-test'
);

-- Audit target evidentiary metadata is all-or-none.
do $$
begin
  begin
    insert into fridge.audit_event (
      audit_event_id,
      principal_identity,
      action_code,
      target_type,
      occurred_at
    ) values (
      'b2000000-0000-4000-8000-000000000002',
      'principal:test',
      'ACTION_TEST',
      'PRODUCT',
      '2026-01-27T10:01:00Z'
    );

    raise exception 'half-populated audit target unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into fridge.idempotency_record (
  idempotency_record_id,
  target_scope,
  household_id,
  principal_identity,
  operation_code,
  operation_version,
  client_key,
  request_fingerprint,
  execution_state
) values (
  'b3000000-0000-4000-8000-000000000001',
  'HOUSEHOLD',
  'b1000000-0000-4000-8000-000000000001',
  'principal:test',
  'CREATE_PURCHASE',
  'v1',
  'client-key-001',
  'sha256:request-a',
  'TEST_RUNNING'
);

-- HOUSEHOLD commands must carry Household scope.
do $$
begin
  begin
    insert into fridge.idempotency_record (
      idempotency_record_id,
      target_scope,
      principal_identity,
      operation_code,
      operation_version,
      client_key,
      request_fingerprint,
      execution_state
    ) values (
      'b3000000-0000-4000-8000-000000000002',
      'HOUSEHOLD',
      'principal:test',
      'CREATE_PURCHASE',
      'v1',
      'client-key-002',
      'sha256:request-b',
      'TEST_RUNNING'
    );

    raise exception 'HOUSEHOLD idempotency without household unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

-- Same key in same scope/principal/operation/version cannot create a second record.
do $$
begin
  begin
    insert into fridge.idempotency_record (
      idempotency_record_id,
      target_scope,
      household_id,
      principal_identity,
      operation_code,
      operation_version,
      client_key,
      request_fingerprint,
      execution_state
    ) values (
      'b3000000-0000-4000-8000-000000000003',
      'HOUSEHOLD',
      'b1000000-0000-4000-8000-000000000001',
      'principal:test',
      'CREATE_PURCHASE',
      'v1',
      'client-key-001',
      'sha256:different-request',
      'TEST_RUNNING'
    );

    raise exception 'duplicate idempotency key unexpectedly accepted';
  exception
    when unique_violation then null;
  end;
end;
$$;

-- Same client key may exist independently in another Household.
insert into fridge.idempotency_record (
  idempotency_record_id,
  target_scope,
  household_id,
  principal_identity,
  operation_code,
  operation_version,
  client_key,
  request_fingerprint,
  execution_state
) values (
  'b3000000-0000-4000-8000-000000000004',
  'HOUSEHOLD',
  'b1000000-0000-4000-8000-000000000002',
  'principal:test',
  'CREATE_PURCHASE',
  'v1',
  'client-key-001',
  'sha256:request-other-household',
  'TEST_RUNNING'
);

-- GLOBAL scope must not carry Household identity.
do $$
begin
  begin
    insert into fridge.idempotency_record (
      idempotency_record_id,
      target_scope,
      household_id,
      principal_identity,
      operation_code,
      operation_version,
      client_key,
      request_fingerprint,
      execution_state
    ) values (
      'b3000000-0000-4000-8000-000000000005',
      'GLOBAL',
      'b1000000-0000-4000-8000-000000000001',
      'principal:test',
      'GLOBAL_OPERATION',
      'v1',
      'global-key',
      'sha256:global-request',
      'TEST_RUNNING'
    );

    raise exception 'GLOBAL idempotency with Household unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into fridge.outbox_record (
  outbox_record_id,
  household_id,
  event_contract_code,
  event_contract_version,
  aggregate_type,
  aggregate_identity,
  payload_json,
  publication_state,
  available_at
) values (
  'b4000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'inventory.changed',
  'v1',
  'InventoryMovement',
  'movement:test',
  '{"event":"test"}'::jsonb,
  'TEST_PENDING',
  '2026-01-27T10:10:00Z'
);

-- Outbox payload is exactly inline JSON or immutable reference, never both/none.
do $$
begin
  begin
    insert into fridge.outbox_record (
      outbox_record_id,
      event_contract_code,
      event_contract_version,
      aggregate_type,
      aggregate_identity,
      payload_json,
      payload_reference,
      publication_state,
      available_at
    ) values (
      'b4000000-0000-4000-8000-000000000002',
      'test.event',
      'v1',
      'TestAggregate',
      'aggregate:test',
      '{"event":"test"}'::jsonb,
      'object://payload/test',
      'TEST_PENDING',
      '2026-01-27T10:10:00Z'
    );

    raise exception 'Outbox with two payload authorities unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    insert into fridge.outbox_record (
      outbox_record_id,
      event_contract_code,
      event_contract_version,
      aggregate_type,
      aggregate_identity,
      publication_state,
      available_at
    ) values (
      'b4000000-0000-4000-8000-000000000003',
      'test.event',
      'v1',
      'TestAggregate',
      'aggregate:test',
      'TEST_PENDING',
      '2026-01-27T10:10:00Z'
    );

    raise exception 'Outbox without payload unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

-- Publication cannot predate availability.
do $$
begin
  begin
    insert into fridge.outbox_record (
      outbox_record_id,
      event_contract_code,
      event_contract_version,
      aggregate_type,
      aggregate_identity,
      payload_reference,
      publication_state,
      available_at,
      published_at
    ) values (
      'b4000000-0000-4000-8000-000000000004',
      'test.event',
      'v1',
      'TestAggregate',
      'aggregate:test',
      'object://payload/test-2',
      'TEST_PUBLISHED',
      '2026-01-27T10:10:00Z',
      '2026-01-27T10:09:59Z'
    );

    raise exception 'Outbox published before availability unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

rollback;
