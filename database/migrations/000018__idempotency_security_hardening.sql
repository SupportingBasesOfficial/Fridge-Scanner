-- FridgeScanner DB-02
-- 000018__idempotency_security_hardening.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Converts the tenant-facing idempotency create-or-observe routine into a
-- restricted Household-only mutation boundary. GLOBAL idempotency uses a
-- separately privileged boundary and is never inferred from caller/session role
-- state inside this tenant function.

begin;

create or replace function fridge_internal.acquire_idempotency(
  p_idempotency_record_id uuid,
  p_target_scope fridge.command_scope,
  p_household_id uuid,
  p_principal_identity text,
  p_operation_code text,
  p_operation_version text,
  p_client_key text,
  p_request_fingerprint text,
  p_initial_execution_state text,
  p_expires_at timestamptz default null
)
returns fridge_internal.idempotency_acquire_result
language plpgsql
security definer
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_row fridge.idempotency_record%rowtype;
  v_result fridge_internal.idempotency_acquire_result;
  v_context_household_id uuid;
begin
  if p_idempotency_record_id is null then
    raise exception using errcode = '22004', message = 'idempotency_record_id is required';
  end if;

  if p_target_scope <> 'HOUSEHOLD' then
    raise exception using
      errcode = '42501',
      message = 'tenant idempotency boundary accepts HOUSEHOLD scope only';
  end if;

  if p_household_id is null then
    raise exception using errcode = '22023', message = 'HOUSEHOLD idempotency scope requires household_id';
  end if;

  v_context_household_id := fridge_internal.current_household_id();

  if v_context_household_id is null or p_household_id <> v_context_household_id then
    raise exception using
      errcode = '42501',
      message = 'idempotency household does not match trusted transaction context';
  end if;

  if p_principal_identity is null or btrim(p_principal_identity) = ''
     or p_operation_code is null or btrim(p_operation_code) = ''
     or p_operation_version is null or btrim(p_operation_version) = ''
     or p_client_key is null or btrim(p_client_key) = ''
     or p_request_fingerprint is null or btrim(p_request_fingerprint) = ''
     or p_initial_execution_state is null or btrim(p_initial_execution_state) = '' then
    raise exception using errcode = '22023', message = 'idempotency identity, fingerprint and initial state must be nonblank';
  end if;

  insert into fridge.idempotency_record (
    idempotency_record_id,
    target_scope,
    household_id,
    principal_identity,
    operation_code,
    operation_version,
    client_key,
    request_fingerprint,
    execution_state,
    expires_at
  ) values (
    p_idempotency_record_id,
    'HOUSEHOLD',
    p_household_id,
    p_principal_identity,
    p_operation_code,
    p_operation_version,
    p_client_key,
    p_request_fingerprint,
    p_initial_execution_state,
    p_expires_at
  )
  on conflict (
    household_id,
    principal_identity,
    operation_code,
    operation_version,
    client_key
  ) where target_scope = 'HOUSEHOLD'
  do nothing
  returning * into v_row;

  if found then
    v_result.idempotency_record_id := v_row.idempotency_record_id;
    v_result.execution_state := v_row.execution_state;
    v_result.is_executor := true;
    v_result.fingerprint_matches := true;
    v_result.result_type := v_row.result_type;
    v_result.result_identity := v_row.result_identity;
    return v_result;
  end if;

  select *
    into v_row
    from fridge.idempotency_record
   where target_scope = 'HOUSEHOLD'
     and household_id = p_household_id
     and principal_identity = p_principal_identity
     and operation_code = p_operation_code
     and operation_version = p_operation_version
     and client_key = p_client_key
   for update;

  if not found then
    raise exception using errcode = '40001', message = 'idempotency contender disappeared; retry transaction';
  end if;

  v_result.idempotency_record_id := v_row.idempotency_record_id;
  v_result.execution_state := v_row.execution_state;
  v_result.is_executor := false;
  v_result.fingerprint_matches := (v_row.request_fingerprint = p_request_fingerprint);
  v_result.result_type := v_row.result_type;
  v_result.result_identity := v_row.result_identity;
  return v_result;
end;
$$;

comment on function fridge_internal.acquire_idempotency(
  uuid,
  fridge.command_scope,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Tenant-facing atomic create-or-observe boundary. Only HOUSEHOLD scope is accepted and p_household_id must match the trusted transaction context. SECURITY DEFINER prevents ordinary callers from needing direct idempotency-table DML.';

revoke all on function fridge_internal.acquire_idempotency(
  uuid,
  fridge.command_scope,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public;

commit;
