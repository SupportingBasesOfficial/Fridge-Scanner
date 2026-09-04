-- FridgeScanner DB-02 integrity checks for 000029__product_identifier_contract_guards.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('e1000000-0000-4000-8000-000000000001', 'Identifier household A'),
  ('e1000000-0000-4000-8000-000000000002', 'Identifier household B');

insert into fridge.product (
  product_id, catalog_scope, owner_household_id, canonical_name
) values
  ('e2000000-0000-4000-8000-000000000001', 'GLOBAL', null, 'Identifier global product'),
  ('e2000000-0000-4000-8000-000000000002', 'HOUSEHOLD', 'e1000000-0000-4000-8000-000000000001', 'Identifier private A product'),
  ('e2000000-0000-4000-8000-000000000003', 'HOUSEHOLD', 'e1000000-0000-4000-8000-000000000002', 'Identifier private B product');

insert into fridge.product_identifier_normalization_rule (
  normalization_rule_id, scheme_code, namespace_mode, issuer_namespace,
  rule_version, normalization_algorithm_code, normalization_algorithm_version,
  effective_from
) values
  (
    'e3000000-0000-4000-8000-000000000001',
    'GTIN_TEST', 'GLOBAL', null, 1, 'TEST_NORMALIZE', '1', '2026-01-01T00:00:00Z'
  ),
  (
    'e3000000-0000-4000-8000-000000000002',
    'LOCAL_SKU_TEST', 'ISSUER_SCOPED', 'issuer-a', 1, 'TEST_NORMALIZE', '1', '2026-01-01T00:00:00Z'
  );

-- Canonical global identifier on global Product is valid.
insert into fridge.product_identifier (
  product_identifier_id, product_id, scheme_code, issuer_namespace,
  source_value, normalized_value, normalization_rule_id
) values (
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'GTIN_TEST', null, ' 123 ', '123',
  'e3000000-0000-4000-8000-000000000001'
);
select fridge_internal.assert_product_identifier_contract('e4000000-0000-4000-8000-000000000001');

-- Rule scheme cannot be relabeled by ProductIdentifier.
do $$
begin
  begin
    insert into fridge.product_identifier (
      product_identifier_id, product_id, scheme_code,
      source_value, normalized_value, normalization_rule_id
    ) values (
      'e4000000-0000-4000-8000-000000000002',
      'e2000000-0000-4000-8000-000000000001',
      'WRONG_SCHEME', '123', '123',
      'e3000000-0000-4000-8000-000000000001'
    );
    perform fridge_internal.assert_product_identifier_contract('e4000000-0000-4000-8000-000000000002');
    raise exception 'ProductIdentifier scheme mismatch unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- GLOBAL canonical namespace cannot attach to private Product.
do $$
begin
  begin
    insert into fridge.product_identifier (
      product_identifier_id, product_id, scheme_code,
      source_value, normalized_value, normalization_rule_id
    ) values (
      'e4000000-0000-4000-8000-000000000003',
      'e2000000-0000-4000-8000-000000000002',
      'GTIN_TEST', '456', '456',
      'e3000000-0000-4000-8000-000000000001'
    );
    perform fridge_internal.assert_product_identifier_contract('e4000000-0000-4000-8000-000000000003');
    raise exception 'GLOBAL canonical identifier on private Product unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Issuer-scoped namespace must equal the exact normalization rule issuer.
insert into fridge.product_identifier (
  product_identifier_id, product_id, scheme_code, issuer_namespace,
  source_value, normalized_value, normalization_rule_id
) values (
  'e4000000-0000-4000-8000-000000000004',
  'e2000000-0000-4000-8000-000000000002',
  'LOCAL_SKU_TEST', 'issuer-a', 'abc', 'ABC',
  'e3000000-0000-4000-8000-000000000002'
);
select fridge_internal.assert_product_identifier_contract('e4000000-0000-4000-8000-000000000004');

do $$
begin
  begin
    insert into fridge.product_identifier (
      product_identifier_id, product_id, scheme_code, issuer_namespace,
      source_value, normalized_value, normalization_rule_id
    ) values (
      'e4000000-0000-4000-8000-000000000005',
      'e2000000-0000-4000-8000-000000000002',
      'LOCAL_SKU_TEST', 'issuer-b', 'def', 'DEF',
      'e3000000-0000-4000-8000-000000000002'
    );
    perform fridge_internal.assert_product_identifier_contract('e4000000-0000-4000-8000-000000000005');
    raise exception 'issuer namespace mismatch unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Unnormalized staged claim may omit rule and normalized value.
insert into fridge.staged_identifier_claim (
  staged_identifier_claim_id, household_id, candidate_product_id,
  scheme_code, source_value, observed_at
) values (
  'e5000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002',
  'UNKNOWN_TEST', 'raw', '2026-01-02T00:00:00Z'
);
select fridge_internal.assert_staged_identifier_claim_contract('e5000000-0000-4000-8000-000000000001');

-- A normalized staged value cannot exist without its exact rule.
do $$
begin
  begin
    insert into fridge.staged_identifier_claim (
      staged_identifier_claim_id, household_id, scheme_code,
      source_value, normalized_value, observed_at
    ) values (
      'e5000000-0000-4000-8000-000000000002',
      'e1000000-0000-4000-8000-000000000001',
      'GTIN_TEST', '123', '123', '2026-01-02T00:00:00Z'
    );
    perform fridge_internal.assert_staged_identifier_claim_contract('e5000000-0000-4000-8000-000000000002');
    raise exception 'staged normalized value without rule unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Candidate Product is deliberately private and must belong to the same Household.
do $$
begin
  begin
    insert into fridge.staged_identifier_claim (
      staged_identifier_claim_id, household_id, candidate_product_id,
      scheme_code, source_value, observed_at
    ) values (
      'e5000000-0000-4000-8000-000000000003',
      'e1000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000003',
      'UNKNOWN_TEST', 'raw-b', '2026-01-02T00:00:00Z'
    );
    perform fridge_internal.assert_staged_identifier_claim_contract('e5000000-0000-4000-8000-000000000003');
    raise exception 'staged claim pointing to another Household private Product unexpectedly accepted';
  exception when foreign_key_violation then null;
           when check_violation then null;
  end;
end;
$$;

-- Deferred constraint trigger shape is part of the enforcement contract.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from pg_catalog.pg_trigger
   where tgname in ('product_identifier_contract_guard', 'staged_identifier_claim_contract_guard')
     and (tgconstraint = 0 or not tgdeferrable or not tginitdeferred);
  if v_bad <> 0 then
    raise exception 'identifier guards are not deferred constraint triggers';
  end if;
end;
$$;

rollback;
