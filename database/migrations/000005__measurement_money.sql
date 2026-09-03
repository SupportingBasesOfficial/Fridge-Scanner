-- FridgeScanner DB-02
-- 000005__measurement_money.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create table fridge.measurement_dimension (
  dimension_code text primary key,
  display_name text not null,
  description text,
  lifecycle_status text not null default 'ACTIVE',
  constraint measurement_dimension_code_nonblank check (btrim(dimension_code) <> ''),
  constraint measurement_dimension_name_nonblank check (btrim(display_name) <> ''),
  constraint measurement_dimension_status_nonblank check (btrim(lifecycle_status) <> '')
);

create table fridge.measurement_unit (
  measurement_unit_id uuid primary key,
  unit_code text not null unique,
  dimension_code text not null,
  symbol text,
  display_name text not null,
  lifecycle_status text not null default 'ACTIVE',
  constraint measurement_unit_dimension_fk
    foreign key (dimension_code)
    references fridge.measurement_dimension (dimension_code)
    on update restrict on delete restrict,
  constraint measurement_unit_code_nonblank check (btrim(unit_code) <> ''),
  constraint measurement_unit_symbol_nonblank check (symbol is null or symbol <> ''),
  constraint measurement_unit_name_nonblank check (btrim(display_name) <> ''),
  constraint measurement_unit_status_nonblank check (btrim(lifecycle_status) <> '')
);

create type fridge.measurement_conversion_kind as enum (
  'EXACT_FACTOR',
  'CONTEXTUAL_FACTOR'
);

