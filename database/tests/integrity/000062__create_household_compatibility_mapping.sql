-- FridgeScanner BE-05 integrity proof for CreateHouseholdCompatibilityMapping.

begin;

do $$
declare
  v_definition text;
  v_guard_security_definer boolean;
  v_trigger_function oid;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.create_household_compatibility_mapping(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute CreateHouseholdCompatibilityMapping boundary';
  end if;

  if has_function_privilege(
       'fridge_worker',
       'fridge_internal.create_household_compatibility_mapping(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.create_household_compatibility_mapping(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'non-app runtime roles must not execute Household compatibility mutation';
  end if;

  if has_table_privilege('fridge_app','fridge.product_ingredient_compatibility','INSERT')
     or has_table_privilege('fridge_app','fridge.product_ingredient_compatibility','UPDATE')
     or has_table_privilege('fridge_app','fridge.product_ingredient_compatibility','DELETE')
     or has_table_privilege('fridge_worker','fridge.product_ingredient_compatibility','INSERT')
     or has_table_privilege('fridge_worker','fridge.product_ingredient_compatibility','UPDATE')
     or has_table_privilege('fridge_worker','fridge.product_ingredient_compatibility','DELETE')
     or has_table_privilege('fridge_readonly','fridge.product_ingredient_compatibility','INSERT')
     or has_table_privilege('fridge_readonly','fridge.product_ingredient_compatibility','UPDATE')
     or has_table_privilege('fridge_readonly','fridge.product_ingredient_compatibility','DELETE') then
    raise exception 'compatibility mapping DML must remain function-only';
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'fridge.household_catalog_command_registry'::regclass
       and c.conname = 'household_catalog_command_registry_intent_ck'
       and pg_get_constraintdef(c.oid) like '%CREATE_HOUSEHOLD_COMPATIBILITY_MAPPING%'
  ) then
    raise exception 'shared Household catalog CommandId registry must include compatibility creation intent';
  end if;

  select pg_get_functiondef(
    'fridge_internal.create_household_compatibility_mapping(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_definition;

  if position('acquire_household_catalog_admin_authority' in v_definition) = 0 then
    raise exception 'compatibility mapping create must reacquire catalog administration authority';
  end if;
  if position('assert_household_catalog_command_intent' in v_definition) = 0
     or position('register_household_catalog_command_intent' in v_definition) = 0 then
    raise exception 'compatibility create must participate in shared CommandId governance';
  end if;
  if position($q$p.catalog_scope = 'GLOBAL'$q$ in v_definition) = 0
     or position($q$p.catalog_scope = 'HOUSEHOLD'$q$ in v_definition) = 0
     or position('p.owner_household_id = p_household_id' in v_definition) = 0
     or position($q$p.lifecycle_status = 'ACTIVE'$q$ in v_definition) = 0 then
    raise exception 'compatibility Product endpoint visibility/current filter is incomplete';
  end if;
  if position($q$i.catalog_scope = 'GLOBAL'$q$ in v_definition) = 0
     or position($q$i.catalog_scope = 'HOUSEHOLD'$q$ in v_definition) = 0
     or position('i.owner_household_id = p_household_id' in v_definition) = 0
     or position($q$i.lifecycle_status = 'ACTIVE'$q$ in v_definition) = 0 then
    raise exception 'compatibility IngredientConcept endpoint visibility/current filter is incomplete';
  end if;
  if position($q$c.catalog_scope = 'HOUSEHOLD'$q$ in v_definition) = 0
     or position('c.owner_household_id = p_household_id' in v_definition) = 0
     or position('c.product_id = p_product_id' in v_definition) = 0
     or position('c.ingredient_concept_id = p_ingredient_concept_id' in v_definition) = 0 then
    raise exception 'compatibility lineage-fragmentation guard is incomplete';
  end if;
  if position($q$'HOUSEHOLD',$q$ in v_definition) = 0
     or position('p_household_id,' in v_definition) = 0
     or position($q$'ACTIVE',$q$ in v_definition) = 0
     or position('v_effective_from := clock_timestamp()' in v_definition) = 0 then
    raise exception 'compatibility create must force Household scope/current version with database-sampled time';
  end if;

  select p.prosecdef
    into v_guard_security_definer
    from pg_proc p
   where p.oid = 'fridge_internal.guard_compatibility_mapping_scope_row()'::regprocedure;

  if v_guard_security_definer is distinct from true then
    raise exception 'compatibility deferred guard must be SECURITY DEFINER';
  end if;

  if has_function_privilege(
       'fridge_app',
       'fridge_internal.guard_compatibility_mapping_scope_row()',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_app',
       'fridge_internal.assert_compatibility_mapping_scope(uuid)',
       'EXECUTE'
     ) then
    raise exception 'compatibility guard/assertion helper must remain internal to runtime roles';
  end if;

  select t.tgfoid
    into v_trigger_function
    from pg_trigger t
   where t.tgrelid = 'fridge.product_ingredient_compatibility'::regclass
     and t.tgname = 'compatibility_mapping_scope_guard'
     and not t.tgisinternal;

  if v_trigger_function is distinct from
     'fridge_internal.guard_compatibility_mapping_scope_row()'::regprocedure::oid then
    raise exception 'compatibility mapping deferred trigger must use dedicated definer guard';
  end if;
end;
$$;

rollback;
