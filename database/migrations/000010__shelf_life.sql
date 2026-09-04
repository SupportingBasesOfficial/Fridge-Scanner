-- FridgeScanner DB-02
-- 000010__shelf_life.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create type fridge.expiration_precision as enum ('DATE', 'INSTANT');
create type fridge.shelf_life_temporal_basis as enum ('ELAPSED', 'LOCAL_CALENDAR');
create type fridge.shelf_life_duration_unit as enum (
  'SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'
);

create table fridge.source_expiration_fact (
  source_expiration_fact_id uuid primary key,
  household_id uuid not null,
  stock_item_id uuid not null,
  product_id uuid not null,
  batch_id uuid,
  receipt_item_id uuid,
  expiration_precision fridge.expiration_precision not null,
  source_expiration_date date,
  source_expiration_instant timestamptz,
  source_timezone_context text,
  household_timezone_version_id uuid,
  observed_at timestamptz not null,
  provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint source_expiration_stock_product_fk
    foreign key (household_id, stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint source_expiration_batch_product_fk
    foreign key (batch_id, product_id)
    references fridge.batch (batch_id, product_id)
    on update restrict on delete restrict,
  constraint source_expiration_receipt_product_fk
    foreign key (household_id, receipt_item_id, product_id)
    references fridge.receipt_item (household_id, receipt_item_id, product_id)
    on update restrict on delete restrict,
  constraint source_expiration_timezone_same_household_fk
    foreign key (household_id, household_timezone_version_id)
    references fridge.household_timezone_version (
      household_id,
      household_timezone_version_id
    )
    on update restrict on delete restrict,
  constraint source_expiration_value_shape
    check (
      (
        expiration_precision = 'DATE'
        and source_expiration_date is not null
        and source_expiration_instant is null
      )
      or
      (
        expiration_precision = 'INSTANT'
        and source_expiration_date is null
        and source_expiration_instant is not null
      )
    ),
  constraint source_expiration_timezone_context_nonblank
    check (source_timezone_context is null or btrim(source_timezone_context) <> ''),
  constraint source_expiration_provenance_nonblank
    check (btrim(provenance) <> ''),
  constraint source_expiration_household_identity_uq
    unique (household_id, source_expiration_fact_id),
  constraint source_expiration_household_stock_identity_uq
    unique (household_id, source_expiration_fact_id, stock_item_id)
);

comment on table fridge.source_expiration_fact is
  'Immutable source expiration evidence preserving original DATE versus INSTANT precision, source temporal context and exact Household timezone version when Household timezone semantics participated. Batch/Receipt provenance never becomes a second expiration authority.';

create index source_expiration_stock_idx
  on fridge.source_expiration_fact (household_id, stock_item_id, observed_at, source_expiration_fact_id);

create table fridge.food_lifecycle_event (
  food_lifecycle_event_id uuid primary key,
  household_id uuid not null,
  stock_item_id uuid not null,
  product_id uuid not null,
  event_kind text not null,
  occurred_at timestamptz not null,
  ordering_domain text,
  ordering_token text,
  provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint food_lifecycle_event_stock_product_fk
    foreign key (household_id, stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint food_lifecycle_event_kind_nonblank check (btrim(event_kind) <> ''),
  constraint food_lifecycle_event_ordering_pair
    check (
      (ordering_domain is null and ordering_token is null)
      or
      (
        ordering_domain is not null
        and btrim(ordering_domain) <> ''
        and ordering_token is not null
        and btrim(ordering_token) <> ''
      )
    ),
  constraint food_lifecycle_event_provenance_nonblank check (btrim(provenance) <> ''),
  constraint food_lifecycle_event_household_identity_uq
    unique (household_id, food_lifecycle_event_id),
  constraint food_lifecycle_event_household_stock_identity_uq
    unique (household_id, food_lifecycle_event_id, stock_item_id)
);

comment on table fridge.food_lifecycle_event is
  'Immutable lifecycle event anchored to the originating StockItem/Product and authoritative occurrence context. Later redistribution inherits the event by lineage evidence rather than rewriting its subject.';

create index food_lifecycle_event_stock_time_idx
  on fridge.food_lifecycle_event (household_id, stock_item_id, occurred_at, food_lifecycle_event_id);

create table fridge.shelf_life_rule (
  shelf_life_rule_id uuid primary key,
  rule_family_id uuid not null,
  version_no integer not null,
  catalog_scope fridge.catalog_scope not null,
  owner_household_id uuid,
  target_product_id uuid,
  target_ingredient_concept_id uuid,
  trigger_code text not null,
  deadline_group_code text not null,
  duration_num numeric not null,
  duration_den numeric not null,
  duration_unit fridge.shelf_life_duration_unit not null,
  temporal_basis fridge.shelf_life_temporal_basis not null,
  endpoint_semantics text not null,
  timezone_selection_code text,
  effective_from timestamptz not null,
  effective_to timestamptz,
  lifecycle_status text not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint shelf_life_rule_owner_fk
    foreign key (owner_household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint shelf_life_rule_product_fk
    foreign key (target_product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint shelf_life_rule_concept_fk
    foreign key (target_ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint shelf_life_rule_scope_owner_xor
    check (
      (catalog_scope = 'GLOBAL' and owner_household_id is null)
      or
      (catalog_scope = 'HOUSEHOLD' and owner_household_id is not null)
    ),
  constraint shelf_life_rule_target_xor
    check ((target_product_id is not null) <> (target_ingredient_concept_id is not null)),
  constraint shelf_life_rule_version_positive check (version_no > 0),
  constraint shelf_life_rule_trigger_nonblank check (btrim(trigger_code) <> ''),
  constraint shelf_life_rule_deadline_group_nonblank check (btrim(deadline_group_code) <> ''),
  constraint shelf_life_rule_duration_positive_normalized
    check (
      duration_num > 0
      and fridge_internal.assert_normalized_rational(duration_num, duration_den)
    ),
  constraint shelf_life_rule_temporal_contract
    check (
      (
        temporal_basis = 'ELAPSED'
        and duration_unit in ('SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK')
      )
      or
      (
        temporal_basis = 'LOCAL_CALENDAR'
        and duration_unit in ('DAY', 'WEEK', 'MONTH', 'YEAR')
        and duration_den = 1
        and fridge_internal.is_integral_numeric(duration_num)
      )
    ),
  constraint shelf_life_rule_endpoint_nonblank check (btrim(endpoint_semantics) <> ''),
  constraint shelf_life_rule_timezone_selection_nonblank
    check (timezone_selection_code is null or btrim(timezone_selection_code) <> ''),
  constraint shelf_life_rule_interval_valid
    check (effective_to is null or effective_to > effective_from),
  constraint shelf_life_rule_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint shelf_life_rule_family_version_uq unique (rule_family_id, version_no)
);

comment on table fridge.shelf_life_rule is
  'Versioned governed shelf-life rule with one typed Product-or-IngredientConcept target and exact duration semantics. LOCAL_CALENDAR permits integral calendar DAY/WEEK/MONTH/YEAR only; ELAPSED forbids MONTH/YEAR and keeps exact rational duration.';

create index shelf_life_rule_target_product_idx
  on fridge.shelf_life_rule (target_product_id, effective_from desc, shelf_life_rule_id)
  where target_product_id is not null;
create index shelf_life_rule_target_concept_idx
  on fridge.shelf_life_rule (target_ingredient_concept_id, effective_from desc, shelf_life_rule_id)
  where target_ingredient_concept_id is not null;

create table fridge.shelf_life_rule_activation (
  shelf_life_rule_activation_id uuid primary key,
  household_id uuid not null,
  shelf_life_rule_id uuid not null,
  stock_item_id uuid not null,
  product_id uuid not null,
  activation_anchor timestamptz not null,
  household_timezone_version_id uuid,
  food_lifecycle_event_id uuid,
  compatibility_evidence_id uuid,
  evaluation_context_version text not null,
  provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint shelf_life_activation_rule_fk
    foreign key (shelf_life_rule_id)
    references fridge.shelf_life_rule (shelf_life_rule_id)
    on update restrict on delete restrict,
  constraint shelf_life_activation_stock_product_fk
    foreign key (household_id, stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint shelf_life_activation_timezone_same_household_fk
    foreign key (household_id, household_timezone_version_id)
    references fridge.household_timezone_version (
      household_id,
      household_timezone_version_id
    )
    on update restrict on delete restrict,
  constraint shelf_life_activation_event_same_stock_fk
    foreign key (household_id, food_lifecycle_event_id, stock_item_id)
    references fridge.food_lifecycle_event (
      household_id,
      food_lifecycle_event_id,
      stock_item_id
    )
    on update restrict on delete restrict,
  constraint shelf_life_activation_compatibility_fk
    foreign key (compatibility_evidence_id)
    references fridge.compatibility_decision_evidence (compatibility_evidence_id)
    on update restrict on delete restrict,
  constraint shelf_life_activation_context_version_nonblank
    check (btrim(evaluation_context_version) <> ''),
  constraint shelf_life_activation_provenance_nonblank
    check (btrim(provenance) <> ''),
  constraint shelf_life_activation_household_identity_uq
    unique (household_id, shelf_life_rule_activation_id),
  constraint shelf_life_activation_household_stock_identity_uq
    unique (household_id, shelf_life_rule_activation_id, stock_item_id)
);

comment on table fridge.shelf_life_rule_activation is
  'Immutable historical rule evaluation pinned to exact rule version, originating StockItem/Product, activation anchor, timezone version when used, optional lifecycle event and compatibility evidence. Rule applicability/scope is validated by the governed activation boundary.';

create index shelf_life_activation_stock_idx
  on fridge.shelf_life_rule_activation (household_id, stock_item_id, activation_anchor, shelf_life_rule_activation_id);

create table fridge.effective_expiration (
  effective_expiration_id uuid primary key,
  household_id uuid not null,
  stock_item_id uuid not null,
  product_id uuid not null,
  derivation_contract_code text not null,
  derivation_contract_version text not null,
  expiration_precision fridge.expiration_precision not null,
  effective_expiration_date date,
  effective_expiration_instant timestamptz,
  projection_status text not null,
  is_current boolean not null,
  recomputation_provenance text not null,
  derived_at timestamptz not null default clock_timestamp(),
  constraint effective_expiration_stock_product_fk
    foreign key (household_id, stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint effective_expiration_contract_code_nonblank
    check (btrim(derivation_contract_code) <> ''),
  constraint effective_expiration_contract_version_nonblank
    check (btrim(derivation_contract_version) <> ''),
  constraint effective_expiration_value_shape
    check (
      (
        expiration_precision = 'DATE'
        and effective_expiration_date is not null
        and effective_expiration_instant is null
      )
      or
      (
        expiration_precision = 'INSTANT'
        and effective_expiration_date is null
        and effective_expiration_instant is not null
      )
    ),
  constraint effective_expiration_status_nonblank check (btrim(projection_status) <> ''),
  constraint effective_expiration_provenance_nonblank check (btrim(recomputation_provenance) <> ''),
  constraint effective_expiration_household_identity_uq
    unique (household_id, effective_expiration_id),
  constraint effective_expiration_household_stock_identity_uq
    unique (household_id, effective_expiration_id, stock_item_id)
);

comment on table fridge.effective_expiration is
  'Derived rebuildable expiration projection only. Authoritative truth remains SourceExpirationFact, lifecycle evidence and ShelfLifeRuleActivation. Current uniqueness is scoped by StockItem plus derivation contract version.';

create unique index effective_expiration_one_current_contract_uq
  on fridge.effective_expiration (
    household_id,
    stock_item_id,
    derivation_contract_code,
    derivation_contract_version
  )
  where is_current;

create index effective_expiration_stock_idx
  on fridge.effective_expiration (household_id, stock_item_id, is_current, derived_at desc);

create table fridge.effective_expiration_candidate (
  effective_expiration_candidate_id uuid primary key,
  household_id uuid not null,
  effective_expiration_id uuid not null,
  stock_item_id uuid not null,
  source_expiration_fact_id uuid,
  shelf_life_rule_activation_id uuid,
  expiration_precision fridge.expiration_precision not null,
  candidate_expiration_date date,
  candidate_expiration_instant timestamptz,
  comparison_timezone_version_id uuid,
  candidate_outcome text not null,
  outcome_reason text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint effective_expiration_candidate_projection_stock_fk
    foreign key (household_id, effective_expiration_id, stock_item_id)
    references fridge.effective_expiration (
      household_id,
      effective_expiration_id,
      stock_item_id
    )
    on update restrict on delete restrict,
  constraint effective_expiration_candidate_source_fact_stock_fk
    foreign key (household_id, source_expiration_fact_id, stock_item_id)
    references fridge.source_expiration_fact (
      household_id,
      source_expiration_fact_id,
      stock_item_id
    )
    on update restrict on delete restrict,
  constraint effective_expiration_candidate_activation_stock_fk
    foreign key (household_id, shelf_life_rule_activation_id, stock_item_id)
    references fridge.shelf_life_rule_activation (
      household_id,
      shelf_life_rule_activation_id,
      stock_item_id
    )
    on update restrict on delete restrict,
  constraint effective_expiration_candidate_timezone_fk
    foreign key (household_id, comparison_timezone_version_id)
    references fridge.household_timezone_version (
      household_id,
      household_timezone_version_id
    )
    on update restrict on delete restrict,
  constraint effective_expiration_candidate_source_xor
    check ((source_expiration_fact_id is not null) <> (shelf_life_rule_activation_id is not null)),
  constraint effective_expiration_candidate_value_shape
    check (
      (
        expiration_precision = 'DATE'
        and candidate_expiration_date is not null
        and candidate_expiration_instant is null
      )
      or
      (
        expiration_precision = 'INSTANT'
        and candidate_expiration_date is null
        and candidate_expiration_instant is not null
      )
    ),
  constraint effective_expiration_candidate_outcome_nonblank
    check (btrim(candidate_outcome) <> ''),
  constraint effective_expiration_candidate_reason_nonblank
    check (btrim(outcome_reason) <> ''),
  constraint effective_expiration_candidate_household_identity_uq
    unique (household_id, effective_expiration_candidate_id)
);

comment on table fridge.effective_expiration_candidate is
  'Derived candidate with exactly one authoritative source: SourceExpirationFact or ShelfLifeRuleActivation. Projection/source share the same Household and originating StockItem structurally; earliest-applicable composition remains governed by the derivation routine.';

create index effective_expiration_candidate_projection_idx
  on fridge.effective_expiration_candidate (household_id, effective_expiration_id, effective_expiration_candidate_id);

create table fridge.quantity_lineage_shelf_life_fact (
  quantity_lineage_shelf_life_fact_id uuid primary key,
  household_id uuid not null,
  inventory_quantity_lineage_id uuid not null,
  source_expiration_fact_id uuid,
  food_lifecycle_event_id uuid,
  shelf_life_rule_activation_id uuid,
  provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint quantity_lineage_shelf_life_lineage_fk
    foreign key (household_id, inventory_quantity_lineage_id)
    references fridge.inventory_quantity_lineage (
      household_id,
      inventory_quantity_lineage_id
    )
    on update restrict on delete restrict,
  constraint quantity_lineage_shelf_life_source_fact_fk
    foreign key (household_id, source_expiration_fact_id)
    references fridge.source_expiration_fact (household_id, source_expiration_fact_id)
    on update restrict on delete restrict,
  constraint quantity_lineage_shelf_life_event_fk
    foreign key (household_id, food_lifecycle_event_id)
    references fridge.food_lifecycle_event (household_id, food_lifecycle_event_id)
    on update restrict on delete restrict,
  constraint quantity_lineage_shelf_life_activation_fk
    foreign key (household_id, shelf_life_rule_activation_id)
    references fridge.shelf_life_rule_activation (household_id, shelf_life_rule_activation_id)
    on update restrict on delete restrict,
  constraint quantity_lineage_shelf_life_source_exact_one
    check (
      num_nonnulls(
        source_expiration_fact_id,
        food_lifecycle_event_id,
        shelf_life_rule_activation_id
      ) = 1
    ),
  constraint quantity_lineage_shelf_life_provenance_nonblank
    check (btrim(provenance) <> ''),
  constraint quantity_lineage_shelf_life_no_duplicate_source_uq
    unique nulls not distinct (
      inventory_quantity_lineage_id,
      source_expiration_fact_id,
      food_lifecycle_event_id,
      shelf_life_rule_activation_id
    ),
  constraint quantity_lineage_shelf_life_household_identity_uq
    unique (household_id, quantity_lineage_shelf_life_fact_id)
);

comment on table fridge.quantity_lineage_shelf_life_fact is
  'Immutable inherited shelf-life/lifecycle evidence attached to one exact quantity-lineage edge. The governed split/transfer/merge routine must copy every applicable source fact so lineage cannot reset expiration state.';

create index quantity_lineage_shelf_life_lineage_idx
  on fridge.quantity_lineage_shelf_life_fact (household_id, inventory_quantity_lineage_id);

commit;
