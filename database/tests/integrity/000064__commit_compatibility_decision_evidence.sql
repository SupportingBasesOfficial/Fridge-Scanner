-- FridgeScanner BE-05 integrity checks for 000064__commit_compatibility_decision_evidence.sql

begin;

do $$
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_compatibility_decision_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute governed compatibility evidence commit';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.commit_compatibility_decision_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.commit_compatibility_decision_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'non-app roles unexpectedly execute compatibility evidence commit';
  end if;

  if has_table_privilege('fridge_app','fridge.compatibility_decision_evidence','INSERT')
     or has_table_privilege('fridge_app','fridge.compatibility_decision_evidence','UPDATE')
     or has_table_privilege('fridge_app','fridge.compatibility_decision_evidence','DELETE') then
    raise exception 'fridge_app unexpectedly has direct compatibility evidence DML';
  end if;

  if has_table_privilege('fridge_app','fridge.household_compatibility_evidence_commit_command','SELECT')
     or has_table_privilege('fridge_app','fridge.household_compatibility_evidence_commit_command','INSERT')
     or has_table_privilege('fridge_app','fridge.household_compatibility_evidence_commit_command','UPDATE')
     or has_table_privilege('fridge_app','fridge.household_compatibility_evidence_commit_command','DELETE') then
    raise exception 'evidence command table must remain function-only';
  end if;

  if has_table_privilege('fridge_app','fridge.household_compatibility_evidence_command_registry','SELECT')
     or has_table_privilege('fridge_app','fridge.household_compatibility_evidence_command_registry','INSERT')
     or has_table_privilege('fridge_app','fridge.household_compatibility_evidence_command_registry','UPDATE')
     or has_table_privilege('fridge_app','fridge.household_compatibility_evidence_command_registry','DELETE') then
    raise exception 'evidence CommandId registry must remain function-only';
  end if;
end;
$$;

do $$
declare
  v_function text;
  v_guard_security_definer boolean;
  v_trigger_function text;
begin
  select pg_get_functiondef(
    'fridge_internal.commit_compatibility_decision_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
  ) into v_function;

  if position('acquire_household_compatibility_evidence_authority' in v_function) = 0 then
    raise exception 'evidence commit does not reacquire current Household membership authority';
  end if;
  if position('HOUSEHOLD_CATALOG_ADMINISTER' in v_function) <> 0 then
    raise exception 'evidence commit must not require catalog mutation capability';
  end if;
  if position('register_household_compatibility_evidence_command_intent' in v_function) = 0
     or position('assert_household_compatibility_evidence_command_intent' in v_function) = 0 then
    raise exception 'evidence commit lacks dedicated CommandId governance';
  end if;
  if position('for key share' in lower(v_function)) = 0
     or position('for share' in lower(v_function)) = 0 then
    raise exception 'evidence commit lacks endpoint/mapping serialization locks';
  end if;
  if position('v_evaluation_anchor := clock_timestamp()' in lower(v_function)) = 0 then
    raise exception 'evidence evaluation anchor is not server sampled after locks';
  end if;
  if position($needle$v_mapping_lifecycle_status <> 'ACTIVE'$needle$ in v_function) = 0
     or position($needle$v_mapping_effective_from > v_evaluation_anchor$needle$ in v_function) = 0
     or position($needle$v_mapping_effective_to <= v_evaluation_anchor$needle$ in v_function) = 0 then
    raise exception 'evidence commit does not prove current mapping effectiveness at anchor';
  end if;
  if position('approved_by_user_id' in v_function) = 0
     or position('approval_reason' in v_function) = 0 then
    raise exception 'evidence commit does not explicitly control approval fields';
  end if;

  select p.prosecdef
    into v_guard_security_definer
    from pg_proc p
   where p.oid='fridge_internal.guard_compatibility_evidence_scope_row()'::regprocedure;

  if v_guard_security_definer is distinct from true then
    raise exception 'compatibility evidence deferred guard must be SECURITY DEFINER';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.guard_compatibility_evidence_scope_row()',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_app',
    'fridge_internal.assert_compatibility_evidence_scope(uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not directly execute compatibility evidence guard/assertion helpers';
  end if;

  select p.proname
    into v_trigger_function
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
   where t.tgrelid='fridge.compatibility_decision_evidence'::regclass
     and t.tgname='compatibility_evidence_scope_guard'
     and not t.tgisinternal;

  if v_trigger_function is distinct from 'guard_compatibility_evidence_scope_row' then
    raise exception 'compatibility evidence trigger is not bound to the dedicated definer guard';
  end if;
end;
$$;

rollback;
