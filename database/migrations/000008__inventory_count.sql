-- FridgeScanner DB-02
-- 000008__inventory_count.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create table fridge.inventory_count (
  inventory_count_id uuid primary key,
  household_id uuid not null,
  lifecycle_status text not null,
  common_snapshot_token text,
  common_snapshot_ordering_domain text,
  common_snapshot_captured_at timestamptz,
  started_at timestamptz not null,
  closed_at timestamptz,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_count_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint inventory_count_status_nonblank
    check (btrim(lifecycle_status) <> ''),
  constraint inventory_count_common_snapshot_shape
    check (
      (
        common_snapshot_token is null
        and common_snapshot_ordering_domain is null
        and common_snapshot_captured_at is null
      )
      or
      (
        common_snapshot_token is not null
        and btrim(common_snapshot_token) <> ''
        and common_snapshot_ordering_domain is not null
        and btrim(common_snapshot_ordering_domain) <> ''
        and common_snapshot_captured_at is not null
      )
    ),
  constraint inventory_count_closed_after_started
    check (closed_at is null or closed_at >= started_at),
  constraint inventory_count_household_identity_uq
    unique (household_id, inventory_count_id)
);

comment on table fridge.inventory_count is
  'Household-scoped physical count session. A common snapshot token is optional and may be reused across lines only when a genuinely atomic/frozen authoritative snapshot exists; the governed count mutation boundary validates that claim.';

create index inventory_count_household_started_idx
  on fridge.inventory_count (household_id, started_at desc, inventory_count_id);

