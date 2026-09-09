-- FridgeScanner BE-05 integrity proof
-- 000061__resolve_product_identifier.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.resolve_current_product_identifier(uuid,uuid,uuid,text,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute ResolveProductIdentifier';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.resolve_current_product_identifier(uuid,uuid,uuid,text,text,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.resolve_current_product_identifier(uuid,uuid,uuid,text,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute ProductIdentifier resolution';
  end if;

  if has_table_privilege('fridge_app','fridge.product_identifier','SELECT')
     or has_table_privilege('fridge_worker','fridge.product_identifier','SELECT')
     or has_table_privilege('fridge_readonly','fridge.product_identifier','SELECT') then
    raise exception 'runtime capabilities must not bypass governed ProductIdentifier resolution with direct SELECT';
  end if;

  if has_table_privilege('fridge_app','fridge.product_identifier','INSERT')
     or has_table_privilege('fridge_app','fridge.product_identifier','UPDATE')
     or has_table_privilege('fridge_app','fridge.product_identifier','DELETE')
     or has_table_privilege('fridge_app','fridge.staged_identifier_claim','INSERT')
     or has_table_privilege('fridge_app','fridge.staged_identifier_claim','UPDATE')
     or has_table_privilege('fridge_app','fridge.staged_identifier_claim','DELETE') then
    raise exception 'ResolveProductIdentifier must not broaden identifier DML';
  end if;

  select pg_get_functiondef(
    'fridge_internal.resolve_current_product_identifier(uuid,uuid,uuid,text,text,uuid,text)'::regprocedure
  ) into v_definition;

  if position('lifecycle_status = ''ACTIVE''' in v_definition) = 0
     or position('retired_at is null' in lower(v_definition)) = 0 then
    raise exception 'resolution must require a current canonical ProductIdentifier and Product';
  end if;

  if position('catalog_scope = ''GLOBAL''::fridge.catalog_scope' in v_definition) = 0
     or position('owner_household_id = p_household_id' in v_definition) = 0 then
    raise exception 'resolution must preserve GLOBAL plus same-Household Product visibility';
  end if;

  if position('normalization_rule_id = p_normalization_rule_id' in v_definition) = 0
     or position('normalized_value = p_normalized_value' in v_definition) = 0
     or position('issuer_namespace is not distinct from p_issuer_namespace' in v_definition) = 0 then
    raise exception 'resolution must bind the exact governed normalized key';
  end if;

  if position('insert into' in lower(v_definition)) > 0
     or position('update fridge.' in lower(v_definition)) > 0
     or position('delete from' in lower(v_definition)) > 0 then
    raise exception 'resolution function must remain observational';
  end if;
end;
$$;

rollback;
