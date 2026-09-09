-- FridgeScanner BE-05 integrity checks for 000063__retire_household_compatibility_mapping.sql

begin;

do $$
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.retire_household_compatibility_mapping(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute governed compatibility retirement';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.retire_household_compatibility_mapping(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.retire_household_compatibility_mapping(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'non-app roles unexpectedly execute compatibility retirement';
  end if;

  if has_table_privilege('fridge_app','fridge.product_ingredient_compatibility','INSERT')
     or has_table_privilege('fridge_app','fridge.product_ingredient_compatibility','UPDATE')
     or has_table_privilege('fridge_app','fridge.product_ingredient_compatibility','DELETE') then
    raise exception 'fridge_app unexpectedly has direct compatibility mapping DML';
  end if;

  if has_table_privilege('fridge_app','fridge.household_compatibility_mapping_retire_command','SELECT')
     or has_table_privilege('fridge_app','fridge.household_compatibility_mapping_retire_command','INSERT')
     or has_table_privilege('fridge_app','fridge.household_compatibility_mapping_retire_command','UPDATE')
     or has_table_privilege('fridge_app','fridge.household_compatibility_mapping_retire_command','DELETE') then
    raise exception 'retire command table must not be directly accessible to fridge_app';
  end if;
end;
$$;

do $$
declare
  v_constraint text;
  v_function text;
  v_guard_security_definer boolean;
begin
  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_constraint c
    join pg_class r on r.oid=c.conrelid
    join pg_namespace n on n.oid=r.relnamespace
   where n.nspname='fridge'
     and r.relname='household_catalog_command_registry'
     and c.conname='household_catalog_command_registry_intent_ck';

  if position('RETIRE_HOUSEHOLD_COMPATIBILITY_MAPPING' in coalesce(v_constraint,'')) = 0 then
    raise exception 'shared Household catalog CommandId registry omits compatibility retirement intent';
  end if;

  select pg_get_functiondef('fridge_internal.retire_household_compatibility_mapping(uuid,uuid,uuid,uuid,uuid)'::regprocedure)
    into v_function;

  if position('acquire_household_catalog_admin_authority' in v_function) = 0 then
    raise exception 'compatibility retirement does not reacquire catalog administration authority';
  end if;
  if position('assert_household_catalog_command_intent' in v_function) = 0
     or position('register_household_catalog_command_intent' in v_function) = 0 then
    raise exception 'compatibility retirement does not participate in shared CommandId governance';
  end if;
  if position($needle$catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope$needle$ in v_function) = 0
     or position('owner_household_id = p_household_id' in v_function) = 0
     or position($needle$lifecycle_status = 'ACTIVE'$needle$ in v_function) = 0
     or position('effective_to is null' in lower(v_function)) = 0 then
    raise exception 'compatibility retirement eligibility is not current same-Household only';
  end if;
  if position('for key share' in lower(v_function)) = 0
     or position('for update' in lower(v_function)) = 0 then
    raise exception 'compatibility retirement lacks required endpoint/mapping serialization locks';
  end if;
  if position('set effective_to = v_effective_to' in lower(v_function)) = 0
     or position($needle$lifecycle_status = 'RETIRED'$needle$ in v_function) = 0 then
    raise exception 'compatibility retirement does not close lifecycle/effective interval';
  end if;

  select p.prosecdef
    into v_guard_security_definer
    from pg_proc p
   where p.oid='fridge_internal.guard_compatibility_mapping_scope_row()'::regprocedure;

  if v_guard_security_definer is distinct from true then
    raise exception 'compatibility deferred guard must remain SECURITY DEFINER';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_compatibility_mapping_scope_row()',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not directly execute internal compatibility guard';
  end if;
end;
$$;

rollback;
