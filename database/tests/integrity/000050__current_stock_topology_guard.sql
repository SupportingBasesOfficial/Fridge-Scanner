-- FridgeScanner BE-04 integrity proof
-- 000050__current_stock_topology_guard.sql

begin;

do $$
declare
  v_assert_definition text;
  v_guard_definition text;
  v_trigger_count integer;
begin
  select pg_get_functiondef(
    'fridge_internal.assert_current_stock_topology(uuid,text,timestamptz,fridge.inventory_placement_anchor_kind,uuid,uuid)'::regprocedure
  ) into v_assert_definition;

  select pg_get_functiondef(
    'fridge_internal.guard_current_stock_topology()'::regprocedure
  ) into v_guard_definition;

  if position('for key share' in lower(v_assert_definition)) = 0 then
    raise exception 'current StockItem topology guard must serialize with topology retirement via KEY SHARE';
  end if;

  if position('lifecycle_status = ''ACTIVE''' in v_assert_definition) = 0
     or position('retired_at is null' in v_assert_definition) = 0 then
    raise exception 'current StockItem topology guard must require current topology lifecycle';
  end if;

  if position('p_lifecycle_status is distinct from ''ACTIVE''' in v_assert_definition) = 0
     or position('p_retired_at is not null' in v_assert_definition) = 0 then
    raise exception 'historical StockItems must bypass current-topology enforcement';
  end if;

  if position('storage_location' in v_assert_definition) = 0
     or position('compartment' in v_assert_definition) = 0 then
    raise exception 'current StockItem topology guard must protect both placement anchor shapes';
  end if;

  if position('assert_current_stock_topology' in v_guard_definition) = 0 then
    raise exception 'StockItem trigger must delegate to the canonical topology assertion';
  end if;

  select count(*)
    into v_trigger_count
    from pg_trigger
   where tgrelid = 'fridge.stock_item'::regclass
     and tgname = 'stock_item_current_topology_guard'
     and not tgisinternal
     and tgenabled <> 'D';

  if v_trigger_count <> 1 then
    raise exception 'exactly one enabled current StockItem topology guard trigger is required';
  end if;

  if has_function_privilege(
    'public',
    'fridge_internal.assert_current_stock_topology(uuid,text,timestamptz,fridge.inventory_placement_anchor_kind,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'public',
    'fridge_internal.guard_current_stock_topology()',
    'EXECUTE'
  ) then
    raise exception 'current StockItem topology guard helpers must not expose PUBLIC execute';
  end if;
end;
$$;

rollback;
