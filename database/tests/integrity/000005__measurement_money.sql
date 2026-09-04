-- FridgeScanner DB-02 integrity checks for 000005__measurement_money.sql

begin;

insert into fridge.measurement_dimension (dimension_code, display_name)
values
  ('COUNT_TEST', 'Count test'),
  ('MASS_TEST', 'Mass test');

insert into fridge.measurement_unit (
  measurement_unit_id,
  unit_code,
  dimension_code,
  symbol,
  display_name
) values
  ('31000000-0000-4000-8000-000000000001', 'COUNT_UNIT_TEST', 'COUNT_TEST', 'u', 'Count unit'),
  ('31000000-0000-4000-8000-000000000002', 'MASS_UNIT_TEST', 'MASS_TEST', 'g', 'Mass unit');

insert into fridge.measurement_conversion_rule (
  measurement_conversion_rule_id,
  rule_family_id,
  version_no,
  conversion_kind,
  source_unit_id,
  target_unit_id,
  factor_num,
  factor_den,
  effective_from
) values (
  '32000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000010',
  1,
  'EXACT_FACTOR',
  '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',
  1,
  3,
  '2026-01-01T00:00:00Z'
);

-- Exact 1 × 1/3 = 1/3 succeeds without decimal approximation.
insert into fridge.measurement_conversion_evidence (
  measurement_conversion_evidence_id,
  measurement_conversion_rule_id,
  source_unit_id,
  source_quantity_num,
  source_quantity_den,
  target_unit_id,
  target_quantity_num,
  target_quantity_den,
  applied_factor_num,
  applied_factor_den,
  evaluation_anchor
) values (
  '33000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  1,
  1,
  '31000000-0000-4000-8000-000000000002',
  1,
  3,
  1,
  3,
  '2026-01-02T00:00:00Z'
);

-- Rounded approximation must not satisfy the exact-result check.
do $$
begin
  begin
    insert into fridge.measurement_conversion_evidence (
      measurement_conversion_evidence_id,
      measurement_conversion_rule_id,
      source_unit_id,
      source_quantity_num,
      source_quantity_den,
      target_unit_id,
      target_quantity_num,
      target_quantity_den,
      applied_factor_num,
      applied_factor_den,
      evaluation_anchor
    ) values (
      '33000000-0000-4000-8000-000000000002',
      '32000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      1,
      1,
      '31000000-0000-4000-8000-000000000002',
      333333,
      1000000,
      1,
      3,
      '2026-01-02T00:00:00Z'
    );

    raise exception 'rounded target unexpectedly satisfied exact rational conversion';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- Contextual rule requires a versioned contract identity.
do $$
begin
  begin
    insert into fridge.measurement_conversion_rule (
      measurement_conversion_rule_id,
      rule_family_id,
      version_no,
      conversion_kind,
      source_unit_id,
      target_unit_id,
      effective_from
    ) values (
      '32000000-0000-4000-8000-000000000002',
      '32000000-0000-4000-8000-000000000020',
      1,
      'CONTEXTUAL_FACTOR',
      '31000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      '2026-01-01T00:00:00Z'
    );

    raise exception 'contextual conversion without contract identity unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into fridge.measurement_conversion_rule (
  measurement_conversion_rule_id,
  rule_family_id,
  version_no,
  conversion_kind,
  source_unit_id,
  target_unit_id,
  context_contract_code,
  context_contract_version,
  effective_from
) values (
  '32000000-0000-4000-8000-000000000003',
  '32000000-0000-4000-8000-000000000030',
  1,
  'CONTEXTUAL_FACTOR',
  '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',
  'TEST_CONTEXT',
  '1',
  '2026-01-01T00:00:00Z'
);

insert into fridge.measurement_conversion_evidence (
  measurement_conversion_evidence_id,
  measurement_conversion_rule_id,
  source_unit_id,
  source_quantity_num,
  source_quantity_den,
  target_unit_id,
  target_quantity_num,
  target_quantity_den,
  applied_factor_num,
  applied_factor_den,
  evaluation_anchor,
  context_contract_code,
  context_contract_version
) values (
  '33000000-0000-4000-8000-000000000003',
  '32000000-0000-4000-8000-000000000003',
  '31000000-0000-4000-8000-000000000001',
  2,
  1,
  '31000000-0000-4000-8000-000000000002',
  5,
  1,
  5,
  2,
  '2026-01-02T00:00:00Z',
  'TEST_CONTEXT',
  '1'
);

insert into fridge.measurement_conversion_evidence_input (
  measurement_conversion_evidence_input_id,
  measurement_conversion_evidence_id,
  input_name,
  input_quantity_num,
  input_quantity_den,
  measurement_unit_id
) values (
  '34000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000003',
  'contextual_basis',
  5,
  2,
  '31000000-0000-4000-8000-000000000002'
);

-- Currency identity is explicit and ISO-style alpha-3.
insert into fridge.currency (currency_code, display_name)
values ('BRL', 'Brazilian Real');

do $$
begin
  begin
    insert into fridge.currency (currency_code, display_name)
    values ('brl', 'Invalid lower-case code');

    raise exception 'invalid currency code unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

-- No arbitrary maximum scale from DB-00/DB-01 is imposed.
insert into fridge.money_rounding_policy (
  money_rounding_policy_id,
  policy_family_id,
  version_no,
  currency_code,
  decimal_scale,
  rounding_algorithm_code,
  rounding_algorithm_version,
  effective_from
) values (
  '35000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000010',
  1,
  'BRL',
  30,
  'TEST_ROUND',
  '1',
  '2026-01-01T00:00:00Z'
);

rollback;
