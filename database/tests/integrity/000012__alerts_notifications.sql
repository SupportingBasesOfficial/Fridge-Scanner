-- FridgeScanner DB-02 integrity checks for 000012__alerts_notifications.sql
-- and 000012_01__notification_delivery_time_guard.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('c1000000-0000-4000-8000-000000000001', 'Alert household A'),
  ('c1000000-0000-4000-8000-000000000002', 'Alert household B');

insert into fridge.product (product_id, catalog_scope, canonical_name)
values ('c2000000-0000-4000-8000-000000000001', 'GLOBAL', 'Alert product');

insert into fridge.storage_location_kind (kind_code, display_name)
values ('ALERT_STORAGE_TEST', 'Alert storage test');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values
  (
    'c3000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'ALERT_STORAGE_TEST',
    'Alert location A'
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    'ALERT_STORAGE_TEST',
    'Alert location B'
  );

insert into fridge.alert_rule (
  alert_rule_id,
  household_id,
  rule_kind,
  condition_contract_code,
  condition_contract_version,
  lifecycle_status,
  version_no
) values (
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'EXPIRY_TEST',
  'EXPIRY_CONDITION_TEST',
  '1',
  'TEST_ACTIVE',
  1
);

insert into fridge.alert_rule_subject (
  alert_rule_subject_id,
  household_id,
  alert_rule_id,
  subject_kind,
  product_id
) values (
  'c5000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'PRODUCT',
  'c2000000-0000-4000-8000-000000000001'
);

-- Subject kind must match exactly one typed target.
do $$
begin
  begin
    insert into fridge.alert_rule_subject (
      alert_rule_subject_id,
      household_id,
      alert_rule_id,
      subject_kind,
      product_id,
      storage_location_id
    ) values (
      'c5000000-0000-4000-8000-000000000002',
      'c1000000-0000-4000-8000-000000000001',
      'c4000000-0000-4000-8000-000000000001',
      'PRODUCT',
      'c2000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001'
    );

    raise exception 'AlertRuleSubject with competing typed targets unexpectedly accepted';
  exception
    when check_violation then
      null;
    when unique_violation then
      null;
  end;
end;
$$;

-- Household-owned subject cannot cross Household boundaries.
do $$
begin
  begin
    insert into fridge.alert_rule (
      alert_rule_id,
      household_id,
      rule_kind,
      condition_contract_code,
      condition_contract_version,
      lifecycle_status,
      version_no
    ) values (
      'c4000000-0000-4000-8000-000000000002',
      'c1000000-0000-4000-8000-000000000001',
      'LOCATION_TEST',
      'LOCATION_CONDITION_TEST',
      '1',
      'TEST_ACTIVE',
      1
    );

    insert into fridge.alert_rule_subject (
      alert_rule_subject_id,
      household_id,
      alert_rule_id,
      subject_kind,
      storage_location_id
    ) values (
      'c5000000-0000-4000-8000-000000000003',
      'c1000000-0000-4000-8000-000000000001',
      'c4000000-0000-4000-8000-000000000002',
      'STORAGE_LOCATION',
      'c3000000-0000-4000-8000-000000000002'
    );

    raise exception 'cross-Household AlertRuleSubject unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.alert (
  alert_id,
  household_id,
  alert_rule_id,
  alert_state,
  detected_at,
  evaluation_contract_version,
  provenance
) values (
  'c6000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'TEST_OPEN',
  '2026-02-01T10:00:00Z',
  '1',
  'alert test'
);

insert into fridge.alert_trigger_subject (
  alert_trigger_subject_id,
  household_id,
  alert_id,
  subject_role,
  subject_kind,
  product_id,
  evaluation_evidence
) values (
  'c7000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c6000000-0000-4000-8000-000000000001',
  'PRIMARY_TEST',
  'PRODUCT',
  'c2000000-0000-4000-8000-000000000001',
  'trigger evidence test'
);

-- Trigger subject cannot attach a Household-owned object from another Household.
do $$
begin
  begin
    insert into fridge.alert_trigger_subject (
      alert_trigger_subject_id,
      household_id,
      alert_id,
      subject_role,
      subject_kind,
      storage_location_id,
      evaluation_evidence
    ) values (
      'c7000000-0000-4000-8000-000000000002',
      'c1000000-0000-4000-8000-000000000001',
      'c6000000-0000-4000-8000-000000000001',
      'PRIMARY_TEST',
      'STORAGE_LOCATION',
      'c3000000-0000-4000-8000-000000000002',
      'wrong household trigger test'
    );

    raise exception 'cross-Household AlertTriggerSubject unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.notification_delivery (
  notification_delivery_id,
  household_id,
  alert_id,
  channel_code,
  recipient_identity,
  destination_identity,
  delivery_state,
  attempt_no,
  attempted_at,
  delivered_at
) values (
  'c8000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c6000000-0000-4000-8000-000000000001',
  'TEST_CHANNEL',
  'recipient-test',
  'destination-test',
  'TEST_DELIVERED',
  1,
  '2026-02-01T10:01:00Z',
  '2026-02-01T10:02:00Z'
);

-- Delivered time cannot precede attempt time.
do $$
begin
  begin
    insert into fridge.notification_delivery (
      notification_delivery_id,
      household_id,
      alert_id,
      channel_code,
      recipient_identity,
      destination_identity,
      delivery_state,
      attempt_no,
      attempted_at,
      delivered_at
    ) values (
      'c8000000-0000-4000-8000-000000000002',
      'c1000000-0000-4000-8000-000000000001',
      'c6000000-0000-4000-8000-000000000001',
      'TEST_CHANNEL',
      'recipient-test',
      'destination-test',
      'TEST_DELIVERED',
      2,
      '2026-02-01T10:05:00Z',
      '2026-02-01T10:04:00Z'
    );

    raise exception 'delivery before attempt unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

rollback;
