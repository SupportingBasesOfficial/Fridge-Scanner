-- FridgeScanner BE-06 integrity proof
-- 000066_02__create_purchase_payload_boundary.sql

begin;

do $$
declare
  v_wrapper_def text;
  v_impl_def text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_purchase(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute only the public CreatePurchase runtime wrapper';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_purchase_impl(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.create_household_purchase_impl(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.create_household_purchase_impl(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'runtime roles must not execute the private CreatePurchase implementation';
  end if;

  select pg_catalog.pg_get_functiondef(
    'fridge_internal.create_household_purchase(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) into v_wrapper_def;

  select pg_catalog.pg_get_functiondef(
    'fridge_internal.create_household_purchase_impl(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) into v_impl_def;

  if position('candidatePurchaseItemId' in v_wrapper_def) = 0
     or position('quantityNumerator' in v_wrapper_def) = 0
     or position('quantityDenominator' in v_wrapper_def) = 0
     or position('measurementUnitId' in v_wrapper_def) = 0
     or position('INVALID_INPUT' in v_wrapper_def) = 0 then
    raise exception 'CreatePurchase wrapper must reject malformed ordered-item payloads before delegation';
  end if;

  if position('create_household_purchase_impl' in v_wrapper_def) = 0 then
    raise exception 'CreatePurchase wrapper must delegate only to the private implementation';
  end if;

  if position('P6P01' in v_wrapper_def) = 0
     or position('NOT_FOUND' in v_wrapper_def) = 0 then
    raise exception 'CreatePurchase wrapper must collapse current-Product race loss to provider-neutral NOT_FOUND';
  end if;

  if position('acquire_household_procurement_admin_authority' in v_impl_def) = 0
     or position('v_existing_semantic_items is distinct from v_semantic_items' in v_impl_def) = 0
     or position('v_committed_at := clock_timestamp()' in v_impl_def) = 0 then
    raise exception 'private CreatePurchase implementation must retain authority, replay and post-lock time semantics';
  end if;
end;
$$;

rollback;
