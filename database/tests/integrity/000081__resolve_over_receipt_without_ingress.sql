-- FridgeScanner BE-06 integrity proof
-- 000081__resolve_over_receipt_without_ingress.sql

begin;

do $$
declare
  v_definition text;
  v_constraint text;
  v_role text;
begin
  select pg_get_constraintdef(oid) into v_constraint
    from pg_constraint
   where conrelid = 'fridge.household_procurement_command_registry'::regclass
     and conname = 'household_procurement_command_registry_intent_ck';
  if v_constraint is null
     or v_constraint not like '%ACCEPT_ORDINARY_OVER_RECEIPT%'
     or v_constraint not like '%ACCEPT_SUBSTITUTION_OVER_RECEIPT%'
     or v_constraint not like '%RESOLVE_OVER_RECEIPT_WITHOUT_INGRESS%' then
    raise exception 'BE-06 command registry lost accepted intents or nonphysical resolution intent';
  end if;

  select pg_get_constraintdef(oid) into v_constraint
    from pg_constraint
   where conrelid = 'fridge.purchase_receiving_exception_resolution'::regclass
     and conname = 'receiving_exception_resolution_shape_ck';
  if v_constraint is null
     or v_constraint not like '%ACCEPTED_ORDINARY_EXCESS%'
     or v_constraint not like '%ACCEPTED_SUBSTITUTION_EXCESS%'
     or v_constraint not like '%REJECTED_NO_INGRESS%'
     or v_constraint not like '%SUPERSEDED_DETECTION%'
     or v_constraint not like '%resolution_reason%' then
    raise exception 'over-receipt resolution shape does not preserve accepted and nonphysical kinds';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'fridge_internal'
       and p.proname = 'resolve_over_receipt_without_ingress'
       and p.prosecdef
  ) then
    raise exception 'nonphysical over-receipt boundary must be SECURITY DEFINER';
  end if;

  select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'fridge_internal'
     and p.proname = 'resolve_over_receipt_without_ingress';

  if v_definition is null
     or v_definition not like '%acquire_household_procurement_admin_authority%'
     or v_definition not like '%RESOLVE_OVER_RECEIPT_WITHOUT_INGRESS%'
     or v_definition not like '%receiving_required_accepted_excess%'
     or v_definition not like '%SUPERSEDED_DETECTION%'
     or v_definition not like '%REJECTED_NO_INGRESS%'
     or v_definition not like '%purchase_receiving_exception_resolution%' then
    raise exception 'nonphysical over-receipt boundary lost authority, supersession revalidation, or resolution evidence';
  end if;

  if upper(v_definition) like '%INSERT INTO FRIDGE.RECEIPT_ITEM (%'
     or upper(v_definition) like '%INSERT INTO FRIDGE.PURCHASE_ITEM_RECEIPT_ALLOCATION%'
     or upper(v_definition) like '%INSERT INTO FRIDGE.PURCHASE_ITEM_SUBSTITUTION_ALLOCATION%'
     or upper(v_definition) like '%INSERT INTO FRIDGE.STOCK_ITEM%'
     or upper(v_definition) like '%INSERT INTO FRIDGE.INVENTORY_MOVEMENT%'
     or upper(v_definition) like '%INSERT INTO FRIDGE.RECEIPT_ITEM_INVENTORY_EFFECT%'
     or upper(v_definition) like '%UPDATE FRIDGE.PURCHASE_ITEM %'
     or upper(v_definition) like '%UPDATE FRIDGE.PURCHASE_RECEIVING_EXCEPTION %' then
    raise exception 'nonphysical resolution boundary must not create physical truth or rewrite purchase/detection history';
  end if;

  select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'fridge_internal'
     and p.proname = 'claim_receipt_item_intent_physical_materialization';
  if v_definition is null
     or v_definition not like '%SUPERSEDED_DETECTION%'
     or v_definition not like '%v_kind <> ''ORDINARY''%'
     or v_definition not like '%household_accept_substitution_over_receipt_command%'
     or v_definition not like '%household_accept_ordinary_over_receipt_command%' then
    raise exception 'physical claim lost accepted barrier structure or superseded-detection exception';
  end if;

  foreach v_role in array array['fridge_app','fridge_worker','fridge_readonly'] loop
    if has_table_privilege(v_role, 'fridge.household_resolve_over_receipt_without_ingress_command', 'INSERT')
       or has_table_privilege(v_role, 'fridge.household_resolve_over_receipt_without_ingress_command', 'UPDATE')
       or has_table_privilege(v_role, 'fridge.household_resolve_over_receipt_without_ingress_command', 'DELETE') then
      raise exception '% must not have DML on nonphysical resolution command ledger', v_role;
    end if;
  end loop;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.resolve_over_receipt_without_ingress(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute only the governed nonphysical resolution boundary';
  end if;
  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.resolve_over_receipt_without_ingress(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.resolve_over_receipt_without_ingress(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/read-only roles must not execute nonphysical resolution boundary';
  end if;
end;
$$;
rollback;
