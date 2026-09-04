-- FridgeScanner DB-02 integrity checks for the HOUSEHOLD-only idempotency boundary.

begin;

insert into fridge.household (household_id, display_name)
values
  ('b5000000-0000-4000-8000-000000000001', 'Idempotency household A'),
  ('b5000000-0000-4000-8000-000000000002', 'Idempotency household B');

-- Trusted backend transaction context must match the command Household.
set local fridge.household_id = 'b5000000-0000-4000-8000-000000000001';

do $$
declare
  v_first fridge_internal.idempotency_acquire_result;
  v_same fridge_internal.idempotency_acquire_result;
  v_conflict fridge_internal.idempotency_acquire_result;
begin
  v_first := fridge_internal.acquire_idempotency(
    'b6000000-0000-4000-8000-000000000001',
    'HOUSEHOLD',
    'b5000000-0000-4000-8000-000000000001',
    'principal:test',
    'CREATE_RECEIPT',
    'v1',
    'client-key-test',
    'sha256:request-1',
    'TEST_RUNNING',
    null
  );

  if not v_first.is_executor or not v_first.fingerprint_matches then
    raise exception 'first idempotency acquisition did not win execution';
  end if;

  v_same := fridge_internal.acquire_idempotency(
    'b6000000-0000-4000-8000-000000000002',
    'HOUSEHOLD',
    'b5000000-0000-4000-8000-000000000001',
    'principal:test',
    'CREATE_RECEIPT',
    'v1',
    'client-key-test',
    'sha256:request-1',
    'TEST_RUNNING',
    null
  );

  if v_same.is_executor or not v_same.fingerprint_matches then
    raise exception 'same-fingerprint contender was not observed as replay';
  end if;

  if v_same.idempotency_record_id <> v_first.idempotency_record_id then
    raise exception 'same idempotency identity did not resolve to canonical row';
  end if;

  v_conflict := fridge_internal.acquire_idempotency(
    'b6000000-0000-4000-8000-000000000003',
    'HOUSEHOLD',
    'b5000000-0000-4000-8000-000000000001',
    'principal:test',
    'CREATE_RECEIPT',
    'v1',
    'client-key-test',
    'sha256:different-request',
    'TEST_RUNNING',
    null
  );

  if v_conflict.is_executor or v_conflict.fingerprint_matches then
    raise exception 'different-fingerprint idempotency reuse did not surface conflict';
  end if;
end;
$$;

-- The tenant boundary must reject another Household even for a trusted caller.
do $$
begin
  begin
    perform fridge_internal.acquire_idempotency(
      'b6000000-0000-4000-8000-000000000004',
      'HOUSEHOLD',
      'b5000000-0000-4000-8000-000000000002',
      'principal:test',
      'CREATE_RECEIPT',
      'v1',
      'other-household-key',
      'sha256:other-household',
      'TEST_RUNNING',
      null
    );
    raise exception 'cross-Household idempotency acquisition unexpectedly accepted';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

-- GLOBAL is a different authority surface and must not be reachable through the
-- ordinary HOUSEHOLD boundary. Its behavior is covered by 000020.
do $$
begin
  begin
    perform fridge_internal.acquire_idempotency(
      'b6000000-0000-4000-8000-000000000010',
      'GLOBAL',
      null,
      'principal:test',
      'GLOBAL_COMMAND',
      'v1',
      'global-key-test',
      'sha256:global-request',
      'TEST_RUNNING',
      null
    );
    raise exception 'GLOBAL scope unexpectedly accepted by HOUSEHOLD idempotency boundary';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

rollback;
