-- FridgeScanner DB-02 integrity test
-- Privileged GLOBAL idempotency boundary separation.

begin;

set local role fridge_migrator;

do $$
declare
  v_first fridge_internal.idempotency_acquire_result;
  v_repeat fridge_internal.idempotency_acquire_result;
  v_conflict fridge_internal.idempotency_acquire_result;
begin
  select * into v_first
  from fridge_internal.acquire_global_idempotency(
    '20000000-0000-0000-0000-000000000001',
    'global-test-principal',
    'GLOBAL_TEST',
    '1',
    'global-key',
    'fingerprint-a',
    'STARTED',
    null
  );

  if not v_first.is_executor or not v_first.fingerprint_matches then
    raise exception 'global idempotency failure: first caller must become executor';
  end if;

  select * into v_repeat
  from fridge_internal.acquire_global_idempotency(
    '20000000-0000-0000-0000-000000000099',
    'global-test-principal',
    'GLOBAL_TEST',
    '1',
    'global-key',
    'fingerprint-a',
    'STARTED',
    null
  );

  if v_repeat.is_executor
     or not v_repeat.fingerprint_matches
     or v_repeat.idempotency_record_id <> v_first.idempotency_record_id then
    raise exception 'global idempotency failure: identical replay did not observe canonical row';
  end if;

  select * into v_conflict
  from fridge_internal.acquire_global_idempotency(
    '20000000-0000-0000-0000-000000000098',
    'global-test-principal',
    'GLOBAL_TEST',
    '1',
    'global-key',
    'fingerprint-different',
    'STARTED',
    null
  );

  if v_conflict.is_executor or v_conflict.fingerprint_matches then
    raise exception 'global idempotency failure: mismatched fingerprint was not surfaced as conflict';
  end if;
end;
$$;

reset role;

-- Tenant capability has no EXECUTE privilege on the GLOBAL boundary.
set local role fridge_app;

do $$
begin
  begin
    perform fridge_internal.acquire_global_idempotency(
      '20000000-0000-0000-0000-000000000002',
      'tenant-principal',
      'GLOBAL_TEST',
      '1',
      'tenant-must-not-call',
      'fingerprint-b',
      'STARTED',
      null
    );
    raise exception 'privilege failure: fridge_app executed GLOBAL idempotency boundary';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;
rollback;
