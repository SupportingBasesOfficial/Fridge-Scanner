-- FridgeScanner BE-06 boundary hardening
-- 000069_02__purchase_item_pricing_basis_lexical_boundary.sql
-- Preserve canonical exact-decimal identity even when the use case is bypassed.

begin;

alter function fridge_internal.commit_purchase_item_pricing_basis(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, uuid, uuid, uuid, text, text
) rename to commit_purchase_item_pricing_basis_impl;

revoke all on function fridge_internal.commit_purchase_item_pricing_basis_impl(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, uuid, uuid, uuid, text, text
) from public, fridge_app, fridge_worker, fridge_readonly;

create or replace function fridge_internal.commit_purchase_item_pricing_basis(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_purchase_id uuid,
  p_purchase_item_id uuid,
  p_pricing_basis_quantity_num numeric,
  p_pricing_basis_quantity_den numeric,
  p_pricing_basis_unit_id uuid,
  p_pricing_conversion_evidence_id uuid,
  p_candidate_purchase_item_money_fact_id uuid,
  p_basis_amount_text text,
  p_provenance text
)
returns table (outcome_code text, result_purchase_item_money_fact_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  -- Canonical source-money syntax is part of command identity. PostgreSQL
  -- numeric accepts alternate lexical spellings (for example 01.00 and 1e2),
  -- so reject them before the private implementation can canonicalize by cast.
  if p_basis_amount_text is null
     or p_basis_amount_text !~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' then
    return query select 'INVALID_INPUT'::text, null::uuid;
    return;
  end if;

  return query
  select *
    from fridge_internal.commit_purchase_item_pricing_basis_impl(
      p_household_id,
      p_actor_user_id,
      p_actor_membership_id,
      p_command_id,
      p_purchase_id,
      p_purchase_item_id,
      p_pricing_basis_quantity_num,
      p_pricing_basis_quantity_den,
      p_pricing_basis_unit_id,
      p_pricing_conversion_evidence_id,
      p_candidate_purchase_item_money_fact_id,
      p_basis_amount_text,
      p_provenance
    );
end;
$$;

comment on function fridge_internal.commit_purchase_item_pricing_basis(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, uuid, uuid, uuid, text, text
) is
  'Least-privileged BE-06 pricing-basis runtime boundary. Enforces canonical nonnegative exact-decimal source syntax before delegating to the private governed implementation; performs no line-gross extension or rounding.';

revoke all on function fridge_internal.commit_purchase_item_pricing_basis(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, uuid, uuid, uuid, text, text
) from public, fridge_worker, fridge_readonly;

grant execute on function fridge_internal.commit_purchase_item_pricing_basis(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, uuid, uuid, uuid, text, text
) to fridge_app;

commit;
