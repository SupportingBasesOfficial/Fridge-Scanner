-- FridgeScanner BE-05 integrity proof
-- 000056__current_ingredient_concept_read.sql

begin;

do $$
declare
  v_list_definition text;
  v_get_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.list_current_ingredient_concepts(uuid,uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_app',
    'fridge_internal.get_current_ingredient_concept(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute narrow current IngredientConcept read boundaries';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.list_current_ingredient_concepts(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.list_current_ingredient_concepts(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.get_current_ingredient_concept(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.get_current_ingredient_concept(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not bypass application Household authorization for IngredientConcept reads';
  end if;

  if has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'SELECT')
     or has_table_privilege('fridge_worker', 'fridge.ingredient_concept', 'SELECT')
     or has_table_privilege('fridge_readonly', 'fridge.ingredient_concept', 'SELECT') then
    raise exception 'runtime capability roles must not bypass governed IngredientConcept read functions with direct SELECT';
  end if;

  if has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'DELETE') then
    raise exception 'current IngredientConcept reads must not broaden runtime mutation privileges';
  end if;

  select pg_get_functiondef(
    'fridge_internal.list_current_ingredient_concepts(uuid,uuid,uuid)'::regprocedure
  ) into v_list_definition;
  select pg_get_functiondef(
    'fridge_internal.get_current_ingredient_concept(uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_get_definition;

  if position('membership_id = p_actor_membership_id' in v_list_definition) = 0
     or position('membership_id = p_actor_membership_id' in v_get_definition) = 0 then
    raise exception 'current IngredientConcept reads must revalidate exact actor membership';
  end if;

  if position('lifecycle_status = ''ACTIVE''' in v_list_definition) = 0
     or position('lifecycle_status = ''ACTIVE''' in v_get_definition) = 0 then
    raise exception 'current IngredientConcept reads must expose ACTIVE concepts only';
  end if;

  if position('catalog_scope = ''GLOBAL''' in v_list_definition) = 0
     or position('owner_household_id = p_household_id' in v_list_definition) = 0
     or position('catalog_scope = ''GLOBAL''' in v_get_definition) = 0
     or position('owner_household_id = p_household_id' in v_get_definition) = 0 then
    raise exception 'current IngredientConcept reads must enforce GLOBAL plus same-Household visibility';
  end if;

  if position('order by i.ingredient_concept_id' in lower(v_list_definition)) = 0 then
    raise exception 'current IngredientConcept list must use deterministic identity ordering';
  end if;
end;
$$;

rollback;
