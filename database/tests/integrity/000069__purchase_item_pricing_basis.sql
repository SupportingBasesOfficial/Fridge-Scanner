-- FridgeScanner DB-02 integrity checks for 000069__purchase_item_pricing_basis.sql

begin;

do $$
declare
  v_constraint text;
  v_implementation text;
  v_trigger text;
begin
  select pg_get_constraintdef(oid)
    into v_constraint
    from pg_constraint
   where conname = 'household_procurement_command_registry_intent_ck';

  if v_constraint is null
     or position('CREATE_PURCHASE' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS' in v_constraint) = 0
     or position('COMMIT_PURCHASE_ITEM_PRICING_BASIS' in v_constraint) = 0 then
    raise exception 'BE-06 command registry does not preserve all accepted intents';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_pricing_basis(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks narrow pricing-basis EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.commit_purchase_item_pricing_basis(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.commit_purchase_item_pricing_basis(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly unexpectedly received pricing-basis EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_pricing_basis_impl(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app may directly execute private pricing-basis implementation';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_purchase_item_pricing_basis_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_item_pricing_basis_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_item_pricing_basis_command', 'UPDATE') then
    raise exception 'runtime received direct pricing-basis command-ledger privileges';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_purchase_item_pricing_basis_immutable()',
    'EXECUTE'
  ) then
    raise exception 'runtime may directly execute pricing-basis immutability helper';
  end if;

  select pg_get_functiondef(
    'fridge_internal.commit_purchase_item_pricing_basis_impl(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_implementation;

  if position('acquire_household_procurement_admin_authority' in v_implementation) = 0
     or position('register_household_procurement_command_intent' in v_implementation) = 0
     or position('for key share' in lower(v_implementation)) = 0
     or position('for update' in lower(v_implementation)) = 0
     or position('PRICING_BASIS' in v_implementation) = 0
     or position('measurement_conversion_evidence' in v_implementation) = 0
     or position('pricing_basis_quantity_num' in v_implementation) = 0
     or position('money_rounding_policy_id' in v_implementation) = 0 then
    raise exception 'private pricing-basis implementation is missing required authority/serialization/evidence semantics';
  end if;

  select pg_get_functiondef(
    'fridge_internal.guard_purchase_item_pricing_basis_immutable()'::regprocedure
  ) into v_trigger;
  if position('old.pricing_basis_quantity_num is not null' in lower(v_trigger)) = 0
     or position('55000' in v_trigger) = 0 then
    raise exception 'pricing-basis immutability guard is incomplete';
  end if;
end;
$$;

-- Prove the trigger allows first commitment but rejects destructive rewrite.
insert into fridge.household (household_id, display_name)
values ('c7200001-0b06-4720-8720-000000000001', 'BE06 pricing basis integrity household');

insert into fridge.currency (currency_code, display_name)
values ('PBX', 'BE06 pricing basis integrity currency');

insert into fridge.measurement_dimension (dimension_code, display_name)
values ('BE06_PRICE_DIM', 'BE06 pricing basis integrity dimension');

insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name)
values (
  'c7200002-0b06-4720-8720-000000000002',
  'BE06_PRICE_UNIT',
  'BE06_PRICE_DIM',
  'BE06 pricing basis integrity unit'
);

insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
values (
  'c7200003-0b06-4720-8720-000000000003',
  'GLOBAL',
  'BE06 pricing basis integrity product',
  'ACTIVE'
);

insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at)
values (
  'c7200004-0b06-4720-8720-000000000004',
  'c7200001-0b06-4720-8720-000000000001',
  'PBX',
  '2026-09-09T12:00:00Z'
);

insert into fridge.purchase_item (
  purchase_item_id, household_id, purchase_id, product_id,
  purchased_quantity_num, purchased_quantity_den, purchased_unit_id
) values (
  'c7200005-0b06-4720-8720-000000000005',
  'c7200001-0b06-4720-8720-000000000001',
  'c7200004-0b06-4720-8720-000000000004',
  'c7200003-0b06-4720-8720-000000000003',
  2, 1,
  'c7200002-0b06-4720-8720-000000000002'
);

update fridge.purchase_item
   set pricing_basis_quantity_num = 1,
       pricing_basis_quantity_den = 1,
       pricing_basis_unit_id = 'c7200002-0b06-4720-8720-000000000002'
 where purchase_item_id = 'c7200005-0b06-4720-8720-000000000005';

do $$
begin
  begin
    update fridge.purchase_item
       set pricing_basis_quantity_num = 2
     where purchase_item_id = 'c7200005-0b06-4720-8720-000000000005';
    raise exception 'committed pricing basis unexpectedly mutable';
  exception
    when sqlstate '55000' then
      null;
  end;
end;
$$;

rollback;
