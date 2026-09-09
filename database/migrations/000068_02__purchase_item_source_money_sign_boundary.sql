-- FridgeScanner BE-06 boundary hardening
-- 000068_02__purchase_item_source_money_sign_boundary.sql
-- Keep source-money sign semantics explicit at the runtime SQL boundary.

begin;

alter function fridge_internal.commit_purchase_item_source_money_facts(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) rename to commit_purchase_item_source_money_facts_impl;

revoke all on function fridge_internal.commit_purchase_item_source_money_facts_impl(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) from public, fridge_app, fridge_worker, fridge_readonly;

create or replace function fridge_internal.commit_purchase_item_source_money_facts(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_purchase_id uuid,
  p_purchase_item_id uuid,
  p_facts jsonb
)
returns table (
  outcome_code text,
  line_no integer,
  result_purchase_item_money_fact_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_element jsonb;
  v_amount numeric;
begin
  -- This intent has no accepted refund/credit semantics. Canonical source
  -- gross/discount/tax/charge/net amounts are therefore nonnegative. Zero is
  -- valid evidence; future negative-money workflows require explicit roles.
  if p_facts is not null and jsonb_typeof(p_facts) = 'array' then
    for v_element in
      select e.value from jsonb_array_elements(p_facts) as e(value)
    loop
      if jsonb_typeof(v_element) = 'object'
         and jsonb_typeof(v_element -> 'amount') = 'string' then
        begin
          v_amount := (v_element ->> 'amount')::numeric;
        exception
          when sqlstate '22P02' or sqlstate '22003' or sqlstate '22023' then
            return query select 'INVALID_INPUT'::text, null::integer, null::uuid;
            return;
        end;

        if v_amount < 0 then
          return query select 'INVALID_INPUT'::text, null::integer, null::uuid;
          return;
        end if;
      end if;
    end loop;
  end if;

  return query
  select *
    from fridge_internal.commit_purchase_item_source_money_facts_impl(
      p_household_id,
      p_actor_user_id,
      p_actor_membership_id,
      p_command_id,
      p_purchase_id,
      p_purchase_item_id,
      p_facts
    );
end;
$$;

comment on function fridge_internal.commit_purchase_item_source_money_facts(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) is
  'Least-privileged PurchaseItem source-money runtime boundary. Rejects negative canonical source-role amounts before delegating to the private governed implementation; refund/credit semantics require a future explicit intent/role contract.';

revoke all on function fridge_internal.commit_purchase_item_source_money_facts(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) from public;

grant execute on function fridge_internal.commit_purchase_item_source_money_facts(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) to fridge_app;

commit;
