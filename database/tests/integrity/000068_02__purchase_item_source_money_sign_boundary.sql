-- FridgeScanner DB-02 integrity checks for 000068_02__purchase_item_source_money_sign_boundary.sql

begin;

do $$
declare
  v_wrapper text;
begin
  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.commit_purchase_item_source_money_facts(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'fridge_worker unexpectedly executes source-money wrapper';
  end if;

  if has_function_privilege(
    'fridge_readonly',
    'fridge_internal.commit_purchase_item_source_money_facts(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'fridge_readonly unexpectedly executes source-money wrapper';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_source_money_facts(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks source-money wrapper execute';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_source_money_facts_impl(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.commit_purchase_item_source_money_facts_impl(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.commit_purchase_item_source_money_facts_impl(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'source-money implementation unexpectedly executable by runtime role';
  end if;

  select pg_get_functiondef(
    'fridge_internal.commit_purchase_item_source_money_facts(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)'::regprocedure
  ) into v_wrapper;

  if position('v_amount < 0' in v_wrapper) = 0 then
    raise exception 'source-money wrapper does not prove nonnegative amount boundary';
  end if;
  if position('commit_purchase_item_source_money_facts_impl' in v_wrapper) = 0 then
    raise exception 'source-money wrapper does not delegate to private implementation';
  end if;
end;
$$;

rollback;
