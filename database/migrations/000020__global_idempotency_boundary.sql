-- FridgeScanner DB-02
-- 000020__global_idempotency_boundary.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Privileged GLOBAL idempotency create-or-observe boundary. This routine is not
-- granted to fridge_app/fridge_worker/fridge_readonly; execution is limited to
-- owner/migrator capabilities and is distinct from the tenant Household boundary.

begin;

create or replace function fridge_internal.acquire_global_idempotency(
  p_idempotency_record_id uuid,
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
begin
  if p_idempotency_record_id is null then
    raise exception using errcode = '22004', message = 'idempotency_record_id is required';
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
    'GLOBAL',
    null,
    p_principal_identity,
    p_operation_code,
    p_operation_version,
    p_client_key,
    p_request_fingerprint,
    p_initial_execution_state,
    p_expires_at
  )
  on conflict (
    principal_identity,
    operation_code,
    operation_version,
    client_key
  ) where target_scope = 'GLOBAL'
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
   where target_scope = 'GLOBAL'
     and principal_identity = p_principal_identity
     and operation_code = p_operation_code
     and operation_version = p_operation_version
     and client_key = p_client_key
   for update;

  if not found then
    raise exception using errcode = '40001', message = 'global idempotency contender disappeared; retry transaction';
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

comment on function fridge_internal.acquire_global_idempotency(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Privileged GLOBAL create-or-observe idempotency boundary. Separate from tenant Household acquisition so tenant roles cannot escalate scope through parameters.';

revoke all on function fridge_internal.acquire_global_idempotency(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public;

grant usage on type fridge_internal.idempotency_acquire_result
  to fridge_owner, fridge_migrator;
grant execute on function fridge_internal.acquire_global_idempotency(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to fridge_owner, fridge_migrator;

commit;
