-- FridgeScanner DB-02 integrity checks for 000004__product_identifiers.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('21000000-0000-4000-8000-000000000001', 'Identifier Household A'),
  ('21000000-0000-4000-8000-000000000002', 'Identifier Household B');

insert into fridge.product (
  product_id,
  catalog_scope,
  canonical_name
) values (
  '22000000-0000-4000-8000-000000000001',
  'GLOBAL',
  'Global Product'
);

insert into fridge.product (
  product_id,
  catalog_scope,
  owner_household_id,
  canonical_name
) values
  (
    '22000000-0000-4000-8000-000000000002',
    'HOUSEHOLD',
    '21000000-0000-4000-8000-000000000001',
    'Private Product A'
  ),
  (
    '22000000-0000-4000-8000-000000000003',
    'HOUSEHOLD',
    '21000000-0000-4000-8000-000000000002',
    'Private Product B'
  );

insert into fridge.product_identifier_normalization_rule (
  normalization_rule_id,
  scheme_code,
  namespace_mode,
  issuer_namespace,
  rule_version,
  normalization_algorithm_code,
  normalization_algorithm_version,
  effective_from
) values
  (
    '23000000-0000-4000-8000-000000000001',
    'GTIN_TEST',
    'GLOBAL',
    null,
    1,
    'GTIN_TEST_NORMALIZE',
    '1',
    '2026-01-01T00:00:00Z'
  ),
  (
    '23000000-0000-4000-8000-000000000002',
    'SKU_TEST',
    'ISSUER_SCOPED',
    'RETAILER_A',
    1,
    'SKU_TEST_NORMALIZE',
    '1',
    '2026-01-01T00:00:00Z'
  );

-- Duplicate GLOBAL normalization-rule version must fail even with NULL issuer.
do $$
begin
  begin
    insert into fridge.product_identifier_normalization_rule (
      normalization_rule_id,
      scheme_code,
      namespace_mode,
      issuer_namespace,
      rule_version,
      normalization_algorithm_code,
      normalization_algorithm_version,
      effective_from
    ) values (
      '23000000-0000-4000-8000-000000000003',
      'GTIN_TEST',
      'GLOBAL',
      null,
      1,
      'OTHER',
      '1',
      '2026-02-01T00:00:00Z'
    );

    raise exception 'duplicate global normalization-rule version unexpectedly accepted';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

insert into fridge.product_identifier (
  product_identifier_id,
  product_id,
  scheme_code,
  issuer_namespace,
  source_value,
  normalized_value,
  normalization_rule_id
) values (
  '24000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'GTIN_TEST',
  null,
  '00012345678905',
  '00012345678905',
  '23000000-0000-4000-8000-000000000001'
);

-- Duplicate current global canonical key must fail.
do $$
begin
  begin
    insert into fridge.product_identifier (
      product_identifier_id,
      product_id,
      scheme_code,
      issuer_namespace,
      source_value,
      normalized_value,
      normalization_rule_id
    ) values (
      '24000000-0000-4000-8000-000000000002',
      '22000000-0000-4000-8000-000000000001',
      'GTIN_TEST',
      null,
      '00012345678905',
      '00012345678905',
      '23000000-0000-4000-8000-000000000001'
    );

    raise exception 'duplicate canonical global identifier unexpectedly accepted';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

-- Staged Household evidence for the same global observed value does not consume
-- or collide with canonical ProductIdentifier uniqueness.
insert into fridge.staged_identifier_claim (
  staged_identifier_claim_id,
  household_id,
  candidate_product_id,
  scheme_code,
  source_value,
  normalized_value,
  normalization_rule_id,
  observed_at
) values (
  '25000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000002',
  'GTIN_TEST',
  '00012345678905',
  '00012345678905',
  '23000000-0000-4000-8000-000000000001',
  '2026-01-02T00:00:00Z'
);

-- A staged claim cannot point at another Household's private Product.
do $$
begin
  begin
    insert into fridge.staged_identifier_claim (
      staged_identifier_claim_id,
      household_id,
      candidate_product_id,
      scheme_code,
      source_value,
      observed_at
    ) values (
      '25000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000003',
      'UNKNOWN_TEST',
      'raw-value',
      '2026-01-02T00:00:00Z'
    );

    raise exception 'cross-Household staged Product candidate unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- A staged claim may remain unresolved with no normalization rule/value.
insert into fridge.staged_identifier_claim (
  staged_identifier_claim_id,
  household_id,
  scheme_code,
  source_value,
  observed_at
) values (
  '25000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000001',
  'UNKNOWN_TEST',
  ' raw unknown value ',
  '2026-01-02T00:00:00Z'
);

rollback;
