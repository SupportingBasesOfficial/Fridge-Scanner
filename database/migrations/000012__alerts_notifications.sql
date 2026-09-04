-- FridgeScanner DB-02
-- 000012__alerts_notifications.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create type fridge.alert_subject_kind as enum (
  'HOUSEHOLD',
  'PRODUCT',
  'STOCK_ITEM',
  'STORAGE_LOCATION',
  'COMPARTMENT',
  'HOUSEHOLD_PRODUCT_POLICY'
);

create table fridge.alert_rule (
  alert_rule_id uuid primary key,
  household_id uuid not null,
  rule_kind text not null,
  condition_contract_code text not null,
  condition_contract_version text not null,
  lifecycle_status text not null,
  version_no integer not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint alert_rule_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint alert_rule_kind_nonblank check (btrim(rule_kind) <> ''),
  constraint alert_rule_condition_code_nonblank check (btrim(condition_contract_code) <> ''),
  constraint alert_rule_condition_version_nonblank check (btrim(condition_contract_version) <> ''),
  constraint alert_rule_status_nonblank check (btrim(lifecycle_status) <> ''),
  constraint alert_rule_version_positive check (version_no > 0),
  constraint alert_rule_household_identity_uq unique (household_id, alert_rule_id)
);

comment on table fridge.alert_rule is
  'Household-derived operational alert rule with a versioned typed condition contract. Rule evaluation never grants authority; Household authorization is established independently.';

create index alert_rule_household_status_idx
  on fridge.alert_rule (household_id, lifecycle_status, alert_rule_id);

