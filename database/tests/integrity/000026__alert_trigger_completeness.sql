-- FridgeScanner DB-02 integrity checks for
-- 000026__alert_trigger_completeness.sql

begin;

insert into fridge.household (household_id, display_name)
values ('a1000000-1000-4000-8000-000000000001', 'Alert completeness household');

insert into fridge.alert_rule (
  alert_rule_id,
  household_id,
  rule_kind,
  condition_contract_code,
  condition_contract_version,
  lifecycle_status,
  version_no
) values (
  'a2000000-1000-4000-8000-000000000001',
  'a1000000-1000-4000-8000-000000000001',
  'TEST_RULE',
  'test.condition',
  '1',
  'TEST_ACTIVE',
  1
);

insert into fridge.alert_rule_subject (
  alert_rule_subject_id,
  household_id,
  alert_rule_id,
  subject_kind
) values (
  'a3000000-1000-4000-8000-000000000001',
  'a1000000-1000-4000-8000-000000000001',
  'a2000000-1000-4000-8000-000000000001',
  'HOUSEHOLD'
);

-- Alert without any trigger evidence is incomplete.
do $$
begin
  begin
    insert into fridge.alert (
      alert_id,
      household_id,
      alert_rule_id,
      alert_state,
      detected_at,
      evaluation_contract_version,
      provenance
    ) values (
      'a4000000-1000-4000-8000-000000000001',
      'a1000000-1000-4000-8000-000000000001',
      'a2000000-1000-4000-8000-000000000001',
      'TEST_OPEN',
      '2026-02-05T10:00:00Z',
      '1',
      'missing trigger test'
    );

    perform fridge_internal.assert_alert_trigger_completeness(
      'a1000000-1000-4000-8000-000000000001',
      'a4000000-1000-4000-8000-000000000001'
    );
    raise exception 'Alert without trigger evidence unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- A non-primary trigger alone is insufficient.
do $$
begin
  begin
    insert into fridge.alert (
      alert_id,
      household_id,
      alert_rule_id,
      alert_state,
      detected_at,
      evaluation_contract_version,
      provenance
    ) values (
      'a4000000-1000-4000-8000-000000000002',
      'a1000000-1000-4000-8000-000000000001',
      'a2000000-1000-4000-8000-000000000001',
      'TEST_OPEN',
      '2026-02-05T10:01:00Z',
      '1',
      'non-primary trigger test'
    );

    insert into fridge.alert_trigger_subject (
      alert_trigger_subject_id,
      household_id,
      alert_id,
      subject_role,
      subject_kind,
      evaluation_evidence,
      is_primary
    ) values (
      'a5000000-1000-4000-8000-000000000001',
      'a1000000-1000-4000-8000-000000000001',
      'a4000000-1000-4000-8000-000000000002',
      'supporting',
      'HOUSEHOLD',
      'supporting evidence',
      false
    );

    perform fridge_internal.assert_alert_trigger_completeness(
      'a1000000-1000-4000-8000-000000000001',
      'a4000000-1000-4000-8000-000000000002'
    );
    raise exception 'Alert with only non-primary trigger unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- At least one explicit primary trigger satisfies the explainability invariant.
insert into fridge.alert (
  alert_id,
  household_id,
  alert_rule_id,
  alert_state,
  detected_at,
  evaluation_contract_version,
  provenance
) values (
  'a4000000-1000-4000-8000-000000000003',
  'a1000000-1000-4000-8000-000000000001',
  'a2000000-1000-4000-8000-000000000001',
  'TEST_OPEN',
  '2026-02-05T10:02:00Z',
  '1',
  'valid primary trigger test'
);

insert into fridge.alert_trigger_subject (
  alert_trigger_subject_id,
  household_id,
  alert_id,
  subject_role,
  subject_order,
  subject_kind,
  evaluation_evidence,
  is_primary
) values
  (
    'a5000000-1000-4000-8000-000000000002',
    'a1000000-1000-4000-8000-000000000001',
    'a4000000-1000-4000-8000-000000000003',
    'detected-subject',
    0,
    'HOUSEHOLD',
    'primary evidence',
    true
  ),
  (
    'a5000000-1000-4000-8000-000000000003',
    'a1000000-1000-4000-8000-000000000001',
    'a4000000-1000-4000-8000-000000000003',
    'corroborating-subject',
    1,
    'HOUSEHOLD',
    'secondary evidence',
    false
  );

select fridge_internal.assert_alert_trigger_completeness(
  'a1000000-1000-4000-8000-000000000001',
  'a4000000-1000-4000-8000-000000000003'
);

-- Both parent and child sides are deferred guards.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_catalog.pg_trigger
   where tgname in (
     'alert_parent_trigger_completeness_ct',
     'alert_trigger_subject_completeness_ct'
   )
     and tgconstraint <> 0
     and tgdeferrable
     and tginitdeferred;

  if v_count <> 2 then
    raise exception 'expected two deferred Alert completeness guards, found %', v_count;
  end if;
end;
$$;

rollback;