create table fridge.inventory_ledger_basis (
  inventory_ledger_basis_id uuid primary key,
  household_id uuid not null,
  product_id uuid not null,
  stock_item_id uuid,
  placement_anchor_kind fridge.inventory_placement_anchor_kind,
  storage_location_id uuid,
  compartment_id uuid,
  watermark_namespace text not null,
  watermark_token text not null,
  cutoff_occurred_at timestamptz not null,
  cutoff_ordering_domain text,
  cutoff_ordering_token text,
  snapshot_token text,
  snapshot_ordering_domain text,
  snapshot_captured_at timestamptz,
  capture_provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_ledger_basis_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint inventory_ledger_basis_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint inventory_ledger_basis_stock_product_fk
    foreign key (household_id, stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint inventory_ledger_basis_location_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint inventory_ledger_basis_compartment_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint inventory_ledger_basis_watermark_namespace_nonblank
    check (btrim(watermark_namespace) <> ''),
  constraint inventory_ledger_basis_watermark_token_nonblank
    check (btrim(watermark_token) <> ''),
  constraint inventory_ledger_basis_cutoff_ordering_pair
    check (
      (cutoff_ordering_domain is null and cutoff_ordering_token is null)
      or
      (
        cutoff_ordering_domain is not null
        and btrim(cutoff_ordering_domain) <> ''
        and cutoff_ordering_token is not null
        and btrim(cutoff_ordering_token) <> ''
      )
    ),
  constraint inventory_ledger_basis_snapshot_shape
    check (
      (
        snapshot_token is null
        and snapshot_ordering_domain is null
        and snapshot_captured_at is null
      )
      or
      (
        snapshot_token is not null
        and btrim(snapshot_token) <> ''
        and snapshot_ordering_domain is not null
        and btrim(snapshot_ordering_domain) <> ''
        and snapshot_captured_at is not null
      )
    ),
  constraint inventory_ledger_basis_placement_shape
    check (
      (placement_anchor_kind is null and storage_location_id is null and compartment_id is null)
      or (placement_anchor_kind = 'LOCATION' and storage_location_id is not null and compartment_id is null)
      or (placement_anchor_kind = 'COMPARTMENT' and storage_location_id is null and compartment_id is not null)
      or (placement_anchor_kind = 'UNPLACED' and storage_location_id is null and compartment_id is null)
    ),
  constraint inventory_ledger_basis_household_identity_uq
    unique (household_id, inventory_ledger_basis_id),
  constraint inventory_ledger_basis_household_product_identity_uq
    unique (household_id, inventory_ledger_basis_id, product_id)
);

comment on table fridge.inventory_ledger_basis is
  'Immutable domain reconciliation basis capturing the exact Product/optional holding/placement scope plus a durable ledger watermark and ordering context. It is not assumed to be a PostgreSQL MVCC snapshot.';

create index inventory_ledger_basis_household_product_cutoff_idx
  on fridge.inventory_ledger_basis (
    household_id,
    product_id,
    cutoff_occurred_at desc,
    inventory_ledger_basis_id
  );

create table fridge.inventory_count_item (
  inventory_count_item_id uuid primary key,
  household_id uuid not null,
  inventory_count_id uuid not null,
  product_id uuid not null,
  observed_quantity_num numeric not null,
  observed_quantity_den numeric not null,
  observed_unit_id uuid not null,
  stock_item_id uuid,
  placement_anchor_kind fridge.inventory_placement_anchor_kind,
  storage_location_id uuid,
  compartment_id uuid,
  observed_at timestamptz not null,
  inventory_ledger_basis_id uuid not null,
  observation_ordering_domain text,
  observation_ordering_token text,
  reconciliation_status text not null,
  observation_provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_count_item_count_same_household_fk
    foreign key (household_id, inventory_count_id)
    references fridge.inventory_count (household_id, inventory_count_id)
    on update restrict on delete restrict,
  constraint inventory_count_item_stock_product_fk
    foreign key (household_id, stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint inventory_count_item_location_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint inventory_count_item_compartment_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint inventory_count_item_basis_product_fk
    foreign key (household_id, inventory_ledger_basis_id, product_id)
    references fridge.inventory_ledger_basis (
      household_id,
      inventory_ledger_basis_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_count_item_unit_fk
    foreign key (observed_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint inventory_count_item_quantity_nonnegative_normalized
    check (
      observed_quantity_num >= 0
      and fridge_internal.assert_normalized_rational(
        observed_quantity_num,
        observed_quantity_den
      )
    ),
  constraint inventory_count_item_observation_ordering_pair
    check (
      (observation_ordering_domain is null and observation_ordering_token is null)
      or
      (
        observation_ordering_domain is not null
        and btrim(observation_ordering_domain) <> ''
        and observation_ordering_token is not null
        and btrim(observation_ordering_token) <> ''
      )
    ),
  constraint inventory_count_item_placement_shape
    check (
      (placement_anchor_kind is null and storage_location_id is null and compartment_id is null)
      or (placement_anchor_kind = 'LOCATION' and storage_location_id is not null and compartment_id is null)
      or (placement_anchor_kind = 'COMPARTMENT' and storage_location_id is null and compartment_id is not null)
      or (placement_anchor_kind = 'UNPLACED' and storage_location_id is null and compartment_id is null)
    ),
  constraint inventory_count_item_status_nonblank
    check (btrim(reconciliation_status) <> ''),
  constraint inventory_count_item_household_identity_uq
    unique (household_id, inventory_count_item_id),
  constraint inventory_count_item_household_product_identity_uq
    unique (household_id, inventory_count_item_id, product_id),
  constraint inventory_count_item_basis_identity_uq
    unique (
      household_id,
      inventory_count_item_id,
      inventory_ledger_basis_id,
      product_id
    )
);

comment on table fridge.inventory_count_item is
  'Physical observation at an authoritative per-line time and exact ledger basis. stock_item_id is optional so genuinely discovered unmatched stock remains representable without fabricating historical stock identity. Equal timestamps alone never establish causal ordering.';

create index inventory_count_item_count_idx
  on fridge.inventory_count_item (
    household_id,
    inventory_count_id,
    observed_at,
    inventory_count_item_id
  );
create index inventory_count_item_basis_idx
  on fridge.inventory_count_item (
    household_id,
    inventory_ledger_basis_id,
    inventory_count_item_id
  );

create table fridge.inventory_count_allocation (
  inventory_count_allocation_id uuid primary key,
  household_id uuid not null,
  inventory_count_item_id uuid not null,
  product_id uuid not null,
  target_stock_item_id uuid not null,
  allocated_quantity_num numeric not null,
  allocated_quantity_den numeric not null,
  allocation_unit_id uuid not null,
  conversion_evidence_id uuid,
  decision_evidence text not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_count_allocation_item_product_fk
    foreign key (household_id, inventory_count_item_id, product_id)
    references fridge.inventory_count_item (
      household_id,
      inventory_count_item_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_count_allocation_stock_product_fk
    foreign key (household_id, target_stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint inventory_count_allocation_unit_fk
    foreign key (allocation_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint inventory_count_allocation_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint inventory_count_allocation_quantity_positive_normalized
    check (
      allocated_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        allocated_quantity_num,
        allocated_quantity_den
      )
    ),
  constraint inventory_count_allocation_decision_nonblank
    check (btrim(decision_evidence) <> ''),
  constraint inventory_count_allocation_target_uq
    unique (inventory_count_item_id, target_stock_item_id),
  constraint inventory_count_allocation_household_identity_uq
    unique (household_id, inventory_count_allocation_id)
);

comment on table fridge.inventory_count_allocation is
  'Explicit deterministic allocation of an aggregate count observation to one concrete same-Product StockItem. Ambiguous allocation is not represented by arbitrary rows; it remains unresolved until the governed reconciliation boundary has sufficient evidence.';

create index inventory_count_allocation_item_idx
  on fridge.inventory_count_allocation (household_id, inventory_count_item_id);

create table fridge.inventory_reconciliation_outcome (
  inventory_reconciliation_outcome_id uuid primary key,
  household_id uuid not null,
  inventory_count_item_id uuid not null,
  inventory_ledger_basis_id uuid not null,
  product_id uuid not null,
  evidence_set_identity text not null,
  outcome_status text not null,
  adjustment_inventory_movement_id uuid,
  rationale text not null,
  decision_provenance text,
  decided_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_reconciliation_outcome_item_basis_product_fk
    foreign key (
      household_id,
      inventory_count_item_id,
      inventory_ledger_basis_id,
      product_id
    )
    references fridge.inventory_count_item (
      household_id,
      inventory_count_item_id,
      inventory_ledger_basis_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_reconciliation_outcome_adjustment_product_fk
    foreign key (household_id, adjustment_inventory_movement_id, product_id)
    references fridge.inventory_movement (
      household_id,
      inventory_movement_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_reconciliation_outcome_evidence_nonblank
    check (btrim(evidence_set_identity) <> ''),
  constraint inventory_reconciliation_outcome_status_nonblank
    check (btrim(outcome_status) <> ''),
  constraint inventory_reconciliation_outcome_rationale_nonblank
    check (btrim(rationale) <> ''),
  constraint inventory_reconciliation_outcome_adjustment_uq
    unique (adjustment_inventory_movement_id),
  constraint inventory_reconciliation_outcome_household_identity_uq
    unique (household_id, inventory_reconciliation_outcome_id)
);

comment on table fridge.inventory_reconciliation_outcome is
  'Append-only reconciliation decision pinned to the exact count item, exact ledger basis and Product. adjustment_inventory_movement_id is optional; a governed mutation routine may create one only for a non-ambiguous accepted outcome. Equal-time evidence without trustworthy same-domain causal ordering must remain unresolved/blocked rather than guessed.';

create index inventory_reconciliation_outcome_item_idx
  on fridge.inventory_reconciliation_outcome (
    household_id,
    inventory_count_item_id,
    decided_at,
    inventory_reconciliation_outcome_id
  );

commit;
