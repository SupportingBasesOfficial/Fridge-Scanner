-- FridgeScanner DB-02 integrity checks for 000070__purchase_item_pricing_extension.sql

begin;

do $$
declare
  v_constraint text;
  v_function text;
  v_guard text;
begin
  select pg_get_constraintdef(oid)
    into v_constraint
    from pg_constraint
   where conname = 'household_procurement_command_registry_intent_ck';
  if v_constraint is null
     or position('COMMIT_PURCHASE_ITEM_PRICING_EXTENSION' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_PRICING_BASIS' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS' in v_constraint) = 0 then
    raise exception 'BE-06 command registry lost an accepted intent';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_pricing_extension(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks narrow pricing-extension EXECUTE';
  end if;
  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.commit_purchase_item_pricing_extension(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.commit_purchase_item_pricing_extension(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly unexpectedly received pricing-extension EXECUTE';
  end if;
  if has_table_privilege('fridge_app', 'fridge.household_purchase_item_pricing_extension_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_item_pricing_extension_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_item_pricing_extension_command', 'UPDATE') then
    raise exception 'runtime received direct pricing-extension command-ledger privileges';
  end if;
  if has_function_privilege(
    'fridge_app', 'fridge_internal.guard_purchase_item_pricing_discrepancy_history()', 'EXECUTE'
  ) then
    raise exception 'runtime may directly execute discrepancy history guard';
  end if;

  select pg_get_functiondef(
    'fridge_internal.commit_purchase_item_pricing_extension(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
  ) into v_function;
  if position('acquire_household_procurement_admin_authority' in v_function) = 0
     or position('register_household_procurement_command_intent' in v_function) = 0
     or position('DECIMAL_HALF_AWAY_FROM_ZERO' in v_function) = 0
     or position('div(' in v_function) = 0
     or position('mod(' in v_function) = 0
     or position('purchase_item_pricing_discrepancy' in v_function) = 0
     or position('SOURCE_LINE_GROSS_MISMATCH' in v_function) = 0
     or position('occurred_at' in v_function) = 0 then
    raise exception 'pricing-extension boundary lacks required exact extension/rounding/reconciliation semantics';
  end if;

  select pg_get_functiondef(
    'fridge_internal.guard_purchase_item_pricing_discrepancy_history()'::regprocedure
  ) into v_guard;
  if position("tg_op = 'DELETE'" in v_guard) = 0
     or position('new.source_amount is distinct from old.source_amount' in v_guard) = 0
     or position('new.computed_amount is distinct from old.computed_amount' in v_guard) = 0
     or position('new.resolution_status is distinct from old.resolution_status' in v_guard) <> 0 then
    raise exception 'pricing-discrepancy guard does not preserve evidence/resolution separation';
  end if;
end;
$$;

-- Prove the computed LINE_GROSS uniqueness is independent from source gross.
insert into fridge.household (household_id, display_name)
values ('c7500001-0b06-4750-8750-000000000001', 'BE06 pricing extension integrity household');
insert into fridge.currency (currency_code, display_name)
values ('PGX', 'BE06 pricing extension integrity currency');
insert into fridge.measurement_dimension (dimension_code, display_name)
values ('BE06_EXT_DIM', 'BE06 pricing extension integrity dimension');
insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name)
values ('c7500002-0b06-4750-8750-000000000002', 'BE06_EXT_UNIT', 'BE06_EXT_DIM', 'BE06 extension unit');
insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
values ('c7500003-0b06-4750-8750-000000000003', 'GLOBAL', 'BE06 extension product', 'ACTIVE');
insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at)
values ('c7500004-0b06-4750-8750-000000000004', 'c7500001-0b06-4750-8750-000000000001', 'PGX', '2026-09-09T12:00:00Z');
insert into fridge.purchase_item (
  purchase_item_id, household_id, purchase_id, product_id,
  purchased_quantity_num, purchased_quantity_den, purchased_unit_id,
  pricing_basis_quantity_num, pricing_basis_quantity_den, pricing_basis_unit_id
) values (
  'c7500005-0b06-4750-8750-000000000005',
  'c7500001-0b06-4750-8750-000000000001',
  'c7500004-0b06-4750-8750-000000000004',
  'c7500003-0b06-4750-8750-000000000003',
  1, 1, 'c7500002-0b06-4750-8750-000000000002',
  1, 1, 'c7500002-0b06-4750-8750-000000000002'
);
insert into fridge.money_rounding_policy (
  money_rounding_policy_id, policy_family_id, version_no, currency_code,
  decimal_scale, rounding_algorithm_code, rounding_algorithm_version,
  effective_from, lifecycle_status
) values (
  'c7500006-0b06-4750-8750-000000000006',
  'c7500007-0b06-4750-8750-000000000007', 1, 'PGX', 2,
  'DECIMAL_HALF_AWAY_FROM_ZERO', '1', '2026-09-01T00:00:00Z', 'ACTIVE'
);
insert into fridge.purchase_item_money_fact (
  purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
  semantic_role, amount, currency_code, is_source_fact, money_rounding_policy_id, provenance
) values
  ('c7500008-0b06-4750-8750-000000000008', 'c7500001-0b06-4750-8750-000000000001', 'c7500004-0b06-4750-8750-000000000004', 'c7500005-0b06-4750-8750-000000000005', 'LINE_GROSS', 1.01, 'PGX', true, null, 'source'),
  ('c7500009-0b06-4750-8750-000000000009', 'c7500001-0b06-4750-8750-000000000001', 'c7500004-0b06-4750-8750-000000000004', 'c7500005-0b06-4750-8750-000000000005', 'LINE_GROSS', 1.00, 'PGX', false, 'c7500006-0b06-4750-8750-000000000006', 'computed');

do $$
begin
  begin
    insert into fridge.purchase_item_money_fact (
      purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
      semantic_role, amount, currency_code, is_source_fact, money_rounding_policy_id, provenance
    ) values (
      'c7500010-0b06-4750-8750-000000000010', 'c7500001-0b06-4750-8750-000000000001',
      'c7500004-0b06-4750-8750-000000000004', 'c7500005-0b06-4750-8750-000000000005',
      'LINE_GROSS', 1.00, 'PGX', false, 'c7500006-0b06-4750-8750-000000000006', 'duplicate computed'
    );
    raise exception 'duplicate computed LINE_GROSS unexpectedly accepted';
  exception when unique_violation then null;
  end;
end;
$$;

insert into fridge.purchase_item_pricing_discrepancy (
  purchase_item_pricing_discrepancy_id, household_id, purchase_id, purchase_item_id,
  source_amount, computed_amount, currency_code, money_rounding_policy_id,
  reason, resolution_status
) values (
  'c7500011-0b06-4750-8750-000000000011', 'c7500001-0b06-4750-8750-000000000001',
  'c7500004-0b06-4750-8750-000000000004', 'c7500005-0b06-4750-8750-000000000005',
  1.01, 1.00, 'PGX', 'c7500006-0b06-4750-8750-000000000006',
  'SOURCE_LINE_GROSS_MISMATCH', 'OPEN'
);

-- Resolution fields are intentionally future-governable; evidence is not.
update fridge.purchase_item_pricing_discrepancy
   set resolution_status = 'ACKNOWLEDGED', resolution_provenance = 'future governed resolution proof'
 where purchase_item_pricing_discrepancy_id = 'c7500011-0b06-4750-8750-000000000011';

do $$
begin
  begin
    update fridge.purchase_item_pricing_discrepancy
       set computed_amount = 1.01
     where purchase_item_pricing_discrepancy_id = 'c7500011-0b06-4750-8750-000000000011';
    raise exception 'pricing discrepancy evidence unexpectedly mutable';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from fridge.purchase_item_pricing_discrepancy
     where purchase_item_pricing_discrepancy_id = 'c7500011-0b06-4750-8750-000000000011';
    raise exception 'pricing discrepancy unexpectedly deletable';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
