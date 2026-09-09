-- FridgeScanner BE-05 integrity proof
-- 000058__change_household_ingredient_concept_metadata.sql

begin;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.change_household_ingredient_concept_metadata(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute ChangeHouseholdIngredientConceptMetadata';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.change_household_ingredient_concept_metadata(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.change_household_ingredient_concept_metadata(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not execute Household IngredientConcept metadata change';
  end if;

  if has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.ingredient_concept', 'DELETE') then
    raise exception 'ChangeHouseholdIngredientConceptMetadata must not broaden direct IngredientConcept DML';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'household_catalog_command_registry_intent_ck'
       and pg_get_constraintdef(oid) like '%CHANGE_HOUSEHOLD_INGREDIENT_CONCEPT_METADATA%'
  ) then
    raise exception 'shared Household catalog command registry must include IngredientConcept metadata-change intent';
  end if;

  select pg_get_functiondef(
    'fridge_internal.change_household_ingredient_concept_metadata(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
  ) into v_definition;

  if position('acquire_household_catalog_admin_authority' in v_definition) = 0 then
    raise exception 'IngredientConcept metadata change must revalidate catalog-admin authority';
  end if;

  if position('CHANGE_HOUSEHOLD_INGREDIENT_CONCEPT_METADATA' in v_definition) = 0 then
    raise exception 'IngredientConcept metadata change must participate in shared CommandId governance';
  end if;

  if position('''HOUSEHOLD''::fridge.catalog_scope' in v_definition) = 0
     or position('owner_household_id = p_household_id' in v_definition) = 0
     or position('lifecycle_status = ''ACTIVE''' in v_definition) = 0 then
    raise exception 'IngredientConcept metadata change must hide GLOBAL/foreign/non-current targets';
  end if;

  if position('set canonical_name = p_canonical_name' in v_definition) = 0 then
    raise exception 'IngredientConcept metadata change may mutate only canonical_name in this slice';
  end if;
end;
$$;

rollback;
