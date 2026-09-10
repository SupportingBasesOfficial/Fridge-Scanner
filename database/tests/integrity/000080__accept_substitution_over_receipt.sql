-- FridgeScanner BE-06 integrity proof for 000080 substitution over-receipt acceptance.
begin;

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'household_procurement_command_registry_intent_ck'
     and conrelid = 'fridge.household_procurement_command_registry'::regclass;
  if v_def is null
     or position('ACCEPT_SUBSTITUTION_OVER_RECEIPT' in v_def) = 0
     or position('ACCEPT_ORDINARY_OVER_RECEIPT' in v_def) = 0
     or position('REGISTER_OVER_RECEIPT_EXCEPTION' in v_def) = 0 then
    raise exception 'shared procurement CommandId registry lost over-receipt intents';
  end if;
end;
$$;

do $$
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.accept_substitution_over_receipt(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks narrow substitution over-receipt acceptance EXECUTE';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.accept_substitution_over_receipt(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.accept_substitution_over_receipt(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'non-app runtime role can execute substitution over-receipt acceptance';
  end if;
end;
$$;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['fridge_app', 'fridge_worker', 'fridge_readonly'] loop
    if has_table_privilege(v_role, 'fridge.household_accept_substitution_over_receipt_command', 'INSERT')
       or has_table_privilege(v_role, 'fridge.household_accept_substitution_over_receipt_command', 'UPDATE')
       or has_table_privilege(v_role, 'fridge.household_accept_substitution_over_receipt_command', 'DELETE') then
      raise exception '% has direct DML on substitution acceptance authority', v_role;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_claim text;
  v_boundary text;
begin
  select pg_get_functiondef(
    'fridge_internal.claim_receipt_item_intent_physical_materialization()'::regprocedure
  ) into v_claim;

  if position('household_accept_ordinary_over_receipt_command' in v_claim) = 0
     or position('household_accept_substitution_over_receipt_command' in v_claim) = 0
     or position('candidate_receipt_item_id = new.receipt_item_id' in v_claim) = 0
     or position('v_kind = ''SUBSTITUTION''' in v_claim) = 0 then
    raise exception 'DETECTED physical claim is not restricted by matching acceptance authority';
  end if;

  select pg_get_functiondef(
    'fridge_internal.accept_substitution_over_receipt(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_boundary;

  if position('acquire_household_procurement_admin_authority' in v_boundary) = 0
     or position('substitution_receiving_required_accepted_excess' in v_boundary) = 0
     or position('insert into fridge.purchase_item_substitution_allocation' in v_boundary) = 0
     or position('insert into fridge.receipt_item_intent_substitution_materialization' in v_boundary) = 0
     or position('ACCEPTED_SUBSTITUTION_EXCESS' in v_boundary) = 0
     or position('assert_purchase_receiving_pool' in v_boundary) = 0
     or position('assert_receipt_item_allocation_pool' in v_boundary) = 0
     or position('assert_receipt_item_inventory_effects' in v_boundary) = 0 then
    raise exception 'substitution over-receipt acceptance boundary is missing governed atomic proofs';
  end if;

  if position('update fridge.purchase_item' in lower(v_boundary)) > 0 then
    raise exception 'substitution over-receipt acceptance must not rewrite PurchaseItem purchased truth';
  end if;
end;
$$;

rollback;
