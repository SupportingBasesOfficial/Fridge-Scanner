-- FridgeScanner DB-02
-- 000011__shopping_replenishment.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create table fridge.household_product_policy (
  household_product_policy_id uuid primary key,
  household_id uuid not null,
  product_id uuid not null,
  desired_quantity_num numeric,
  desired_quantity_den numeric,
  desired_unit_id uuid,
  minimum_quantity_num numeric,
  minimum_quantity_den numeric,
  minimum_unit_id uuid,
  lifecycle_status text not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_product_policy_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_product_policy_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint household_product_policy_desired_unit_fk
    foreign key (desired_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint household_product_policy_minimum_unit_fk
    foreign key (minimum_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint household_product_policy_desired_shape
    check (
      (desired_quantity_num is null and desired_quantity_den is null and desired_unit_id is null)
      or
      (
        desired_quantity_num is not null
        and desired_quantity_den is not null
        and desired_unit_id is not null
        and desired_quantity_num >= 0
        and fridge_internal.assert_normalized_rational(desired_quantity_num, desired_quantity_den)
      )
    ),
  constraint household_product_policy_minimum_shape
    check (
      (minimum_quantity_num is null and minimum_quantity_den is null and minimum_unit_id is null)
      or
      (
        minimum_quantity_num is not null
        and minimum_quantity_den is not null
        and minimum_unit_id is not null
        and minimum_quantity_num >= 0
        and fridge_internal.assert_normalized_rational(minimum_quantity_num, minimum_quantity_den)
      )
    ),
  constraint household_product_policy_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint household_product_policy_household_identity_uq
    unique (household_id, household_product_policy_id),
  constraint household_product_policy_household_product_identity_uq
    unique (household_id, household_product_policy_id, product_id)
);

comment on table fridge.household_product_policy is
  'Household/Product replenishment policy with typed exact quantity thresholds. Product visibility and cross-unit desired/minimum comparisons are validated by the governed policy boundary; this relation never becomes inventory truth.';

create index household_product_policy_product_idx
  on fridge.household_product_policy (household_id, product_id, lifecycle_status, household_product_policy_id);

create table fridge.household_product_storage_preference (
  household_product_storage_preference_id uuid primary key,
  household_id uuid not null,
  household_product_policy_id uuid not null,
  preference_rank integer not null,
  storage_location_id uuid,
  compartment_id uuid,
  storage_location_kind_code text,
  lifecycle_status text not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint storage_preference_policy_same_household_fk
    foreign key (household_id, household_product_policy_id)
    references fridge.household_product_policy (household_id, household_product_policy_id)
    on update restrict on delete restrict,
  constraint storage_preference_location_same_household_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint storage_preference_compartment_same_household_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint storage_preference_kind_fk
    foreign key (storage_location_kind_code)
    references fridge.storage_location_kind (kind_code)
    on update restrict on delete restrict,
  constraint storage_preference_target_exact_one
    check (num_nonnulls(storage_location_id, compartment_id, storage_location_kind_code) = 1),
  constraint storage_preference_rank_positive check (preference_rank > 0),
  constraint storage_preference_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint storage_preference_household_identity_uq
    unique (household_id, household_product_storage_preference_id)
);

comment on table fridge.household_product_storage_preference is
  'Typed preferred-storage policy only: exact location XOR exact compartment XOR governed location kind. It never moves stock and never becomes a competing placement authority.';

create index storage_preference_policy_rank_idx
  on fridge.household_product_storage_preference (
    household_id,
    household_product_policy_id,
    preference_rank,
    household_product_storage_preference_id
  );

create table fridge.shopping_list (
  shopping_list_id uuid primary key,
  household_id uuid not null,
  lifecycle_status text not null,
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  provenance text,
  constraint shopping_list_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint shopping_list_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint shopping_list_closed_after_created
    check (closed_at is null or closed_at >= created_at),
  constraint shopping_list_household_identity_uq
    unique (household_id, shopping_list_id)
);

create index shopping_list_household_created_idx
  on fridge.shopping_list (household_id, created_at desc, shopping_list_id);

create table fridge.shopping_list_item (
  shopping_list_item_id uuid primary key,
  household_id uuid not null,
  shopping_list_id uuid not null,
  requested_product_id uuid,
  requested_ingredient_concept_id uuid,
  requested_quantity_num numeric not null,
  requested_quantity_den numeric not null,
  requested_unit_id uuid not null,
  unresolved_source_text text,
  lifecycle_status text not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint shopping_list_item_list_same_household_fk
    foreign key (household_id, shopping_list_id)
    references fridge.shopping_list (household_id, shopping_list_id)
    on update restrict on delete restrict,
  constraint shopping_list_item_product_fk
    foreign key (requested_product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint shopping_list_item_concept_fk
    foreign key (requested_ingredient_concept_id)
    references fridge.ingredient_concept (ingredient_concept_id)
    on update restrict on delete restrict,
  constraint shopping_list_item_unit_fk
    foreign key (requested_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint shopping_list_item_subject_xor
    check ((requested_product_id is not null) <> (requested_ingredient_concept_id is not null)),
  constraint shopping_list_item_quantity_positive_normalized
    check (
      requested_quantity_num > 0
      and fridge_internal.assert_normalized_rational(requested_quantity_num, requested_quantity_den)
    ),
  constraint shopping_list_item_source_text_nonblank
    check (unresolved_source_text is null or btrim(unresolved_source_text) <> ''),
  constraint shopping_list_item_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint shopping_list_item_household_identity_uq
    unique (household_id, shopping_list_item_id)
);

comment on table fridge.shopping_list_item is
  'Household shopping intent with exactly one typed Product-or-IngredientConcept subject and exact requested quantity. Free text is provenance only, never a substitute for typed subject identity.';

create index shopping_list_item_list_idx
  on fridge.shopping_list_item (household_id, shopping_list_id, shopping_list_item_id);

create table fridge.shopping_list_fulfillment (
  shopping_list_fulfillment_id uuid primary key,
  household_id uuid not null,
  shopping_list_item_id uuid not null,
  purchase_item_id uuid not null,
  purchase_product_id uuid not null,
  allocated_quantity_num numeric not null,
  allocated_quantity_den numeric not null,
  allocation_unit_id uuid not null,
  compatibility_evidence_id uuid,
  conversion_evidence_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint shopping_fulfillment_item_same_household_fk
    foreign key (household_id, shopping_list_item_id)
    references fridge.shopping_list_item (household_id, shopping_list_item_id)
    on update restrict on delete restrict,
  constraint shopping_fulfillment_purchase_product_fk
    foreign key (household_id, purchase_item_id, purchase_product_id)
    references fridge.purchase_item (household_id, purchase_item_id, product_id)
    on update restrict on delete restrict,
  constraint shopping_fulfillment_unit_fk
    foreign key (allocation_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint shopping_fulfillment_compatibility_fk
    foreign key (compatibility_evidence_id)
    references fridge.compatibility_decision_evidence (compatibility_evidence_id)
    on update restrict on delete restrict,
  constraint shopping_fulfillment_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint shopping_fulfillment_quantity_positive_normalized
    check (
      allocated_quantity_num > 0
      and fridge_internal.assert_normalized_rational(allocated_quantity_num, allocated_quantity_den)
    ),
  constraint shopping_fulfillment_pair_uq
    unique (shopping_list_item_id, purchase_item_id),
  constraint shopping_fulfillment_household_identity_uq
    unique (household_id, shopping_list_fulfillment_id)
);

comment on table fridge.shopping_list_fulfillment is
  'Shopping-intent attribution from one PurchaseItem. This is physically separate from receipt allocations; aggregate availability is independently capped at the PurchaseItem quantity by the governed shopping fulfillment boundary. Direct Product equality or concept compatibility is validated at commit with pinned evidence.';

create index shopping_fulfillment_purchase_idx
  on fridge.shopping_list_fulfillment (household_id, purchase_item_id, shopping_list_fulfillment_id);
create index shopping_fulfillment_item_idx
  on fridge.shopping_list_fulfillment (household_id, shopping_list_item_id, shopping_list_fulfillment_id);

commit;
