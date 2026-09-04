-- FridgeScanner DB-02
-- 000003__storage_catalog.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create type fridge.catalog_scope as enum ('GLOBAL', 'HOUSEHOLD');

create table fridge.storage_location_kind (
  kind_code text primary key,
  display_name text not null,
  description text,
  lifecycle_status text not null default 'ACTIVE',
  constraint storage_location_kind_code_nonblank check (btrim(kind_code) <> ''),
  constraint storage_location_kind_name_nonblank check (btrim(display_name) <> ''),
  constraint storage_location_kind_status_nonblank check (btrim(lifecycle_status) <> '')
);

create table fridge.compartment_kind (
  kind_code text primary key,
  display_name text not null,
  description text,
  lifecycle_status text not null default 'ACTIVE',
  constraint compartment_kind_code_nonblank check (btrim(kind_code) <> ''),
  constraint compartment_kind_name_nonblank check (btrim(display_name) <> ''),
  constraint compartment_kind_status_nonblank check (btrim(lifecycle_status) <> '')
);

create table fridge.storage_location (
  storage_location_id uuid primary key,
  household_id uuid not null,
  kind_code text not null,
  display_name text not null,
  lifecycle_status text not null default 'ACTIVE',
  sort_order integer,
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  constraint storage_location_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint storage_location_kind_fk
    foreign key (kind_code)
    references fridge.storage_location_kind (kind_code)
    on update restrict on delete restrict,
  constraint storage_location_name_nonblank check (btrim(display_name) <> ''),
  constraint storage_location_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint storage_location_retired_after_created
    check (retired_at is null or retired_at >= created_at),
  constraint storage_location_household_identity_uq
    unique (household_id, storage_location_id)
);

create index storage_location_household_status_idx
  on fridge.storage_location (household_id, lifecycle_status, sort_order, storage_location_id);

create table fridge.compartment (
  compartment_id uuid primary key,
  household_id uuid not null,
  storage_location_id uuid not null,
  kind_code text,
  display_name text not null,
  sort_order integer,
  lifecycle_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  constraint compartment_storage_same_household_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint compartment_kind_fk
    foreign key (kind_code)
    references fridge.compartment_kind (kind_code)
    on update restrict on delete restrict,
  constraint compartment_name_nonblank check (btrim(display_name) <> ''),
  constraint compartment_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint compartment_retired_after_created
    check (retired_at is null or retired_at >= created_at),
  constraint compartment_household_identity_uq
    unique (household_id, compartment_id),
  constraint compartment_household_location_identity_uq
    unique (household_id, storage_location_id, compartment_id)
);

create index compartment_household_location_idx
  on fridge.compartment (household_id, storage_location_id, sort_order, compartment_id);

create table fridge.brand (
  brand_id uuid primary key,
  canonical_name text not null,
  lifecycle_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  constraint brand_name_nonblank check (btrim(canonical_name) <> ''),
  constraint brand_status_nonblank check (btrim(lifecycle_status) <> '')
);

create table fridge.manufacturer (
  manufacturer_id uuid primary key,
  canonical_name text not null,
  lifecycle_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  constraint manufacturer_name_nonblank check (btrim(canonical_name) <> ''),
  constraint manufacturer_status_nonblank check (btrim(lifecycle_status) <> '')
);

create table fridge.product_category (
  product_category_id uuid primary key,
  parent_product_category_id uuid,
  canonical_name text not null,
  lifecycle_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  constraint product_category_parent_fk
    foreign key (parent_product_category_id)
    references fridge.product_category (product_category_id)
    on update restrict on delete restrict,
  constraint product_category_not_self_parent
    check (parent_product_category_id is null or parent_product_category_id <> product_category_id),
  constraint product_category_name_nonblank check (btrim(canonical_name) <> ''),
  constraint product_category_status_nonblank check (btrim(lifecycle_status) <> '')
);

create index product_category_parent_idx
  on fridge.product_category (parent_product_category_id);

comment on table fridge.product_category is
  'Governed product classification hierarchy. Acyclicity beyond direct self-parent is enforced by the governed category mutation boundary.';

