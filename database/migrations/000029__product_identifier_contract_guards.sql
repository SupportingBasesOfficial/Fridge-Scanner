-- FridgeScanner DB-02
-- 000029__product_identifier_contract_guards.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Pins canonical/staged identifiers to the exact normalization namespace contract.

begin;

create or replace function fridge_internal.assert_product_identifier_contract(
  p_product_identifier_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_identifier fridge.product_identifier%rowtype;
  v_rule fridge.product_identifier_normalization_rule%rowtype;
  v_product fridge.product%rowtype;
begin
  select * into v_identifier
    from fridge.product_identifier
   where product_identifier_id = p_product_identifier_id;
  if not found then return; end if;

  select * into v_rule
    from fridge.product_identifier_normalization_rule
   where normalization_rule_id = v_identifier.normalization_rule_id;
  select * into v_product from fridge.product where product_id = v_identifier.product_id;

  if v_identifier.scheme_code <> v_rule.scheme_code then
    raise exception using errcode = '23514', message = 'ProductIdentifier scheme must match normalization rule scheme';
  end if;

  if v_rule.namespace_mode = 'GLOBAL' then
    if v_identifier.issuer_namespace is not null then
      raise exception using errcode = '23514', message = 'GLOBAL normalization namespace forbids issuer_namespace on ProductIdentifier';
    end if;
    if v_product.catalog_scope <> 'GLOBAL' then
      raise exception using errcode = '23514', message = 'GLOBAL canonical ProductIdentifier may attach only to GLOBAL Product';
    end if;
  else
    if v_identifier.issuer_namespace is distinct from v_rule.issuer_namespace then
      raise exception using errcode = '23514', message = 'issuer-scoped ProductIdentifier must match normalization rule issuer namespace';
    end if;
  end if;
end;
$$;

revoke all on function fridge_internal.assert_product_identifier_contract(uuid) from public;

create or replace function fridge_internal.assert_staged_identifier_claim_contract(
  p_claim_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_claim fridge.staged_identifier_claim%rowtype;
  v_rule fridge.product_identifier_normalization_rule%rowtype;
  v_candidate fridge.product%rowtype;
begin
  select * into v_claim
    from fridge.staged_identifier_claim
   where staged_identifier_claim_id = p_claim_id;
  if not found then return; end if;

  if v_claim.candidate_product_id is not null then
    select * into v_candidate from fridge.product where product_id = v_claim.candidate_product_id;
    if v_candidate.catalog_scope <> 'HOUSEHOLD'
       or v_candidate.owner_household_id <> v_claim.household_id then
      raise exception using errcode = '23514', message = 'staged identifier candidate Product must be private to the same Household';
    end if;
  end if;

  if v_claim.normalization_rule_id is null then
    if v_claim.normalized_value is not null then
      raise exception using errcode = '23514', message = 'staged normalized value requires an exact normalization rule';
    end if;
    return;
  end if;

  select * into v_rule
    from fridge.product_identifier_normalization_rule
   where normalization_rule_id = v_claim.normalization_rule_id;

  if v_claim.normalized_value is null then
    raise exception using errcode = '23514', message = 'staged normalization rule requires normalized value';
  end if;
  if v_claim.scheme_code <> v_rule.scheme_code then
    raise exception using errcode = '23514', message = 'staged identifier scheme must match normalization rule scheme';
  end if;
  if v_rule.namespace_mode = 'GLOBAL' then
    if v_claim.issuer_namespace is not null then
      raise exception using errcode = '23514', message = 'GLOBAL staged normalization namespace forbids issuer_namespace';
    end if;
  elsif v_claim.issuer_namespace is distinct from v_rule.issuer_namespace then
    raise exception using errcode = '23514', message = 'staged issuer namespace must match normalization rule issuer namespace';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_staged_identifier_claim_contract(uuid) from public;

create or replace function fridge_internal.guard_identifier_contract_row()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_table_name = 'product_identifier' then
    perform fridge_internal.assert_product_identifier_contract(new.product_identifier_id);
  elsif tg_table_name = 'staged_identifier_claim' then
    perform fridge_internal.assert_staged_identifier_claim_contract(new.staged_identifier_claim_id);
  end if;
  return null;
end;
$$;

revoke all on function fridge_internal.guard_identifier_contract_row() from public;

create constraint trigger product_identifier_contract_guard
after insert or update on fridge.product_identifier
deferrable initially deferred
for each row execute function fridge_internal.guard_identifier_contract_row();

create constraint trigger staged_identifier_claim_contract_guard
after insert or update on fridge.staged_identifier_claim
deferrable initially deferred
for each row execute function fridge_internal.guard_identifier_contract_row();

commit;
