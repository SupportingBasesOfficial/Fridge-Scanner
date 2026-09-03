-- FridgeScanner DB-02
-- 000004__product_identifiers.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create type fridge.identifier_namespace_mode as enum ('GLOBAL', 'ISSUER_SCOPED');

create table fridge.product_identifier_normalization_rule (
  normalization_rule_id uuid primary key,
  scheme_code text not null,
  namespace_mode fridge.identifier_namespace_mode not null,
  issuer_namespace text,
  rule_version integer not null,
  normalization_algorithm_code text not null,
  normalization_algorithm_version text not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  lifecycle_status text not null default 'ACTIVE',
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint identifier_rule_scheme_nonblank check (btrim(scheme_code) <> ''),
  constraint identifier_rule_issuer_scope
    check (
      (namespace_mode = 'GLOBAL' and issuer_namespace is null)
      or
      (namespace_mode = 'ISSUER_SCOPED' and issuer_namespace is not null and btrim(issuer_namespace) <> '')
    ),
  constraint identifier_rule_version_positive check (rule_version > 0),
  constraint identifier_rule_algorithm_nonblank
    check (btrim(normalization_algorithm_code) <> '' and btrim(normalization_algorithm_version) <> ''),
  constraint identifier_rule_interval_valid check (effective_to is null or effective_to > effective_from),
  constraint identifier_rule_scope_version_uq
    unique (scheme_code, namespace_mode, issuer_namespace, rule_version)
);

comment on table fridge.product_identifier_normalization_rule is
  'Governed versioned normalization contract. Exact source and normalized values are still persisted on identifiers; algorithm identity/version is historical evidence, not deployment-current inference.';

create index identifier_rule_effective_idx
  on fridge.product_identifier_normalization_rule (
    scheme_code,
    namespace_mode,
    issuer_namespace,
    effective_from desc,
    normalization_rule_id
  );

create table fridge.product_identifier (
  product_identifier_id uuid primary key,
  product_id uuid not null,
  scheme_code text not null,
  issuer_namespace text,
  source_value text not null,
  normalized_value text not null,
  normalization_rule_id uuid not null,
  lifecycle_status text not null default 'ACTIVE',
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  constraint product_identifier_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint product_identifier_rule_fk
    foreign key (normalization_rule_id)
    references fridge.product_identifier_normalization_rule (normalization_rule_id)
    on update restrict on delete restrict,
  constraint product_identifier_scheme_nonblank check (btrim(scheme_code) <> ''),
  constraint product_identifier_source_nonblank check (source_value <> ''),
  constraint product_identifier_normalized_nonblank check (normalized_value <> ''),
  constraint product_identifier_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint product_identifier_issuer_nonblank
    check (issuer_namespace is null or btrim(issuer_namespace) <> ''),
  constraint product_identifier_retired_after_recorded
    check (retired_at is null or retired_at >= recorded_at)
);

-- Global-namespace uniqueness. NULL issuer is intentional and is not included in the key.
create unique index product_identifier_global_namespace_uq
  on fridge.product_identifier (
    scheme_code,
    normalization_rule_id,
    normalized_value
  )
  where issuer_namespace is null and retired_at is null;

-- Issuer-scoped uniqueness.
create unique index product_identifier_issuer_namespace_uq
  on fridge.product_identifier (
    scheme_code,
    issuer_namespace,
    normalization_rule_id,
    normalized_value
  )
  where issuer_namespace is not null and retired_at is null;

create index product_identifier_product_idx
  on fridge.product_identifier (product_id, lifecycle_status, product_identifier_id);

comment on table fridge.product_identifier is
  'Canonical Product identifier. Namespace-mode/rule consistency and the rule that globally namespaced identifiers belong only to GLOBAL Products are enforced by the governed identifier mutation routine/postcondition guard.';

create table fridge.staged_identifier_claim (
  staged_identifier_claim_id uuid primary key,
  household_id uuid not null,
  candidate_product_id uuid,
  scheme_code text not null,
  issuer_namespace text,
  source_value text not null,
  normalized_value text,
  normalization_rule_id uuid,
  lifecycle_status text not null default 'STAGED',
  provenance text,
  observed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  resolved_product_identifier_id uuid,
  resolved_at timestamptz,
  constraint staged_identifier_claim_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint staged_identifier_claim_private_candidate_fk
    foreign key (household_id, candidate_product_id)
    references fridge.product (owner_household_id, product_id)
    on update restrict on delete restrict,
  constraint staged_identifier_claim_rule_fk
    foreign key (normalization_rule_id)
    references fridge.product_identifier_normalization_rule (normalization_rule_id)
    on update restrict on delete restrict,
  constraint staged_identifier_claim_resolution_fk
    foreign key (resolved_product_identifier_id)
    references fridge.product_identifier (product_identifier_id)
    on update restrict on delete restrict,
  constraint staged_identifier_claim_scheme_nonblank check (btrim(scheme_code) <> ''),
  constraint staged_identifier_claim_source_nonblank check (source_value <> ''),
  constraint staged_identifier_claim_issuer_nonblank
    check (issuer_namespace is null or btrim(issuer_namespace) <> ''),
  constraint staged_identifier_claim_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint staged_identifier_claim_resolution_pair
    check (
      (resolved_product_identifier_id is null and resolved_at is null)
      or
      (resolved_product_identifier_id is not null and resolved_at is not null)
    )
);

create index staged_identifier_claim_household_lookup_idx
  on fridge.staged_identifier_claim (
    household_id,
    scheme_code,
    issuer_namespace,
    normalized_value,
    lifecycle_status
  );

comment on table fridge.staged_identifier_claim is
  'Household-scoped unresolved identifier evidence. It is physically separate from canonical ProductIdentifier and therefore cannot reserve or consume canonical global uniqueness.';

commit;
