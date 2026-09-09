-- FridgeScanner DB-02 integrity checks for 000069_02__purchase_item_pricing_basis_lexical_boundary.sql

begin;

do $$
declare
  v_wrapper text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_pricing_basis(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks pricing-basis wrapper execute';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.commit_purchase_item_pricing_basis_impl(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.commit_purchase_item_pricing_basis_impl(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.commit_purchase_item_pricing_basis_impl(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'pricing-basis implementation unexpectedly executable by runtime role';
  end if;

  select pg_get_functiondef(
    'fridge_internal.commit_purchase_item_pricing_basis(uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_wrapper;

  if position('p_basis_amount_text !~' in v_wrapper) = 0
     or position('[1-9][0-9]*' in v_wrapper) = 0
     or position('[.][0-9]+' in v_wrapper) = 0 then
    raise exception 'pricing-basis wrapper does not prove canonical exact-decimal syntax';
  end if;

  if position('commit_purchase_item_pricing_basis_impl' in v_wrapper) = 0 then
    raise exception 'pricing-basis wrapper does not delegate to private implementation';
  end if;
end;
$$;

rollback;