create table fridge.alert_rule_subject (
  alert_rule_subject_id uuid primary key,
  household_id uuid not null,
  alert_rule_id uuid not null,
  subject_kind fridge.alert_subject_kind not null,
  product_id uuid,
  stock_item_id uuid,
  storage_location_id uuid,
  compartment_id uuid,
  household_product_policy_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint alert_rule_subject_rule_same_household_fk
    foreign key (household_id, alert_rule_id)
    references fridge.alert_rule (household_id, alert_rule_id)
    on update restrict on delete restrict,
  constraint alert_rule_subject_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint alert_rule_subject_stock_same_household_fk
    foreign key (household_id, stock_item_id)
    references fridge.stock_item (household_id, stock_item_id)
    on update restrict on delete restrict,
  constraint alert_rule_subject_location_same_household_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint alert_rule_subject_compartment_same_household_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint alert_rule_subject_policy_same_household_fk
    foreign key (household_id, household_product_policy_id)
    references fridge.household_product_policy (household_id, household_product_policy_id)
    on update restrict on delete restrict,
  constraint alert_rule_subject_shape
    check (
      (subject_kind = 'HOUSEHOLD' and num_nonnulls(product_id, stock_item_id, storage_location_id, compartment_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'PRODUCT' and product_id is not null and num_nonnulls(stock_item_id, storage_location_id, compartment_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'STOCK_ITEM' and stock_item_id is not null and num_nonnulls(product_id, storage_location_id, compartment_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'STORAGE_LOCATION' and storage_location_id is not null and num_nonnulls(product_id, stock_item_id, compartment_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'COMPARTMENT' and compartment_id is not null and num_nonnulls(product_id, stock_item_id, storage_location_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'HOUSEHOLD_PRODUCT_POLICY' and household_product_policy_id is not null and num_nonnulls(product_id, stock_item_id, storage_location_id, compartment_id) = 0)
    ),
  constraint alert_rule_subject_rule_uq unique (alert_rule_id),
  constraint alert_rule_subject_household_identity_uq unique (household_id, alert_rule_subject_id)
);

comment on table fridge.alert_rule_subject is
  'Exactly one typed primary scope for an AlertRule. HOUSEHOLD carries no entity FK; every other currently governed kind uses one explicit typed relation. Product visibility is validated by the governed rule boundary.';

create table fridge.alert (
  alert_id uuid primary key,
  household_id uuid not null,
  alert_rule_id uuid not null,
  alert_state text not null,
  detected_at timestamptz not null,
  evaluation_contract_version text not null,
  provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint alert_rule_same_household_fk
    foreign key (household_id, alert_rule_id)
    references fridge.alert_rule (household_id, alert_rule_id)
    on update restrict on delete restrict,
  constraint alert_state_nonblank check (btrim(alert_state) <> ''),
  constraint alert_evaluation_version_nonblank check (btrim(evaluation_contract_version) <> ''),
  constraint alert_provenance_nonblank check (btrim(provenance) <> ''),
  constraint alert_household_identity_uq unique (household_id, alert_id)
);

comment on table fridge.alert is
  'Household alert occurrence. Alert state is independent from notification delivery state. Trigger subjects preserve explainability separately.';

create index alert_household_detected_idx
  on fridge.alert (household_id, detected_at desc, alert_id);

create table fridge.alert_trigger_subject (
  alert_trigger_subject_id uuid primary key,
  household_id uuid not null,
  alert_id uuid not null,
  subject_role text not null,
  subject_order integer,
  subject_kind fridge.alert_subject_kind not null,
  product_id uuid,
  stock_item_id uuid,
  storage_location_id uuid,
  compartment_id uuid,
  household_product_policy_id uuid,
  evaluation_evidence text not null,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint alert_trigger_subject_alert_same_household_fk
    foreign key (household_id, alert_id)
    references fridge.alert (household_id, alert_id)
    on update restrict on delete restrict,
  constraint alert_trigger_subject_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint alert_trigger_subject_stock_same_household_fk
    foreign key (household_id, stock_item_id)
    references fridge.stock_item (household_id, stock_item_id)
    on update restrict on delete restrict,
  constraint alert_trigger_subject_location_same_household_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint alert_trigger_subject_compartment_same_household_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint alert_trigger_subject_policy_same_household_fk
    foreign key (household_id, household_product_policy_id)
    references fridge.household_product_policy (household_id, household_product_policy_id)
    on update restrict on delete restrict,
  constraint alert_trigger_subject_shape
    check (
      (subject_kind = 'HOUSEHOLD' and num_nonnulls(product_id, stock_item_id, storage_location_id, compartment_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'PRODUCT' and product_id is not null and num_nonnulls(stock_item_id, storage_location_id, compartment_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'STOCK_ITEM' and stock_item_id is not null and num_nonnulls(product_id, storage_location_id, compartment_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'STORAGE_LOCATION' and storage_location_id is not null and num_nonnulls(product_id, stock_item_id, compartment_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'COMPARTMENT' and compartment_id is not null and num_nonnulls(product_id, stock_item_id, storage_location_id, household_product_policy_id) = 0)
      or
      (subject_kind = 'HOUSEHOLD_PRODUCT_POLICY' and household_product_policy_id is not null and num_nonnulls(product_id, stock_item_id, storage_location_id, compartment_id) = 0)
    ),
  constraint alert_trigger_subject_role_nonblank check (btrim(subject_role) <> ''),
  constraint alert_trigger_subject_order_nonnegative check (subject_order is null or subject_order >= 0),
  constraint alert_trigger_subject_evidence_nonblank check (btrim(evaluation_evidence) <> ''),
  constraint alert_trigger_subject_household_identity_uq unique (household_id, alert_trigger_subject_id)
);

comment on table fridge.alert_trigger_subject is
  'Immutable typed explainability evidence for the concrete subject(s) that triggered one Alert. At least one governed primary trigger subject is required by the alert commit boundary; generic entity IDs are forbidden.';

create index alert_trigger_subject_alert_idx
  on fridge.alert_trigger_subject (household_id, alert_id, subject_order, alert_trigger_subject_id);

create table fridge.notification_delivery (
  notification_delivery_id uuid primary key,
  household_id uuid not null,
  alert_id uuid not null,
  channel_code text not null,
  recipient_identity text not null,
  destination_identity text not null,
  delivery_state text not null,
  attempt_no integer not null,
  decision_provenance text,
  attempted_at timestamptz,
  delivered_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint notification_delivery_alert_same_household_fk
    foreign key (household_id, alert_id)
    references fridge.alert (household_id, alert_id)
    on update restrict on delete restrict,
  constraint notification_delivery_channel_nonblank check (btrim(channel_code) <> ''),
  constraint notification_delivery_recipient_nonblank check (btrim(recipient_identity) <> ''),
  constraint notification_delivery_destination_nonblank check (btrim(destination_identity) <> ''),
  constraint notification_delivery_state_nonblank check (btrim(delivery_state) <> ''),
  constraint notification_delivery_attempt_positive check (attempt_no > 0),
  constraint notification_delivery_delivered_after_attempt
    check (delivered_at is null or attempted_at is not null),
  constraint notification_delivery_household_identity_uq unique (household_id, notification_delivery_id),
  constraint notification_delivery_attempt_identity_uq
    unique (alert_id, channel_code, destination_identity, attempt_no)
);

comment on table fridge.notification_delivery is
  'Delivery attempt/state for an Alert. Recipient/destination evidence never grants Household authority and does not change Alert state.';

create index notification_delivery_alert_idx
  on fridge.notification_delivery (household_id, alert_id, attempt_no, notification_delivery_id);

commit;
