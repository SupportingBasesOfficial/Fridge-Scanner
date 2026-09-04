-- FridgeScanner DB-02
-- 000007__inventory_ledger.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create table fridge.batch (
  batch_id uuid primary key,
  product_id uuid not null,
  manufacturer_id uuid,
  commercial_lot_code text,
  produced_at timestamptz,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint batch_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint batch_manufacturer_fk
    foreign key (manufacturer_id)
    references fridge.manufacturer (manufacturer_id)
    on update restrict on delete restrict,
  constraint batch_lot_code_nonblank
    check (commercial_lot_code is null or btrim(commercial_lot_code) <> ''),
  constraint batch_product_identity_uq
    unique (batch_id, product_id)
);

comment on table fridge.batch is
  'Optional Product provenance for manufacturer/commercial lot facts. Batch is never stock placement, never a prerequisite for Product identity and never a substitute for StockItem. Expiration evidence is modeled separately with full source precision/provenance rather than as a simplified Batch column.';

create index batch_product_idx
  on fridge.batch (product_id, batch_id);

create type fridge.inventory_placement_anchor_kind as enum (
  'LOCATION',
  'COMPARTMENT',
  'UNPLACED'
);

create table fridge.stock_item (
  stock_item_id uuid primary key,
  household_id uuid not null,
  product_id uuid not null,
  batch_id uuid,
  lifecycle_status text not null default 'ACTIVE',
  placement_anchor_kind fridge.inventory_placement_anchor_kind not null,
  storage_location_id uuid,
  compartment_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  provenance text,
  constraint stock_item_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint stock_item_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint stock_item_batch_same_product_fk
    foreign key (batch_id, product_id)
    references fridge.batch (batch_id, product_id)
    on update restrict on delete restrict,
  constraint stock_item_location_same_household_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint stock_item_compartment_same_household_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint stock_item_placement_exact
    check (
      (
        placement_anchor_kind = 'LOCATION'
        and storage_location_id is not null
        and compartment_id is null
      )
      or
      (
        placement_anchor_kind = 'COMPARTMENT'
        and storage_location_id is null
        and compartment_id is not null
      )
      or
      (
        placement_anchor_kind = 'UNPLACED'
        and storage_location_id is null
        and compartment_id is null
      )
    ),
  constraint stock_item_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint stock_item_retired_after_created
    check (retired_at is null or retired_at >= created_at),
  constraint stock_item_household_identity_uq
    unique (household_id, stock_item_id),
  constraint stock_item_household_product_identity_uq
    unique (household_id, stock_item_id, product_id)
);

comment on table fridge.stock_item is
  'Concrete Household stock identity/current lifecycle and placement. Quantity is intentionally absent: authoritative quantity history is InventoryMovement and any current balance is a rebuildable projection.';

create index stock_item_household_product_idx
  on fridge.stock_item (household_id, product_id, lifecycle_status, stock_item_id);
create index stock_item_location_idx
  on fridge.stock_item (household_id, storage_location_id, stock_item_id)
  where placement_anchor_kind = 'LOCATION';
create index stock_item_compartment_idx
  on fridge.stock_item (household_id, compartment_id, stock_item_id)
  where placement_anchor_kind = 'COMPARTMENT';

