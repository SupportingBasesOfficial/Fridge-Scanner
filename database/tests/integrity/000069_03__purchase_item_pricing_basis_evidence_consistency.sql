-- FridgeScanner DB-02 integrity checks for
-- 000069_03__purchase_item_pricing_basis_evidence_consistency.sql

begin;

do $$
declare
  v_trigger text;
begin
  if has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_purchase_item_pricing_basis_evidence_consistency()',
    'EXECUTE'
  ) then
    raise exception 'runtime may directly execute pricing-basis evidence guard';
  end if;

  select pg_get_functiondef(
    'fridge_internal.guard_purchase_item_pricing_basis_evidence_consistency()'::regprocedure
  ) into v_trigger;

  if position('e.source_quantity_num = new.purchased_quantity_num' in v_trigger) = 0
     or position('e.source_quantity_den = new.purchased_quantity_den' in v_trigger) = 0
     or position('e.target_unit_id = new.pricing_basis_unit_id' in v_trigger) = 0
     or position('P6N01' in v_trigger) = 0
     or position('e.target_quantity_num = new.pricing_basis_quantity_num' in v_trigger) <> 0
     or position('e.target_quantity_den = new.pricing_basis_quantity_den' in v_trigger) <> 0 then
    raise exception 'pricing-basis evidence guard does not preserve converted-quantity/basis-quantity separation';
  end if;
end;
$$;

insert into fridge.household (household_id, display_name)
values ('c7400001-0b06-4740-8740-000000000001', 'BE06 pricing evidence household');

insert into fridge.currency (currency_code, display_name)
values ('PEX', 'BE06 pricing evidence currency');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('BE06_PRICE_EVIDENCE_DIM', 'BE06 pricing evidence dimension');

insert into fridge.measurement_unit (
  measurement_unit_id, unit_code, dimension_code, display_name
) values
  (
    'c7400002-0b06-4740-8740-000000000002',
    'BE06_PRICE_EVIDENCE_A',
    'BE06_PRICE_EVIDENCE_DIM',
    'BE06 pricing evidence unit A'
  ),
  (
    'c7400003-0b06-4740-8740-000000000003',
    'BE06_PRICE_EVIDENCE_B',
    'BE06_PRICE_EVIDENCE_DIM',
    'BE06 pricing evidence unit B'
  );

insert into fridge.measurement_conversion_rule (
  measurement_conversion_rule_id, rule_family_id, version_no, conversion_kind,
  source_unit_id, target_unit_id, factor_num, factor_den,
  effective_from, lifecycle_status, provenance
) values (
  'c7400004-0b06-4740-8740-000000000004',
  'c7400005-0b06-4740-8740-000000000005',
  1,
  'EXACT_FACTOR',
  'c7400002-0b06-4740-8740-000000000002',
  'c7400003-0b06-4740-8740-000000000003',
  1,
  2,
  '2026-09-09T12:00:00Z',
  'ACTIVE',
  'BE06 pricing evidence integrity rule'
);

insert into fridge.measurement_conversion_evidence (
  measurement_conversion_evidence_id, household_id, measurement_conversion_rule_id,
  source_unit_id, source_quantity_num, source_quantity_den,
  target_unit_id, target_quantity_num, target_quantity_den,
  applied_factor_num, applied_factor_den, evaluation_anchor, provenance
) values (
  'c7400006-0b06-4740-8740-000000000006',
  'c7400001-0b06-4740-8740-000000000001',
  'c7400004-0b06-4740-8740-000000000004',
  'c7400002-0b06-4740-8740-000000000002',
  2,
  1,
  'c7400003-0b06-4740-8740-000000000003',
  1,
  1,
  1,
  2,
  '2026-09-09T12:01:00Z',
  'BE06 exact conversion evidence'
);

insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
values (
  'c7400007-0b06-4740-8740-000000000007',
  'GLOBAL',
  'BE06 pricing evidence product',
  'ACTIVE'
);

insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at)
values (
  'c7400008-0b06-4740-8740-000000000008',
  'c7400001-0b06-4740-8740-000000000001',
  'PEX',
  '2026-09-09T12:02:00Z'
);

insert into fridge.purchase_item (
  purchase_item_id, household_id, purchase_id, product_id,
  purchased_quantity_num, purchased_quantity_den, purchased_unit_id
) values (
  'c7400009-0b06-4740-8740-000000000009',
  'c7400001-0b06-4740-8740-000000000001',
  'c7400008-0b06-4740-8740-000000000008',
  'c7400007-0b06-4740-8740-000000000007',
  2,
  1,
  'c7400002-0b06-4740-8740-000000000002'
);

-- Evidence proves purchased 2 A -> converted 1 B. The quoted pricing basis is
-- intentionally independent: e.g. a price may be quoted per 2 B.
update fridge.purchase_item
   set pricing_basis_quantity_num = 2,
       pricing_basis_quantity_den = 1,
       pricing_basis_unit_id = 'c7400003-0b06-4740-8740-000000000003',
       pricing_conversion_evidence_id = 'c7400006-0b06-4740-8740-000000000006'
 where purchase_item_id = 'c7400009-0b06-4740-8740-000000000009';

-- Evidence must still bind the exact purchased source quantity.
insert into fridge.purchase_item (
  purchase_item_id, household_id, purchase_id, product_id,
  purchased_quantity_num, purchased_quantity_den, purchased_unit_id
) values (
  'c7400010-0b06-4740-8740-000000000010',
  'c7400001-0b06-4740-8740-000000000001',
  'c7400008-0b06-4740-8740-000000000008',
  'c7400007-0b06-4740-8740-000000000007',
  4,
  1,
  'c7400002-0b06-4740-8740-000000000002'
);

do $$
begin
  begin
    update fridge.purchase_item
       set pricing_basis_quantity_num = 2,
           pricing_basis_quantity_den = 1,
           pricing_basis_unit_id = 'c7400003-0b06-4740-8740-000000000003',
           pricing_conversion_evidence_id = 'c7400006-0b06-4740-8740-000000000006'
     where purchase_item_id = 'c7400010-0b06-4740-8740-000000000010';
    raise exception 'mismatched purchased source quantity unexpectedly accepted';
  exception
    when sqlstate 'P6N01' then
      null;
  end;
end;
$$;

rollback;
