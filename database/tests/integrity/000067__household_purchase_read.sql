-- FridgeScanner DB-02 integrity checks for 000067__household_purchase_read.sql

begin;

do $$
begin
  if not has_function_privilege('fridge_app', 'fridge_internal.list_household_purchases(uuid,uuid,uuid,integer,timestamptz,uuid)', 'EXECUTE') then
    raise exception 'fridge_app must execute list_household_purchases';
  end if;
  if not has_function_privilege('fridge_app', 'fridge_internal.get_household_purchase(uuid,uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'fridge_app must execute get_household_purchase';
  end if;
  if has_function_privilege('fridge_worker', 'fridge_internal.list_household_purchases(uuid,uuid,uuid,integer,timestamptz,uuid)', 'EXECUTE')
     or has_function_privilege('fridge_readonly', 'fridge_internal.list_household_purchases(uuid,uuid,uuid,integer,timestamptz,uuid)', 'EXECUTE')
     or has_function_privilege('fridge_worker', 'fridge_internal.get_household_purchase(uuid,uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('fridge_readonly', 'fridge_internal.get_household_purchase(uuid,uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'Purchase observational readers must remain app-only boundaries';
  end if;
end;
$$;

do $$
declare
  v_list_def text;
  v_get_def text;
begin
  select pg_get_functiondef('fridge_internal.list_household_purchases(uuid,uuid,uuid,integer,timestamptz,uuid)'::regprocedure) into v_list_def;
  select pg_get_functiondef('fridge_internal.get_household_purchase(uuid,uuid,uuid,uuid)'::regprocedure) into v_get_def;
  if v_list_def not like '%SECURITY DEFINER%' or v_get_def not like '%SECURITY DEFINER%' then
    raise exception 'Purchase readers must remain SECURITY DEFINER';
  end if;
  if v_list_def not like '%household_membership%' or v_get_def not like '%household_membership%' then
    raise exception 'Purchase readers must revalidate exact current membership';
  end if;
  if v_list_def not like '%p.household_id = p_household_id%' or v_get_def not like '%p.household_id = p_household_id%' then
    raise exception 'Purchase readers must scope durable facts by Household';
  end if;
  if v_list_def not like '%(p.occurred_at, p.purchase_id) < (p_cursor_occurred_at, p_cursor_purchase_id)%'
     or v_list_def not like '%order by p.occurred_at desc, p.purchase_id desc%'
     or v_list_def not like '%limit p_limit%' then
    raise exception 'Purchase list must preserve bounded stable keyset pagination';
  end if;
  if v_get_def like '%product.lifecycle_status%' or v_get_def like '%measurement_unit.lifecycle_status%' then
    raise exception 'Historical Purchase observation must not reinterpret facts through current Product/Unit lifecycle';
  end if;
end;
$$;

rollback;
