-- FridgeScanner BE-05 integrity proof
-- 000057__create_household_ingredient_concept.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_ingredient_concept(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute CreateHouseholdIngredientConcept';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.create_household_ingredient_concept(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.create_household_ingredient_concept(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute Household IngredientConcept creation';
  end if;

  if has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'DELETE') then
    raise exception 'CreateHouseholdIngredientConcept must not broaden direct IngredientConcept DML';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'household_catalog_command_registry_intent_ck'
       and pg_get_constraintdef(oid) like '%CREATE_HOUSEHOLD_INGREDIENT_CONCEPT%'
  ) then
    raise exception 'shared Household catalog command registry must include IngredientConcept create intent';
  end if;

  select pg_get_functiondef(
    'fridge_internal.create_household_ingredient_concept(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
  ) into v_definition;

  if position('acquire_household_catalog_admin_authority' in v_definition) = 0 then
    raise exception 'CreateHouseholdIngredientConcept must revalidate catalog-admin authority';
  end if;

  if position('CREATE_HOUSEHOLD_INGREDIENT_CONCEPT' in v_definition) = 0 then
    raise exception 'CreateHouseholdIngredientConcept must participate in shared CommandId intent governance';
  end if;

  if position('''HOUSEHOLD''::fridge.catalog_scope' in v_definition) = 0
     or position('p_household_id' in v_definition) = 0 then
    raise exception 'CreateHouseholdIngredientConcept must force HOUSEHOLD scope and exact owner';
  end if;
end;
$$;

rollback;
