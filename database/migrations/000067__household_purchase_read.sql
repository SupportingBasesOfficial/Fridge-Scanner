-- FridgeScanner BE-06
-- 000067__household_purchase_read.sql
-- Historical Purchase/PurchaseItem observations under current Household membership.

begin;

create or replace function fridge_internal.list_household_purchases(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_limit integer,
  p_cursor_occurred_at timestamptz,
  p_cursor_purchase_id uuid
)
returns table (
  authorized boolean,
  purchase_id uuid,
  transaction_currency_code text,
  occurred_at timestamptz,
  recorded_at timestamptz,
  item_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_membership uuid;
begin
  if p_limit < 1 or p_limit > 101 then
    raise exception using errcode = '22023', message = 'invalid Purchase read limit';
  end if;
  if (p_cursor_occurred_at is null) <> (p_cursor_purchase_id is null) then
    raise exception using errcode = '22023', message = 'incomplete Purchase read cursor';
  end if;

  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select false, null::uuid, null::text, null::timestamptz, null::timestamptz, null::bigint;
    return;
  end if;

  select hm.membership_id
    into v_actor_membership
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_actor_user_id
     and hm.membership_id = p_actor_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp());

  if v_actor_membership is null then
    return query select false, null::uuid, null::text, null::timestamptz, null::timestamptz, null::bigint;
    return;
  end if;

  return query
  select true,
         p.purchase_id,
         p.transaction_currency_code,
         p.occurred_at,
         p.recorded_at,
         count(pi.purchase_item_id)::bigint
    from fridge.purchase p
    left join fridge.purchase_item pi
      on pi.household_id = p.household_id
     and pi.purchase_id = p.purchase_id
   where p.household_id = p_household_id
     and (
       p_cursor_occurred_at is null
       or (p.occurred_at, p.purchase_id) < (p_cursor_occurred_at, p_cursor_purchase_id)
     )
   group by p.purchase_id, p.transaction_currency_code, p.occurred_at, p.recorded_at
   order by p.occurred_at desc, p.purchase_id desc
   limit p_limit;

  if not found then
    return query select true, null::uuid, null::text, null::timestamptz, null::timestamptz, null::bigint;
  end if;
end;
$$;

create or replace function fridge_internal.get_household_purchase(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_purchase_id uuid
)
returns table (
  outcome_code text,
  result_purchase_id uuid,
  transaction_currency_code text,
  occurred_at timestamptz,
  purchase_recorded_at timestamptz,
  purchase_item_id uuid,
  product_id uuid,
  quantity_num numeric,
  quantity_den numeric,
  measurement_unit_id uuid,
  item_recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_membership uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::text, null::timestamptz, null::timestamptz,
                        null::uuid, null::uuid, null::numeric, null::numeric, null::uuid, null::timestamptz;
    return;
  end if;

  select hm.membership_id
    into v_actor_membership
    from fridge.household_membership hm
   where hm.household_id = p_household_id
     and hm.user_id = p_actor_user_id
     and hm.membership_id = p_actor_membership_id
     and hm.lifecycle_status = 'ACTIVE'
     and hm.effective_from <= statement_timestamp()
     and (hm.effective_to is null or hm.effective_to > statement_timestamp());

  if v_actor_membership is null then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::text, null::timestamptz, null::timestamptz,
                        null::uuid, null::uuid, null::numeric, null::numeric, null::uuid, null::timestamptz;
    return;
  end if;

  return query
  select 'FOUND'::text,
         p.purchase_id,
         p.transaction_currency_code,
         p.occurred_at,
         p.recorded_at,
         pi.purchase_item_id,
         pi.product_id,
         pi.purchased_quantity_num,
         pi.purchased_quantity_den,
         pi.purchased_unit_id,
         pi.recorded_at
    from fridge.purchase p
    left join fridge.purchase_item pi
      on pi.household_id = p.household_id
     and pi.purchase_id = p.purchase_id
   where p.household_id = p_household_id
     and p.purchase_id = p_purchase_id
   order by pi.purchase_item_id;

  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::text, null::timestamptz, null::timestamptz,
                        null::uuid, null::uuid, null::numeric, null::numeric, null::uuid, null::timestamptz;
  end if;
end;
$$;

comment on function fridge_internal.list_household_purchases(uuid, uuid, uuid, integer, timestamptz, uuid) is
  'Keyset-paginates historical Purchase summaries for one currently authorized Household by occurred_at DESC, purchase_id DESC. No totals/count metadata beyond page-local item cardinality are exposed.';
comment on function fridge_internal.get_household_purchase(uuid, uuid, uuid, uuid) is
  'Returns one Household Purchase and its historical PurchaseItems. Foreign-Household and missing targets collapse to NOT_FOUND; current membership is required for observation.';

revoke all on function fridge_internal.list_household_purchases(uuid, uuid, uuid, integer, timestamptz, uuid) from public;
revoke all on function fridge_internal.get_household_purchase(uuid, uuid, uuid, uuid) from public;
grant execute on function fridge_internal.list_household_purchases(uuid, uuid, uuid, integer, timestamptz, uuid) to fridge_app;
grant execute on function fridge_internal.get_household_purchase(uuid, uuid, uuid, uuid) to fridge_app;

commit;