create table fridge.inventory_movement (
  inventory_movement_id uuid primary key,
  household_id uuid not null,
  movement_kind text not null,
  product_id uuid not null,
  stock_item_id uuid,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  occurred_at timestamptz not null,
  ordering_domain text,
  ordering_token text,
  placement_anchor_kind fridge.inventory_placement_anchor_kind,
  storage_location_id uuid,
  compartment_id uuid,
  causation_identity text,
  correction_of_movement_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_movement_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint inventory_movement_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint inventory_movement_stock_same_household_product_fk
    foreign key (household_id, stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint inventory_movement_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint inventory_movement_location_same_household_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint inventory_movement_compartment_same_household_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint inventory_movement_correction_same_scope_fk
    foreign key (household_id, correction_of_movement_id, product_id)
    references fridge.inventory_movement (
      household_id,
      inventory_movement_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_movement_kind_nonblank
    check (btrim(movement_kind) <> ''),
  constraint inventory_movement_quantity_nonzero_normalized
    check (
      quantity_num <> 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint inventory_movement_ordering_pair
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
  constraint inventory_movement_placement_shape
    check (
      (
        placement_anchor_kind is null
        and storage_location_id is null
        and compartment_id is null
      )
      or
      (
        placement_anchor_kind = 'LOCATION'
        and storage_location_id is not null
        and compartment_id is null
      )
      or
      (
        placement_anchor_kind = 'COMPARTMENT'
        and storage_location_id is null
        and compartment_id is not null
      )
      or
      (
        placement_anchor_kind = 'UNPLACED'
        and storage_location_id is null
        and compartment_id is null
      )
    ),
  constraint inventory_movement_not_self_correction
    check (
      correction_of_movement_id is null
      or correction_of_movement_id <> inventory_movement_id
    ),
  constraint inventory_movement_causation_nonblank
    check (causation_identity is null or btrim(causation_identity) <> ''),
  constraint inventory_movement_household_identity_uq
    unique (household_id, inventory_movement_id),
  constraint inventory_movement_household_product_identity_uq
    unique (household_id, inventory_movement_id, product_id)
);

comment on table fridge.inventory_movement is
  'Authoritative append-only stock delta. Sign semantics, movement-kind policy, Product visibility and required placement snapshots are validated by governed mutation boundaries; committed rows later receive immutable guards/privilege enforcement. Correction references are structurally confined to the same Household and Product.';

create index inventory_movement_household_product_time_idx
  on fridge.inventory_movement (
    household_id,
    product_id,
    occurred_at,
    inventory_movement_id
  );
create index inventory_movement_stock_time_idx
  on fridge.inventory_movement (
    household_id,
    stock_item_id,
    occurred_at,
    inventory_movement_id
  )
  where stock_item_id is not null;
create index inventory_movement_correction_idx
  on fridge.inventory_movement (correction_of_movement_id)
  where correction_of_movement_id is not null;

create table fridge.inventory_transfer (
  inventory_transfer_id uuid primary key,
  household_id uuid not null,
  product_id uuid not null,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  occurred_at timestamptz not null,
  source_anchor_kind fridge.inventory_placement_anchor_kind not null,
  source_storage_location_id uuid,
  source_compartment_id uuid,
  destination_anchor_kind fridge.inventory_placement_anchor_kind not null,
  destination_storage_location_id uuid,
  destination_compartment_id uuid,
  causation_identity text,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_transfer_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint inventory_transfer_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint inventory_transfer_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint inventory_transfer_source_location_fk
    foreign key (household_id, source_storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint inventory_transfer_source_compartment_fk
    foreign key (household_id, source_compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint inventory_transfer_destination_location_fk
    foreign key (household_id, destination_storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint inventory_transfer_destination_compartment_fk
    foreign key (household_id, destination_compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint inventory_transfer_quantity_positive_normalized
    check (
      quantity_num > 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint inventory_transfer_source_shape
    check (
      (
        source_anchor_kind = 'LOCATION'
        and source_storage_location_id is not null
        and source_compartment_id is null
      )
      or
      (
        source_anchor_kind = 'COMPARTMENT'
        and source_storage_location_id is null
        and source_compartment_id is not null
      )
      or
      (
        source_anchor_kind = 'UNPLACED'
        and source_storage_location_id is null
        and source_compartment_id is null
      )
    ),
  constraint inventory_transfer_destination_shape
    check (
      (
        destination_anchor_kind = 'LOCATION'
        and destination_storage_location_id is not null
        and destination_compartment_id is null
      )
      or
      (
        destination_anchor_kind = 'COMPARTMENT'
        and destination_storage_location_id is null
        and destination_compartment_id is not null
      )
      or
      (
        destination_anchor_kind = 'UNPLACED'
        and destination_storage_location_id is null
        and destination_compartment_id is null
      )
    ),
  constraint inventory_transfer_causation_nonblank
    check (causation_identity is null or btrim(causation_identity) <> ''),
  constraint inventory_transfer_household_identity_uq
    unique (household_id, inventory_transfer_id),
  constraint inventory_transfer_household_product_identity_uq
    unique (household_id, inventory_transfer_id, product_id)
);

comment on table fridge.inventory_transfer is
  'Immutable transfer intent/evidence preserving exact Product, quantity, occurrence and source/destination placement snapshots. Paired ledger effects are materialized atomically by the governed transfer boundary.';

create table fridge.inventory_transfer_effect (
  inventory_transfer_effect_id uuid primary key,
  household_id uuid not null,
  inventory_transfer_id uuid not null,
  product_id uuid not null,
  source_inventory_movement_id uuid not null,
  destination_inventory_movement_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_transfer_effect_transfer_product_fk
    foreign key (household_id, inventory_transfer_id, product_id)
    references fridge.inventory_transfer (
      household_id,
      inventory_transfer_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_transfer_effect_source_product_fk
    foreign key (household_id, source_inventory_movement_id, product_id)
    references fridge.inventory_movement (
      household_id,
      inventory_movement_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_transfer_effect_destination_product_fk
    foreign key (household_id, destination_inventory_movement_id, product_id)
    references fridge.inventory_movement (
      household_id,
      inventory_movement_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_transfer_effect_distinct_movements
    check (source_inventory_movement_id <> destination_inventory_movement_id),
  constraint inventory_transfer_effect_transfer_uq
    unique (inventory_transfer_id),
  constraint inventory_transfer_effect_source_movement_uq
    unique (source_inventory_movement_id),
  constraint inventory_transfer_effect_destination_movement_uq
    unique (destination_inventory_movement_id),
  constraint inventory_transfer_effect_household_identity_uq
    unique (household_id, inventory_transfer_effect_id)
);

comment on table fridge.inventory_transfer_effect is
  'Exactly one source decrement and one destination increment semantic link per InventoryTransfer. Exact sign/quantity conservation is verified transactionally/deferred before commit.';

create table fridge.inventory_quantity_lineage (
  inventory_quantity_lineage_id uuid primary key,
  household_id uuid not null,
  source_inventory_movement_id uuid not null,
  destination_inventory_movement_id uuid not null,
  source_stock_item_id uuid,
  destination_stock_item_id uuid,
  product_id uuid not null,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  conversion_evidence_id uuid,
  lineage_operation_code text not null,
  causation_identity text not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint inventory_lineage_source_movement_product_fk
    foreign key (household_id, source_inventory_movement_id, product_id)
    references fridge.inventory_movement (
      household_id,
      inventory_movement_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_lineage_destination_movement_product_fk
    foreign key (household_id, destination_inventory_movement_id, product_id)
    references fridge.inventory_movement (
      household_id,
      inventory_movement_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint inventory_lineage_source_stock_product_fk
    foreign key (household_id, source_stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint inventory_lineage_destination_stock_product_fk
    foreign key (household_id, destination_stock_item_id, product_id)
    references fridge.stock_item (household_id, stock_item_id, product_id)
    on update restrict on delete restrict,
  constraint inventory_lineage_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint inventory_lineage_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint inventory_lineage_distinct_movements
    check (source_inventory_movement_id <> destination_inventory_movement_id),
  constraint inventory_lineage_quantity_positive_normalized
    check (
      quantity_num > 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint inventory_lineage_operation_nonblank
    check (btrim(lineage_operation_code) <> ''),
  constraint inventory_lineage_causation_nonblank
    check (btrim(causation_identity) <> ''),
  constraint inventory_lineage_household_identity_uq
    unique (household_id, inventory_quantity_lineage_id)
);

comment on table fridge.inventory_quantity_lineage is
  'Immutable same-Product conserved quantity edge for split/transfer/merge/redistribution. Source/destination conservation sums and required inherited shelf-life evidence are verified by governed transaction boundaries and later deferred integrity guards.';

create index inventory_lineage_source_idx
  on fridge.inventory_quantity_lineage (
    household_id,
    source_inventory_movement_id,
    lineage_operation_code
  );
create index inventory_lineage_destination_idx
  on fridge.inventory_quantity_lineage (
    household_id,
    destination_inventory_movement_id,
    lineage_operation_code
  );

create table fridge.receipt_item_inventory_effect (
  receipt_item_inventory_effect_id uuid primary key,
  household_id uuid not null,
  receipt_item_id uuid not null,
  inventory_movement_id uuid not null,
  product_id uuid not null,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  conversion_evidence_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receipt_inventory_effect_receipt_product_fk
    foreign key (household_id, receipt_item_id, product_id)
    references fridge.receipt_item (household_id, receipt_item_id, product_id)
    on update restrict on delete restrict,
  constraint receipt_inventory_effect_movement_product_fk
    foreign key (household_id, inventory_movement_id, product_id)
    references fridge.inventory_movement (
      household_id,
      inventory_movement_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint receipt_inventory_effect_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint receipt_inventory_effect_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint receipt_inventory_effect_quantity_positive_normalized
    check (
      quantity_num > 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint receipt_inventory_effect_movement_uq
    unique (inventory_movement_id),
  constraint receipt_inventory_effect_household_identity_uq
    unique (household_id, receipt_item_inventory_effect_id)
);

comment on table fridge.receipt_item_inventory_effect is
  'Explicit ReceiptItem-to-ledger materialization edge. Movement Product equality is structural; positive-entry kind/sign and exact sum-to-ReceiptItem conservation are verified by the governed receiving boundary/deferred guard.';

create index receipt_inventory_effect_receipt_idx
  on fridge.receipt_item_inventory_effect (household_id, receipt_item_id);

create table fridge.waste_record (
  waste_record_id uuid primary key,
  household_id uuid not null,
  occurred_at timestamptz not null,
  waste_classification text not null,
  reason text not null,
  actor_user_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint waste_record_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint waste_record_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint waste_record_classification_nonblank
    check (btrim(waste_classification) <> ''),
  constraint waste_record_reason_nonblank
    check (btrim(reason) <> ''),
  constraint waste_record_household_identity_uq
    unique (household_id, waste_record_id)
);

comment on table fridge.waste_record is
  'Durable waste/disposal semantics only. It carries no independent stock delta; quantity truth exists only in linked InventoryMovement effects.';

create table fridge.waste_record_movement (
  waste_record_movement_id uuid primary key,
  household_id uuid not null,
  waste_record_id uuid not null,
  inventory_movement_id uuid not null,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  conversion_evidence_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint waste_record_movement_record_same_household_fk
    foreign key (household_id, waste_record_id)
    references fridge.waste_record (household_id, waste_record_id)
    on update restrict on delete restrict,
  constraint waste_record_movement_movement_same_household_fk
    foreign key (household_id, inventory_movement_id)
    references fridge.inventory_movement (household_id, inventory_movement_id)
    on update restrict on delete restrict,
  constraint waste_record_movement_unit_fk
    foreign key (measurement_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint waste_record_movement_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint waste_record_movement_quantity_positive_normalized
    check (
      quantity_num > 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint waste_record_movement_movement_uq
    unique (inventory_movement_id),
  constraint waste_record_movement_household_identity_uq
    unique (household_id, waste_record_movement_id)
);

comment on table fridge.waste_record_movement is
  'Waste/disposal semantic link to one stock-reducing InventoryMovement. Sign/kind and exact quantity reconciliation are verified by governed transaction/deferred guards; WasteRecord never becomes a second quantity ledger.';

create index waste_record_movement_record_idx
  on fridge.waste_record_movement (household_id, waste_record_id);

commit;
