-- FridgeScanner BE-05 integrity proof
-- 000055__current_product_read.sql

begin;

do $$
declare
  v_list_definition text;
  v_get_definition text;
  v_visible_helper_definition text;
  v_owned_helper_definition text;
  v_batch_visible_qual text;
  v_batch_write_qual text;
  v_identifier_visible_qual text;
  v_identifier_write_qual text;
begin
  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.list_current_products(uuid,uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_app',
    'fridge_internal.get_current_product(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must execute narrow current Product read boundaries';
  end if;

  if has_function_privilege(
    'fridge_worker',
    'fridge_internal.list_current_products(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.list_current_products(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_worker',
    'fridge_internal.get_current_product(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'fridge_readonly',
    'fridge_internal.get_current_product(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'worker/readonly must not bypass application Household authorization for Product reads';
  end if;

  if has_table_privilege('fridge_app', 'fridge.product', 'SELECT')
     or has_table_privilege('fridge_worker', 'fridge.product', 'SELECT')
     or has_table_privilege('fridge_readonly', 'fridge.product', 'SELECT') then
    raise exception 'runtime capability roles must not bypass governed Product read functions with direct SELECT';
  end if;

  if has_table_privilege('fridge_app', 'fridge.product', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.product', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.product', 'DELETE') then
    raise exception 'current Product reads must not broaden runtime Product mutation privileges';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.rls_product_visible_to_current_household(uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_worker',
    'fridge_internal.rls_product_visible_to_current_household(uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_readonly',
    'fridge_internal.rls_product_visible_to_current_household(uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_app',
    'fridge_internal.rls_product_owned_by_current_household(uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_worker',
    'fridge_internal.rls_product_owned_by_current_household(uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'fridge_readonly',
    'fridge_internal.rls_product_owned_by_current_household(uuid)',
    'EXECUTE'
  ) then
    raise exception 'dependent catalog RLS must retain only narrow Product predicate EXECUTE';
  end if;

  if has_function_privilege(
    'public',
    'fridge_internal.rls_product_visible_to_current_household(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'public',
    'fridge_internal.rls_product_owned_by_current_household(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Product RLS predicate helpers must not be executable by public';
  end if;

  select pg_get_functiondef(
    'fridge_internal.list_current_products(uuid,uuid,uuid)'::regprocedure
  ) into v_list_definition;
  select pg_get_functiondef(
    'fridge_internal.get_current_product(uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_get_definition;
  select pg_get_functiondef(
    'fridge_internal.rls_product_visible_to_current_household(uuid)'::regprocedure
  ) into v_visible_helper_definition;
  select pg_get_functiondef(
    'fridge_internal.rls_product_owned_by_current_household(uuid)'::regprocedure
  ) into v_owned_helper_definition;

  if position('security definer' in lower(v_visible_helper_definition)) = 0
     or position('security definer' in lower(v_owned_helper_definition)) = 0 then
    raise exception 'dependent Product RLS predicates must remain SECURITY DEFINER';
  end if;

  select qual
    into v_batch_visible_qual
    from pg_policies
   where schemaname = 'fridge'
     and tablename = 'batch'
     and policyname = 'batch_visible';

  select qual
    into v_batch_write_qual
    from pg_policies
   where schemaname = 'fridge'
     and tablename = 'batch'
     and policyname = 'batch_household_write';

  select qual
    into v_identifier_visible_qual
    from pg_policies
   where schemaname = 'fridge'
     and tablename = 'product_identifier'
     and policyname = 'product_identifier_visible';

  select qual
    into v_identifier_write_qual
    from pg_policies
   where schemaname = 'fridge'
     and tablename = 'product_identifier'
     and policyname = 'product_identifier_household_write';

  if position('rls_product_visible_to_current_household' in coalesce(v_batch_visible_qual, '')) = 0
     or position('rls_product_owned_by_current_household' in coalesce(v_batch_write_qual, '')) = 0
     or position('rls_product_visible_to_current_household' in coalesce(v_identifier_visible_qual, '')) = 0
     or position('rls_product_owned_by_current_household' in coalesce(v_identifier_write_qual, '')) = 0 then
    raise exception 'dependent Batch/ProductIdentifier RLS must not regress to direct Product table subqueries';
  end if;

  if position('membership_id = p_actor_membership_id' in v_list_definition) = 0
     or position('membership_id = p_actor_membership_id' in v_get_definition) = 0 then
    raise exception 'current Product reads must revalidate the exact actor membership';
  end if;

  if position('lifecycle_status = ''ACTIVE''' in v_list_definition) = 0
     or position('lifecycle_status = ''ACTIVE''' in v_get_definition) = 0 then
    raise exception 'current Product reads must expose ACTIVE Products only';
  end if;

  if position('catalog_scope = ''GLOBAL''' in v_list_definition) = 0
     or position('owner_household_id = p_household_id' in v_list_definition) = 0
     or position('catalog_scope = ''GLOBAL''' in v_get_definition) = 0
     or position('owner_household_id = p_household_id' in v_get_definition) = 0 then
    raise exception 'current Product reads must enforce GLOBAL plus same-Household visibility';
  end if;

  if position('order by p.product_id' in lower(v_list_definition)) = 0 then
    raise exception 'current Product list must use deterministic identity ordering';
  end if;
end;
$$;

rollback;
