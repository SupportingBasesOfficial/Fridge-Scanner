-- FridgeScanner DB-02
-- 000013__integrations_imports.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create type fridge.integration_scope as enum ('GLOBAL', 'HOUSEHOLD');

create table fridge.integration (
  integration_id uuid primary key,
  integration_scope fridge.integration_scope not null,
  household_id uuid,
  provider_code text not null,
  provider_account_ref text,
  credential_ref text,
  lifecycle_status text not null,
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  provenance text,
  constraint integration_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint integration_scope_household_shape
    check (
      (integration_scope = 'GLOBAL' and household_id is null)
      or
      (integration_scope = 'HOUSEHOLD' and household_id is not null)
    ),
  constraint integration_provider_nonblank check (btrim(provider_code) <> ''),
  constraint integration_provider_account_nonblank
    check (provider_account_ref is null or btrim(provider_account_ref) <> ''),
  constraint integration_credential_ref_nonblank
    check (credential_ref is null or btrim(credential_ref) <> ''),
  constraint integration_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint integration_retired_after_created
    check (retired_at is null or retired_at >= created_at),
  constraint integration_household_identity_uq
    unique nulls not distinct (household_id, integration_id),
  constraint integration_scope_identity_uq
    unique (integration_id, integration_scope)
);

comment on table fridge.integration is
  'Provider/account binding and lifecycle. credential_ref is an opaque secure-store reference only; provider identity and credentials never grant Household authority.';

create unique index integration_household_provider_account_uq
  on fridge.integration (
    household_id,
    provider_code,
    provider_account_ref
  )
  where integration_scope = 'HOUSEHOLD' and provider_account_ref is not null;

create unique index integration_global_provider_account_uq
  on fridge.integration (
    provider_code,
    provider_account_ref
  )
  where integration_scope = 'GLOBAL' and provider_account_ref is not null;

create table fridge.import_run (
  import_run_id uuid primary key,
  integration_id uuid not null,
  household_id uuid,
  source_run_identity text not null,
  lifecycle_status text not null,
  requested_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  source_anchor text,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint import_run_integration_fk
    foreign key (integration_id)
    references fridge.integration (integration_id)
    on update restrict on delete restrict,
  constraint import_run_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint import_run_source_identity_nonblank
    check (btrim(source_run_identity) <> ''),
  constraint import_run_status_nonblank
    check (btrim(lifecycle_status) <> ''),
  constraint import_run_source_anchor_nonblank
    check (source_anchor is null or btrim(source_anchor) <> ''),
  constraint import_run_started_after_requested
    check (started_at is null or started_at >= requested_at),
  constraint import_run_completed_after_requested
    check (completed_at is null or completed_at >= requested_at),
  constraint import_run_completed_after_started
    check (completed_at is null or started_at is null or completed_at >= started_at),
  constraint import_run_household_identity_uq
    unique nulls not distinct (household_id, import_run_id),
  constraint import_run_integration_household_identity_uq
    unique nulls not distinct (integration_id, household_id, import_run_id),
  constraint import_run_source_identity_uq
    unique nulls not distinct (integration_id, household_id, source_run_identity)
);

comment on table fridge.import_run is
  'Durable import execution provenance. Household is required by the governed mutation boundary for inventory-affecting runs and, when present, must agree with every Household-scoped materialized fact.';

create index import_run_integration_requested_idx
  on fridge.import_run (integration_id, requested_at desc, import_run_id);

create type fridge.external_reference_scope as enum ('GLOBAL', 'HOUSEHOLD');

create table fridge.external_reference (
  external_reference_id uuid primary key,
  external_reference_scope fridge.external_reference_scope not null,
  integration_id uuid not null,
  import_run_id uuid,
  household_id uuid,
  provider_namespace text not null,
  provider_entity_type text not null,
  provider_entity_value text not null,
  normalization_status text not null,
  reconciliation_status text not null,
  normalized_value text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  normalization_provenance text,
  reconciliation_provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint external_reference_integration_fk
    foreign key (integration_id)
    references fridge.integration (integration_id)
    on update restrict on delete restrict,
  constraint external_reference_import_run_context_fk
    foreign key (integration_id, household_id, import_run_id)
    references fridge.import_run (integration_id, household_id, import_run_id)
    on update restrict on delete restrict,
  constraint external_reference_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint external_reference_scope_household_shape
    check (
      (external_reference_scope = 'GLOBAL' and household_id is null)
      or
      (external_reference_scope = 'HOUSEHOLD' and household_id is not null)
    ),
  constraint external_reference_namespace_nonblank
    check (btrim(provider_namespace) <> ''),
  constraint external_reference_type_nonblank
    check (btrim(provider_entity_type) <> ''),
  constraint external_reference_value_nonblank
    check (btrim(provider_entity_value) <> ''),
  constraint external_reference_normalization_status_nonblank
    check (btrim(normalization_status) <> ''),
  constraint external_reference_reconciliation_status_nonblank
    check (btrim(reconciliation_status) <> ''),
  constraint external_reference_normalized_value_nonblank
    check (normalized_value is null or btrim(normalized_value) <> ''),
  constraint external_reference_seen_order
    check (last_seen_at >= first_seen_at),
  constraint external_reference_household_identity_uq
    unique nulls not distinct (household_id, external_reference_id),
  constraint external_reference_integration_identity_uq
    unique (integration_id, external_reference_id)
);

comment on table fridge.external_reference is
  'Provider-side identity/provenance only. No generic target_type/target_id exists; durable links to canonical business facts must be introduced by typed domain-specific provenance relations.';

create unique index external_reference_household_provider_identity_uq
  on fridge.external_reference (
    household_id,
    integration_id,
    provider_namespace,
    provider_entity_type,
    provider_entity_value
  )
  where external_reference_scope = 'HOUSEHOLD';

create unique index external_reference_global_provider_identity_uq
  on fridge.external_reference (
    integration_id,
    provider_namespace,
    provider_entity_type,
    provider_entity_value
  )
  where external_reference_scope = 'GLOBAL';

create index external_reference_import_run_idx
  on fridge.external_reference (import_run_id, external_reference_id)
  where import_run_id is not null;

commit;
