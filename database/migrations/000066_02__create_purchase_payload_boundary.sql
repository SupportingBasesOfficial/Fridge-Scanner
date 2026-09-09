-- FridgeScanner BE-06 boundary hardening
-- 000066_02__create_purchase_payload_boundary.sql
-- Keep the full mutation implementation private and expose a narrow runtime
-- wrapper that rejects malformed JSON before any implementation casts/DML.

begin;

alter function fridge_internal.create_household_purchase(
  uuid, uuid, uuid, uuid, uuid, text, jsonb
) rename to create_household_purchase_impl;

revoke all on function fridge_internal.create_household_purchase_impl(
  uuid, uuid, uuid, uuid, uuid, text, jsonb
) from public, fridge_app, fridge_worker, fridge_readonly;

create or replace function fridge_internal.create_household_purchase(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_purchase_id uuid,
  p_transaction_currency_code text,
  p_items jsonb
)
returns table (
  outcome_code text,
  result_purchase_id uuid,
  line_no integer,
  result_purchase_item_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_element jsonb;
  v_candidate_item_id uuid;
  v_product_id uuid;
  v_unit_id uuid;
  v_quantity_num numeric;
  v_quantity_den numeric;
begin
  if p_items is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
    return;
  end if;

  for v_element in
    select e.value
      from jsonb_array_elements(p_items) as e(value)
  loop
    if jsonb_typeof(v_element) is distinct from 'object'
       or not (v_element ? 'candidatePurchaseItemId')
       or not (v_element ? 'productId')
       or not (v_element ? 'quantityNumerator')
       or not (v_element ? 'quantityDenominator')
       or not (v_element ? 'measurementUnitId')
       or jsonb_typeof(v_element -> 'candidatePurchaseItemId') is distinct from 'string'
       or jsonb_typeof(v_element -> 'productId') is distinct from 'string'
       or jsonb_typeof(v_element -> 'quantityNumerator') is distinct from 'string'
       or jsonb_typeof(v_element -> 'quantityDenominator') is distinct from 'string'
       or jsonb_typeof(v_element -> 'measurementUnitId') is distinct from 'string' then
      return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
      return;
    end if;

    begin
      v_candidate_item_id := (v_element ->> 'candidatePurchaseItemId')::uuid;
      v_product_id := (v_element ->> 'productId')::uuid;
      v_quantity_num := (v_element ->> 'quantityNumerator')::numeric;
      v_quantity_den := (v_element ->> 'quantityDenominator')::numeric;
      v_unit_id := (v_element ->> 'measurementUnitId')::uuid;
    exception
      when sqlstate '22P02' or sqlstate '22003' or sqlstate '22023' or sqlstate '22012' then
        return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
        return;
    end;

    if v_candidate_item_id is null
       or v_product_id is null
       or v_unit_id is null
       or v_quantity_num is null
       or v_quantity_den is null then
      return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
      return;
    end if;
  end loop;

  begin
    return query
    select *
      from fridge_internal.create_household_purchase_impl(
        p_household_id,
        p_actor_user_id,
        p_actor_membership_id,
        p_command_id,
        p_candidate_purchase_id,
        p_transaction_currency_code,
        p_items
      );
  exception
    when sqlstate 'P6P01' then
      return query select 'NOT_FOUND'::text, null::uuid, null::integer, null::uuid;
      return;
  end;
end;
$$;

comment on function fridge_internal.create_household_purchase(uuid, uuid, uuid, uuid, uuid, text, jsonb) is
  'Least-privileged runtime CreatePurchase boundary. Rejects malformed ordered item JSON before delegating to the private governed mutation implementation and collapses current-Product race loss to provider-neutral NOT_FOUND.';

revoke all on function fridge_internal.create_household_purchase(
  uuid, uuid, uuid, uuid, uuid, text, jsonb
) from public;

grant execute on function fridge_internal.create_household_purchase(
  uuid, uuid, uuid, uuid, uuid, text, jsonb
) to fridge_app;

commit;
