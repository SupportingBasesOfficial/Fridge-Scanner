-- FridgeScanner BE-06 integrity proof for 000068__purchase_item_source_money_facts.sql

begin;

do $$
declare
  v_constraint text;
  v_function text;
begin
  select pg_get_constraintdef(oid)
    into v_constraint
    from pg_constraint
   where conname = 'household_procurement_command_registry_intent_ck';

  if v_constraint is null
     or position('CREATE_PURCHASE' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS' in v_constraint) = 0 then
    raise exception 'BE-06 command registry does not preserve both accepted intents';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_source_money_facts(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks narrow PurchaseItem source money EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.commit_purchase_item_source_money_facts(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.commit_purchase_item_source_money_facts(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly unexpectedly received PurchaseItem source money EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_source_money_facts_impl(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app may bypass the source money wrapper and execute the private implementation';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_purchase_item_money_fact_immutable()',
    'EXECUTE'
  ) then
    raise exception 'runtime may directly execute immutable-money trigger helper';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_purchase_item_source_money_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_item_source_money_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_item_source_money_command_result', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_item_source_money_command_result', 'INSERT') then
    raise exception 'runtime received direct command-ledger privileges';
  end if;

  select pg_get_functiondef(
    'fridge_internal.commit_purchase_item_source_money_facts_impl(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)'::regprocedure
  ) into v_function;

  if position('acquire_household_procurement_admin_authority' in v_function) = 0
     or position('register_household_procurement_command_intent' in v_function) = 0
     or position('for key share' in lower(v_function)) = 0
     or position('for update' in lower(v_function)) = 0
     or position('is_source_fact' in v_function) = 0
     or position('money_rounding_policy_id' in v_function) = 0 then
    raise exception 'PurchaseItem source money implementation is missing required authority/serialization/source semantics';
  end if;
end;
$$;

insert into fridge.user_profile (user_id, display_name)
values ('a6800001-0b06-4680-8680-000000000001', 'BE06 money integrity actor');

insert into fridge.household (household_id, display_name)
values ('a6800002-0b06-4680-8680-000000000002', 'BE06 money integrity household');

insert into fridge.currency (currency_code, display_name)
values ('MXN', 'BE06 money integrity currency');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('BE06_MONEY_COUNT', 'BE06 money count');

insert into fridge.measurement_unit (
  measurement_unit_id, unit_code, dimension_code, display_name
) values (
  'a6800003-0b06-4680-8680-000000000003',
  'BE06_MONEY_EACH',
  'BE06_MONEY_COUNT',
  'BE06 money each'
);

insert into fridge.product (
  product_id, catalog_scope, canonical_name, lifecycle_status
) values (
  'a6800004-0b06-4680-8680-000000000004',
  'GLOBAL',
  'BE06 money integrity product',
  'ACTIVE'
);

insert into fridge.purchase (
  purchase_id, household_id, transaction_currency_code, occurred_at
) values (
  'a6800005-0b06-4680-8680-000000000005',
  'a6800002-0b06-4680-8680-000000000002',
  'MXN',
  '2026-09-09T12:00:00Z'
);

insert into fridge.purchase_item (
  purchase_item_id,
  household_id,
  purchase_id,
  product_id,
  purchased_quantity_num,
  purchased_quantity_den,
  purchased_unit_id
) values (
  'a6800006-0b06-4680-8680-000000000006',
  'a6800002-0b06-4680-8680-000000000002',
  'a6800005-0b06-4680-8680-000000000005',
  'a6800004-0b06-4680-8680-000000000004',
  1,
  1,
  'a6800003-0b06-4680-8680-000000000003'
);

insert into fridge.purchase_item_money_fact (
  purchase_item_money_fact_id,
  household_id,
  purchase_id,
  purchase_item_id,
  semantic_role,
  amount,
  currency_code,
  is_source_fact,
  provenance
) values (
  'a6800007-0b06-4680-8680-000000000007',
  'a6800002-0b06-4680-8680-000000000002',
  'a6800005-0b06-4680-8680-000000000005',
  'a6800006-0b06-4680-8680-000000000006',
  'LINE_GROSS',
  12.34,
  'MXN',
  true,
  'integrity source'
);

do $$
begin
  begin
    insert into fridge.purchase_item_money_fact (
      purchase_item_money_fact_id,
      household_id,
      purchase_id,
      purchase_item_id,
      semantic_role,
      amount,
      currency_code,
      is_source_fact,
      provenance
    ) values (
      'a6800008-0b06-4680-8680-000000000008',
      'a6800002-0b06-4680-8680-000000000002',
      'a6800005-0b06-4680-8680-000000000005',
      'a6800006-0b06-4680-8680-000000000006',
      'LINE_GROSS',
      12.34,
      'MXN',
      true,
      'duplicate source'
    );
    raise exception 'duplicate PurchaseItem source role unexpectedly accepted';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

do $$
begin
  begin
    update fridge.purchase_item_money_fact
       set amount = 99
     where purchase_item_money_fact_id = 'a6800007-0b06-4680-8680-000000000007';
    raise exception 'committed PurchaseItem money fact unexpectedly mutable';
  exception
    when sqlstate '55000' then
      null;
  end;
end;
$$;

rollback;
