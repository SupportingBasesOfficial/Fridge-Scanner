-- FridgeScanner BE-06 integrity proof for 000076__detected_over_receipt_materialization_guard.sql
begin;

do $$
declare
  v_function text;
begin
  select pg_get_functiondef(
    'fridge_internal.claim_receipt_item_intent_physical_materialization()'::regprocedure
  ) into v_function;

  if position('receipt_item_intent_over_receipt_exception' in v_function) = 0
     or position('P6R02' in v_function) = 0
     or position('unresolved over-receipt exception' in v_function) = 0 then
    raise exception 'shared physical claim does not enforce detected over-receipt barrier';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.claim_receipt_item_intent_physical_materialization()',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.claim_receipt_item_intent_physical_materialization()',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.claim_receipt_item_intent_physical_materialization()',
    'EXECUTE'
  ) then
    raise exception 'runtime role can directly execute private physical claim helper';
  end if;
end;
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
   where not t.tgisinternal
     and n.nspname = 'fridge_internal'
     and p.proname = 'claim_receipt_item_intent_physical_materialization'
     and (
       (t.tgrelid = 'fridge.receipt_item_intent_materialization'::regclass
        and t.tgname = 'receipt_item_intent_materialization_claim_physical')
       or
       (t.tgrelid = 'fridge.receipt_item_intent_substitution_materialization'::regclass
        and t.tgname = 'receipt_item_intent_substitution_materialization_claim_physical')
     );

  if v_count <> 2 then
    raise exception 'ordinary and substitution materialization bridges are not both guarded by shared physical claim';
  end if;
end;
$$;

rollback;
