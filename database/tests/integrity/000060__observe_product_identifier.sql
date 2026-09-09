-- FridgeScanner BE-05 integrity proof
-- 000060__observe_product_identifier.sql

begin;

do $$
declare
  v_observe_definition text;
  v_authority_definition text;
  v_staged_guard_security_definer boolean;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.observe_product_identifier(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute ObserveProductIdentifier';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.observe_product_identifier(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.observe_product_identifier(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute ProductIdentifier observation';
  end if;

  if has_table_privilege('fridge_app', 'fridge.staged_identifier_claim', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.staged_identifier_claim', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.staged_identifier_claim', 'DELETE')
     or has_table_privilege('fridge_app', 'fridge.product_identifier', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.product_identifier', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.product_identifier', 'DELETE') then
    raise exception 'ObserveProductIdentifier must not broaden direct identifier DML';
  end if;

  if has_function_privilege(
       'fridge_app',
       'fridge_internal.assert_staged_identifier_claim_contract(uuid)',
       'EXECUTE'
     ) or has_function_privilege(
       'fridge_worker',
       'fridge_internal.assert_staged_identifier_claim_contract(uuid)',
       'EXECUTE'
     ) or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.assert_staged_identifier_claim_contract(uuid)',
       'EXECUTE'
     ) then
    raise exception 'staged contract assertion helper must remain internal';
  end if;

  if has_function_privilege(
       'fridge_app',
       'fridge_internal.guard_staged_identifier_claim_contract_row()',
       'EXECUTE'
     ) or has_function_privilege(
       'fridge_worker',
       'fridge_internal.guard_staged_identifier_claim_contract_row()',
       'EXECUTE'
     ) or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.guard_staged_identifier_claim_contract_row()',
       'EXECUTE'
     ) then
    raise exception 'deferred staged guard must remain trigger-internal';
  end if;

  select p.prosecdef
    into v_staged_guard_security_definer
    from pg_proc p
   where p.oid = 'fridge_internal.guard_staged_identifier_claim_contract_row()'::regprocedure;

  if coalesce(v_staged_guard_security_definer, false) is false then
    raise exception 'deferred staged guard must execute as SECURITY DEFINER';
  end if;

  if not exists (
    select 1
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgname = 'staged_identifier_claim_contract_guard'
       and not t.tgisinternal
       and p.oid = 'fridge_internal.guard_staged_identifier_claim_contract_row()'::regprocedure
  ) then
    raise exception 'staged claim deferred trigger must use the isolated SECURITY DEFINER guard';
  end if;

  select pg_get_functiondef(
    'fridge_internal.observe_product_identifier(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_observe_definition;

  if position('acquire_household_identifier_observation_authority' in v_observe_definition) = 0 then
    raise exception 'ProductIdentifier observation must revalidate current Household observation authority';
  end if;

  if position('acquire_household_catalog_admin_authority' in v_observe_definition) > 0
     or position('HOUSEHOLD_CATALOG_ADMINISTER' in v_observe_definition) > 0 then
    raise exception 'ProductIdentifier observation must not require catalog-administration authority';
  end if;

  if position('insert into fridge.staged_identifier_claim' in lower(v_observe_definition)) = 0 then
    raise exception 'ProductIdentifier observation must persist staged evidence';
  end if;

  if position('insert into fridge.product_identifier (' in lower(v_observe_definition)) > 0 then
    raise exception 'ProductIdentifier observation must not create canonical ProductIdentifier';
  end if;

  if position('normalized_value' in lower(v_observe_definition)) = 0
     or position('normalization_rule_id' in lower(v_observe_definition)) = 0
     or position('resolved_product_identifier_id' in lower(v_observe_definition)) = 0 then
    raise exception 'ProductIdentifier observation must explicitly control unresolved staged fields';
  end if;

  if position('catalog_scope = ''HOUSEHOLD''::fridge.catalog_scope' in v_observe_definition) = 0
     or position('owner_household_id = p_household_id' in v_observe_definition) = 0
     or position('lifecycle_status = ''ACTIVE''' in v_observe_definition) = 0 then
    raise exception 'candidate Product must be current private same-Household';
  end if;

  select pg_get_functiondef(
    'fridge_internal.acquire_household_identifier_observation_authority(uuid,uuid,uuid)'::regprocedure
  ) into v_authority_definition;

  if position('for share' in lower(v_authority_definition)) = 0
     or position('for update' in lower(v_authority_definition)) = 0
     or position('clock_timestamp()' in lower(v_authority_definition)) = 0 then
    raise exception 'observation authority must lock governance rows and sample fresh post-wait time';
  end if;
end;
$$;

rollback;
