-- FridgeScanner BE-05 integrity proof
-- 000059__retire_household_ingredient_concept.sql

begin;

do $$
declare
  v_retire_definition text;
  v_guard_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.retire_household_ingredient_concept(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute RetireHouseholdIngredientConcept';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.retire_household_ingredient_concept(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.retire_household_ingredient_concept(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute Household IngredientConcept retirement';
  end if;

  if has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'DELETE') then
    raise exception 'RetireHouseholdIngredientConcept must not broaden direct IngredientConcept DML';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'household_catalog_command_registry_intent_ck'
       and pg_get_constraintdef(oid) like '%RETIRE_HOUSEHOLD_INGREDIENT_CONCEPT%'
  ) then
    raise exception 'shared Household catalog command registry must include IngredientConcept retirement intent';
  end if;

  if not exists (
    select 1
      from pg_trigger
     where tgname = 'compatibility_current_ingredient_concept_guard'
       and not tgisinternal
  ) then
    raise exception 'current compatibility must guard IngredientConcept lifecycle';
  end if;

  select pg_get_functiondef(
    'fridge_internal.retire_household_ingredient_concept(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_retire_definition;

  if position('acquire_household_catalog_admin_authority' in v_retire_definition) = 0 then
    raise exception 'IngredientConcept retirement must revalidate catalog-admin authority';
  end if;

  if position('RETIRE_HOUSEHOLD_INGREDIENT_CONCEPT' in v_retire_definition) = 0 then
    raise exception 'IngredientConcept retirement must participate in shared CommandId governance';
  end if;

  if position('''HOUSEHOLD''::fridge.catalog_scope' in v_retire_definition) = 0
     or position('owner_household_id = p_household_id' in v_retire_definition) = 0
     or position('lifecycle_status = ''ACTIVE''' in v_retire_definition) = 0 then
    raise exception 'IngredientConcept retirement must hide GLOBAL/foreign/non-current targets';
  end if;

  if position('product_ingredient_compatibility' in v_retire_definition) = 0
     or position('DEPENDENCY_CONFLICT' in v_retire_definition) = 0 then
    raise exception 'IngredientConcept retirement must block current compatibility dependencies';
  end if;

  select pg_get_functiondef(
    'fridge_internal.guard_compatibility_current_ingredient_concept()'::regprocedure
  ) into v_guard_definition;

  if position('assert_current_ingredient_concept_reference' in v_guard_definition) = 0 then
    raise exception 'compatibility writer guard must validate current IngredientConcept';
  end if;
end;
$$;

rollback;