create table fridge.measurement_conversion_rule (
  measurement_conversion_rule_id uuid primary key,
  rule_family_id uuid not null,
  version_no integer not null,
  conversion_kind fridge.measurement_conversion_kind not null,
  source_unit_id uuid not null,
  target_unit_id uuid not null,
  factor_num numeric,
  factor_den numeric,
  context_contract_code text,
  context_contract_version text,
  effective_from timestamptz not null,
  effective_to timestamptz,
  lifecycle_status text not null default 'ACTIVE',
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint measurement_conversion_rule_source_unit_fk
    foreign key (source_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint measurement_conversion_rule_target_unit_fk
    foreign key (target_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint measurement_conversion_rule_version_positive check (version_no > 0),
  constraint measurement_conversion_rule_interval_valid
    check (effective_to is null or effective_to > effective_from),
  constraint measurement_conversion_rule_status_nonblank
    check (btrim(lifecycle_status) <> ''),
  constraint measurement_conversion_rule_kind_contract
    check (
      (
        conversion_kind = 'EXACT_FACTOR'
        and factor_num is not null
        and factor_den is not null
        and factor_num > 0
        and fridge_internal.assert_normalized_rational(factor_num, factor_den)
        and context_contract_code is null
        and context_contract_version is null
      )
      or
      (
        conversion_kind = 'CONTEXTUAL_FACTOR'
        and factor_num is null
        and factor_den is null
        and context_contract_code is not null
        and btrim(context_contract_code) <> ''
        and context_contract_version is not null
        and btrim(context_contract_version) <> ''
      )
    ),
  constraint measurement_conversion_rule_family_version_uq
    unique (rule_family_id, version_no),
  constraint measurement_conversion_rule_endpoint_identity_uq
    unique (measurement_conversion_rule_id, source_unit_id, target_unit_id)
);

comment on table fridge.measurement_conversion_rule is
  'Versioned permission/profile for unit conversion. EXACT_FACTOR stores its canonical factor. CONTEXTUAL_FACTOR identifies a typed/versioned context contract; every committed use still stores the exact factor selected in MeasurementConversionEvidence.';

create index measurement_conversion_rule_lookup_idx
  on fridge.measurement_conversion_rule (
    source_unit_id,
    target_unit_id,
    effective_from desc,
    measurement_conversion_rule_id
  );

create table fridge.measurement_conversion_evidence (
  measurement_conversion_evidence_id uuid primary key,
  household_id uuid,
  measurement_conversion_rule_id uuid not null,
  source_unit_id uuid not null,
  source_quantity_num numeric not null,
  source_quantity_den numeric not null,
  target_unit_id uuid not null,
  target_quantity_num numeric not null,
  target_quantity_den numeric not null,
  applied_factor_num numeric not null,
  applied_factor_den numeric not null,
  evaluation_anchor timestamptz not null,
  context_contract_code text,
  context_contract_version text,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint measurement_conversion_evidence_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint measurement_conversion_evidence_rule_endpoint_fk
    foreign key (
      measurement_conversion_rule_id,
      source_unit_id,
      target_unit_id
    )
    references fridge.measurement_conversion_rule (
      measurement_conversion_rule_id,
      source_unit_id,
      target_unit_id
    )
    on update restrict on delete restrict,
  constraint measurement_conversion_evidence_source_normalized
    check (fridge_internal.assert_normalized_rational(source_quantity_num, source_quantity_den)),
  constraint measurement_conversion_evidence_target_normalized
    check (fridge_internal.assert_normalized_rational(target_quantity_num, target_quantity_den)),
  constraint measurement_conversion_evidence_factor_normalized
    check (
      applied_factor_num > 0
      and fridge_internal.assert_normalized_rational(applied_factor_num, applied_factor_den)
    ),
  constraint measurement_conversion_evidence_exact_result
    check (
      target_quantity_num * source_quantity_den * applied_factor_den
      = source_quantity_num * applied_factor_num * target_quantity_den
    ),
  constraint measurement_conversion_evidence_context_pair
    check (
      (context_contract_code is null and context_contract_version is null)
      or
      (
        context_contract_code is not null
        and btrim(context_contract_code) <> ''
        and context_contract_version is not null
        and btrim(context_contract_version) <> ''
      )
    )
);

comment on table fridge.measurement_conversion_evidence is
  'Immutable exact conversion decision. The committed target must equal source × applied factor in rational arithmetic; presentation rounding never participates.';

create index measurement_conversion_evidence_household_anchor_idx
  on fridge.measurement_conversion_evidence (household_id, evaluation_anchor desc)
  where household_id is not null;

create table fridge.currency (
  currency_code text primary key,
  display_name text not null,
  lifecycle_status text not null default 'ACTIVE',
  constraint currency_code_shape
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint currency_name_nonblank check (btrim(display_name) <> ''),
  constraint currency_status_nonblank check (btrim(lifecycle_status) <> '')
);

comment on table fridge.currency is
  'Governed currency identity. Authoritative monetary facts always reference an explicit currency.';

create table fridge.money_rounding_policy (
  money_rounding_policy_id uuid primary key,
  policy_family_id uuid not null,
  version_no integer not null,
  currency_code text not null,
  decimal_scale smallint not null,
  rounding_algorithm_code text not null,
  rounding_algorithm_version text not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  lifecycle_status text not null default 'ACTIVE',
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint money_rounding_policy_currency_fk
    foreign key (currency_code)
    references fridge.currency (currency_code)
    on update restrict on delete restrict,
  constraint money_rounding_policy_version_positive check (version_no > 0),
  constraint money_rounding_policy_scale_valid check (decimal_scale between 0 and 18),
  constraint money_rounding_policy_algorithm_nonblank
    check (
      btrim(rounding_algorithm_code) <> ''
      and btrim(rounding_algorithm_version) <> ''
    ),
  constraint money_rounding_policy_interval_valid
    check (effective_to is null or effective_to > effective_from),
  constraint money_rounding_policy_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint money_rounding_policy_family_version_uq unique (policy_family_id, version_no)
);

comment on table fridge.money_rounding_policy is
  'Versioned monetary-boundary rounding contract. Source money remains exact; this policy is referenced only where a governed monetary boundary requires rounding.';

commit;
