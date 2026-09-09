-- FridgeScanner BE-06 integrity proof
-- 000066__create_purchase.sql

begin;

do $$
declare
  v_wrapper_definition text;
  v_impl_definition text;
  v_time_position integer;
  v_unit_lock_position integer;
begin
  if not exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'fridge'
       and c.relname = 'household_procurement_command_registry'
       and c.relkind = 'r'
  ) then
    raise exception 'BE-06 procurement CommandId registry is missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint c
     where c.conname = 'household_procurement_command_registry_intent_ck'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%CREATE_PURCHASE%'
  ) then
    raise exception 'BE-06 registry must reserve CREATE_PURCHASE as an explicit semantic intent';
  end if;

  if has_table_privilege('fridge_app', 'fridge.purchase', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.purchase', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.purchase', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.purchase_item', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.purchase_item', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.purchase_item', 'DELETE') then
    raise exception 'CreatePurchase must not widen direct Purchase/PurchaseItem DML';
  end if;

  if has_table_privilege('fridge_app', 'fridge.household_purchase_create_command', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_create_command', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.household_purchase_create_command_item_result', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.household_procurement_command_registry', 'SELECT') then
    raise exception 'CreatePurchase internal command state must not become direct runtime data access';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_purchase(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute the governed CreatePurchase wrapper';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.create_household_purchase(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.create_household_purchase(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute CreatePurchase';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_purchase_impl(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not bypass the CreatePurchase payload wrapper';
  end if;

  select pg_catalog.pg_get_functiondef(
    'fridge_internal.create_household_purchase(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) into v_wrapper_definition;

  select pg_catalog.pg_get_functiondef(
    'fridge_internal.create_household_purchase_impl(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) into v_impl_definition;

  if position('INVALID_INPUT' in v_wrapper_definition) = 0
     or position('create_household_purchase_impl' in v_wrapper_definition) = 0 then
    raise exception 'CreatePurchase runtime wrapper must validate payload and delegate to the private implementation';
  end if;

  if position('acquire_household_procurement_admin_authority' in v_impl_definition) = 0 then
    raise exception 'CreatePurchase implementation must revalidate procurement administration authority';
  end if;

  if position('''GLOBAL''::fridge.catalog_scope' in v_impl_definition) = 0
     or position('''HOUSEHOLD''::fridge.catalog_scope' in v_impl_definition) = 0
     or position('owner_household_id = p_household_id' in v_impl_definition) = 0
     or position('p.lifecycle_status = ''ACTIVE''' in v_impl_definition) = 0 then
    raise exception 'CreatePurchase implementation must enforce GLOBAL-or-same-Household current Product visibility';
  end if;

  if position('for key share' in lower(v_impl_definition)) = 0 then
    raise exception 'CreatePurchase implementation must lock Product references against concurrent lifecycle mutation';
  end if;

  if position('u.lifecycle_status = ''ACTIVE''' in v_impl_definition) = 0
     or position('c.lifecycle_status = ''ACTIVE''' in v_impl_definition) = 0 then
    raise exception 'CreatePurchase implementation must require current MeasurementUnit and Currency reference data';
  end if;

  if position('v_existing_semantic_items is distinct from v_semantic_items' in v_impl_definition) = 0 then
    raise exception 'CreatePurchase replay must bind the exact ordered semantic item fingerprint';
  end if;

  if position('pricing_basis_quantity_num' in v_impl_definition) = 0 then
    raise exception 'CreatePurchase implementation must explicitly leave pricing basis outside this first slice';
  end if;

  v_time_position := position('v_committed_at := clock_timestamp()' in v_impl_definition);
  v_unit_lock_position := position('for v_unit_id in' in lower(v_impl_definition));
  if v_time_position = 0
     or v_unit_lock_position = 0
     or v_time_position <= v_unit_lock_position then
    raise exception 'CreatePurchase live occurrence time must be sampled only after governed reference lock waits';
  end if;

  if position('statement_timestamp()' in v_impl_definition) > 0 then
    raise exception 'CreatePurchase must not use pre-serialization statement_timestamp()';
  end if;
end;
$$;

rollback;
