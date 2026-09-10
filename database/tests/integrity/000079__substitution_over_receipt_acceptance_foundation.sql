-- FridgeScanner BE-06 integrity proof for 000079 substitution over-receipt acceptance foundation.
begin;

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'receiving_exception_resolution_allocation_kind_ck'
     and conrelid = 'fridge.purchase_receiving_exception_resolution'::regclass;

  if v_def is null
     or position('ACCEPTED_ORDINARY_EXCESS' in v_def) = 0
     or position('ACCEPTED_SUBSTITUTION_EXCESS' in v_def) = 0
     or position('ORDINARY_ALLOCATION_ID IS NOT NULL' in upper(v_def)) = 0
     or position('SUBSTITUTION_ALLOCATION_ID IS NOT NULL' in upper(v_def)) = 0 then
    raise exception 'resolution allocation-kind exclusivity is incomplete';
  end if;
end;
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_constraint
   where conrelid = 'fridge.purchase_receiving_exception_resolution'::regclass
     and conname in (
       'receiving_exception_resolution_substitution_allocation_fk',
       'receiving_exception_resolution_exact_substitution_materialization_fk',
       'receiving_exception_resolution_substitution_allocation_uq'
     );
  if v_count <> 3 then
    raise exception 'substitution accepted-excess structural bindings are incomplete';
  end if;
end;
$$;

do $$
declare
  v_assert text;
  v_canonical text;
  v_generic text;
  v_substitution text;
begin
  select pg_get_functiondef(
    'fridge_internal.ordinary_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)'::regprocedure
  ) into v_canonical;

  if position('for update' in lower(v_canonical)) = 0
     or position('purchase_item_receipt_allocation' in v_canonical) = 0
     or position('purchase_item_substitution_allocation' in v_canonical) = 0
     or position('ordinary_allocation_id' in v_canonical) = 0
     or position('substitution_allocation_id' in v_canonical) = 0
     or position('quantity_in_target_unit' in v_canonical) = 0
     or position('normalize_rational' in v_canonical) = 0 then
    raise exception 'canonical accepted-excess calculator does not reconcile both allocation kinds under PurchaseItem serialization';
  end if;

  select pg_get_functiondef(
    'fridge_internal.receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)'::regprocedure
  ) into v_generic;

  if position('ordinary_receiving_required_accepted_excess' in v_generic) = 0
     or position('purchase_item_receipt_allocation' in v_generic) > 0
     or position('purchase_item_substitution_allocation' in v_generic) > 0 then
    raise exception 'generic accepted-excess entrypoint is not a thin delegate to the canonical implementation';
  end if;

  select pg_get_functiondef(
    'fridge_internal.substitution_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)'::regprocedure
  ) into v_substitution;

  if position('ordinary_receiving_required_accepted_excess' in v_substitution) = 0
     or position('purchase_item_receipt_allocation' in v_substitution) > 0
     or position('purchase_item_substitution_allocation' in v_substitution) > 0 then
    raise exception 'substitution accepted-excess entrypoint is not a thin delegate to the canonical implementation';
  end if;

  select pg_get_functiondef(
    'fridge_internal.assert_purchase_receiving_pool(uuid,uuid)'::regprocedure
  ) into v_assert;

  if position('purchase_item_receipt_allocation' in v_assert) = 0
     or position('purchase_item_substitution_allocation' in v_assert) = 0
     or position('ordinary_allocation_id' in v_assert) = 0
     or position('substitution_allocation_id' in v_assert) = 0 then
    raise exception 'receiving conservation does not account for accepted excess across both allocation kinds';
  end if;
end;
$$;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['fridge_app', 'fridge_worker', 'fridge_readonly'] loop
    if has_function_privilege(
      v_role,
      'fridge_internal.ordinary_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)',
      'EXECUTE'
    ) or has_function_privilege(
      v_role,
      'fridge_internal.receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)',
      'EXECUTE'
    ) or has_function_privilege(
      v_role,
      'fridge_internal.substitution_receiving_required_accepted_excess(uuid,uuid,numeric,numeric,uuid,uuid)',
      'EXECUTE'
    ) then
      raise exception '% can execute private accepted-excess helper', v_role;
    end if;
  end loop;
end;
$$;

rollback;
