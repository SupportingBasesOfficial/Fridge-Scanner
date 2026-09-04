-- FridgeScanner DB-02
-- 000014__audit_idempotency_outbox.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create type fridge.command_scope as enum ('GLOBAL', 'HOUSEHOLD');

create table fridge.audit_event (
  audit_event_id uuid primary key,
  household_id uuid,
  principal_identity text not null,
  actor_user_id uuid,
  action_code text not null,
  target_type text,
  target_identity text,
  occurred_at timestamptz not null,
  trace_identity text,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint audit_event_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint audit_event_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint audit_event_principal_nonblank check (btrim(principal_identity) <> ''),
  constraint audit_event_action_nonblank check (btrim(action_code) <> ''),
  constraint audit_event_target_pair
    check (
      (target_type is null and target_identity is null)
      or
      (target_type is not null and btrim(target_type) <> '' and target_identity is not null and btrim(target_identity) <> '')
    ),
  constraint audit_event_trace_nonblank
    check (trace_identity is null or btrim(trace_identity) <> ''),
  constraint audit_event_household_identity_uq
    unique nulls not distinct (household_id, audit_event_id)
);

comment on table fridge.audit_event is
  'Append-only audit evidence. Generic target identity is evidentiary metadata only and never substitutes for typed business foreign keys or authorization.';

create index audit_event_household_occurred_idx
  on fridge.audit_event (household_id, occurred_at desc, audit_event_id)
  where household_id is not null;
create index audit_event_trace_idx
  on fridge.audit_event (trace_identity, audit_event_id)
  where trace_identity is not null;

create table fridge.idempotency_record (
  idempotency_record_id uuid primary key,
  target_scope fridge.command_scope not null,
  household_id uuid,
  principal_identity text not null,
  operation_code text not null,
  operation_version text not null,
  client_key text not null,
  request_fingerprint text not null,
  execution_state text not null,
  result_type text,
  result_identity text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  expires_at timestamptz,
  provenance text,
  constraint idempotency_record_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint idempotency_record_scope_shape
    check (
      (target_scope = 'GLOBAL' and household_id is null)
      or
      (target_scope = 'HOUSEHOLD' and household_id is not null)
    ),
  constraint idempotency_record_principal_nonblank check (btrim(principal_identity) <> ''),
  constraint idempotency_record_operation_nonblank
    check (btrim(operation_code) <> '' and btrim(operation_version) <> ''),
  constraint idempotency_record_client_key_nonblank check (btrim(client_key) <> ''),
  constraint idempotency_record_fingerprint_nonblank check (btrim(request_fingerprint) <> ''),
  constraint idempotency_record_state_nonblank check (btrim(execution_state) <> ''),
  constraint idempotency_record_result_pair
    check (
      (result_type is null and result_identity is null)
      or
      (result_type is not null and btrim(result_type) <> '' and result_identity is not null and btrim(result_identity) <> '')
    ),
  constraint idempotency_record_completed_after_created
    check (completed_at is null or completed_at >= created_at),
  constraint idempotency_record_expires_after_created
    check (expires_at is null or expires_at > created_at),
  constraint idempotency_record_household_identity_uq
    unique nulls not distinct (household_id, idempotency_record_id)
);

create unique index idempotency_record_household_key_uq
  on fridge.idempotency_record (
    household_id,
    principal_identity,
    operation_code,
    operation_version,
    client_key
  )
  where target_scope = 'HOUSEHOLD';

create unique index idempotency_record_global_key_uq
  on fridge.idempotency_record (
    principal_identity,
    operation_code,
    operation_version,
    client_key
  )
  where target_scope = 'GLOBAL';

comment on table fridge.idempotency_record is
  'Durable command idempotency state. Reuse of a key with a different canonical fingerprint is a conflict handled by the governed mutation routine, never a second execution.';

create table fridge.outbox_record (
  outbox_record_id uuid primary key,
  household_id uuid,
  event_contract_code text not null,
  event_contract_version text not null,
  aggregate_type text not null,
  aggregate_identity text not null,
  payload_json jsonb,
  payload_reference text,
  publication_state text not null,
  available_at timestamptz not null,
  published_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  causation_identity text,
  correlation_identity text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint outbox_record_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint outbox_record_contract_nonblank
    check (btrim(event_contract_code) <> '' and btrim(event_contract_version) <> ''),
  constraint outbox_record_aggregate_nonblank
    check (btrim(aggregate_type) <> '' and btrim(aggregate_identity) <> ''),
  constraint outbox_record_payload_xor
    check ((payload_json is not null)::integer + (payload_reference is not null)::integer = 1),
  constraint outbox_record_payload_reference_nonblank
    check (payload_reference is null or btrim(payload_reference) <> ''),
  constraint outbox_record_state_nonblank check (btrim(publication_state) <> ''),
  constraint outbox_record_attempt_count_nonnegative check (attempt_count >= 0),
  constraint outbox_record_published_after_available
    check (published_at is null or published_at >= available_at),
  constraint outbox_record_last_error_nonblank
    check (last_error_code is null or btrim(last_error_code) <> ''),
  constraint outbox_record_causation_nonblank
    check (causation_identity is null or btrim(causation_identity) <> ''),
  constraint outbox_record_correlation_nonblank
    check (correlation_identity is null or btrim(correlation_identity) <> ''),
  constraint outbox_record_household_identity_uq
    unique nulls not distinct (household_id, outbox_record_id)
);

comment on table fridge.outbox_record is
  'Durable same-transaction event publication responsibility. Business mutation plus OutboxRecord commit atomically; delivery/retry state never becomes domain truth.';

create index outbox_record_dispatch_idx
  on fridge.outbox_record (publication_state, available_at, outbox_record_id);
create index outbox_record_household_aggregate_idx
  on fridge.outbox_record (household_id, aggregate_type, aggregate_identity, recorded_at);

commit;