create table fridge.ingredient_concept (
  ingredient_concept_id uuid primary key,
  catalog_scope fridge.catalog_scope not null,
  owner_household_id uuid,
  canonical_name text not null,
  lifecycle_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  constraint ingredient_concept_owner_fk
    foreign key (owner_household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint ingredient_concept_scope_owner_xor
    check (
      (catalog_scope = 'GLOBAL' and owner_household_id is null)
      or
      (catalog_scope = 'HOUSEHOLD' and owner_household_id is not null)
    ),
  constraint ingredient_concept_name_nonblank check (btrim(canonical_name) <> ''),
  constraint ingredient_concept_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint ingredient_concept_owner_identity_uq
    unique (owner_household_id, ingredient_concept_id)
);

create index ingredient_concept_household_scope_idx
  on fridge.ingredient_concept (owner_household_id, lifecycle_status, ingredient_concept_id)
  where catalog_scope = 'HOUSEHOLD';

create table fridge.product (
  product_id uuid primary key,
  catalog_scope fridge.catalog_scope not null,
  owner_household_id uuid,
  canonical_name text not null,
  brand_id uuid,
  manufacturer_id uuid,
  product_category_id uuid,
  lifecycle_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  constraint product_owner_fk
    foreign key (owner_household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint product_brand_fk
    foreign key (brand_id)
    references fridge.brand (brand_id)
    on update restrict on delete restrict,
  constraint product_manufacturer_fk
    foreign key (manufacturer_id)
    references fridge.manufacturer (manufacturer_id)
    on update restrict on delete restrict,
  constraint product_category_fk
    foreign key (product_category_id)
    references fridge.product_category (product_category_id)
    on update restrict on delete restrict,
  constraint product_scope_owner_xor
    check (
      (catalog_scope = 'GLOBAL' and owner_household_id is null)
      or
      (catalog_scope = 'HOUSEHOLD' and owner_household_id is not null)
    ),
  constraint product_name_nonblank check (btrim(canonical_name) <> ''),
  constraint product_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint product_owner_identity_uq
    unique (owner_household_id, product_id)
);

create index product_household_scope_idx
  on fridge.product (owner_household_id, lifecycle_status, product_id)
  where catalog_scope = 'HOUSEHOLD';

create table fridge.product_ingredient_compatibility (
  compatibility_mapping_id uuid primary key,
  mapping_family_id uuid not null,
  version_no integer not null,
  catalog_scope fridge.catalog_scope not null,
  owner_household_id uuid,
  product_id uuid not null,
  ingredient_concept_id uuid not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  lifecycle_status text not null default 'ACTIVE',
  recorded_at timestamptz not null default clock_timestamp(),
  constraint compatibility_owner_fk
    foreign key (owner_household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint compatibility_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint compatibility_concept_fk
    foreign key (ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint compatibility_scope_owner_xor
    check (
      (catalog_scope = 'GLOBAL' and owner_household_id is null)
      or
      (catalog_scope = 'HOUSEHOLD' and owner_household_id is not null)
    ),
  constraint compatibility_version_positive check (version_no > 0),
  constraint compatibility_interval_valid check (effective_to is null or effective_to > effective_from),
  constraint compatibility_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint compatibility_family_version_uq unique (mapping_family_id, version_no),
  constraint compatibility_owner_identity_uq unique (owner_household_id, compatibility_mapping_id)
);

comment on table fridge.product_ingredient_compatibility is
  'Versioned governed Product↔IngredientConcept mapping. The initial DB-02 schema supports unconditional compatibility only. Any future invariant-bearing compatibility constraints require a reviewed typed/versioned relational extension; they may not be hidden in JSON. GLOBAL-only and same-Household visibility rules are enforced by the governed mutation boundary.';

create index compatibility_product_concept_effective_idx
  on fridge.product_ingredient_compatibility (
    product_id,
    ingredient_concept_id,
    effective_from desc,
    compatibility_mapping_id
  );

create table fridge.compatibility_decision_evidence (
  compatibility_evidence_id uuid primary key,
  household_id uuid,
  product_id uuid not null,
  ingredient_concept_id uuid not null,
  compatibility_mapping_id uuid not null,
  evaluation_anchor timestamptz not null,
  approved_by_user_id uuid,
  approval_reason text,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint compatibility_evidence_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint compatibility_evidence_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint compatibility_evidence_concept_fk
    foreign key (ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint compatibility_evidence_mapping_fk
    foreign key (compatibility_mapping_id)
    references fridge.product_ingredient_compatibility (compatibility_mapping_id)
    on update restrict on delete restrict,
  constraint compatibility_evidence_approver_fk
    foreign key (approved_by_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict
);

comment on table fridge.compatibility_decision_evidence is
  'Immutable historical compatibility decision evidence for the currently supported unconditional mapping contract. Mapping endpoint identity/version and Household visibility are verified by the governed commit routine before application roles receive write access. Future typed compatibility constraints must add typed evidence, not opaque JSON.';

create index compatibility_evidence_household_idx
  on fridge.compatibility_decision_evidence (household_id, evaluation_anchor desc)
  where household_id is not null;

commit;
