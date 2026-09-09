-- FridgeScanner BE-05
-- 000061__resolve_product_identifier.sql
-- Read-only canonical ProductIdentifier resolution for one authorized Household.

begin;

-- Canonical ProductIdentifier observations now cross one governed current-read
-- boundary. Earlier DB-02 capability grants included direct SELECT on this
-- relation; retaining it would permit callers to bypass exact-membership,
-- lifecycle, namespace-rule and Product-visibility revalidation.
revoke select on table fridge.product_identifier from fridge_app, fridge_worker, fridge_readonly;

create or replace function fridge_internal.resolve_current_product_identifier(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_scheme_code text,
  p_issuer_namespace text,
  p_normalization_rule_id uuid,
  p_normalized_value text
)
returns table (
  outcome_code text,
  result_product_identifier_id uuid,
  result_product_id uuid
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
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid;
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
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid;
    return;
  end if;

  return query
  select 'FOUND'::text,
         pi.product_identifier_id,
         pi.product_id
    from fridge.product_identifier pi
    join fridge.product p on p.product_id = pi.product_id
    join fridge.product_identifier_normalization_rule nr
      on nr.normalization_rule_id = pi.normalization_rule_id
   where pi.scheme_code = p_scheme_code
     and pi.normalization_rule_id = p_normalization_rule_id
     and pi.normalized_value = p_normalized_value
     and pi.issuer_namespace is not distinct from p_issuer_namespace
     and pi.lifecycle_status = 'ACTIVE'
     and pi.retired_at is null
     and p.lifecycle_status = 'ACTIVE'
     and nr.scheme_code = p_scheme_code
     and (
       (nr.namespace_mode = 'GLOBAL'::fridge.identifier_namespace_mode
        and nr.issuer_namespace is null
        and p_issuer_namespace is null
        and p.catalog_scope = 'GLOBAL'::fridge.catalog_scope)
       or
       (nr.namespace_mode = 'ISSUER_SCOPED'::fridge.identifier_namespace_mode
        and nr.issuer_namespace is not distinct from p_issuer_namespace)
     )
     and (
       p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (
         p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
         and p.owner_household_id = p_household_id
       )
     );

  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid;
  end if;
end;
$$;

comment on function fridge_internal.resolve_current_product_identifier(uuid, uuid, uuid, text, text, uuid, text) is
  'Resolves one exact already-normalized canonical ProductIdentifier key for an authorized Household. Returns only ACTIVE non-retired identifiers bound to ACTIVE Products visible as GLOBAL or same-Household private, and independently reasserts that GLOBAL normalization namespaces bind only GLOBAL Products. Missing, retired, foreign, namespace/rule-mismatched and otherwise invisible bindings collapse to NOT_FOUND. Performs no normalization and no writes.';

revoke all on function fridge_internal.resolve_current_product_identifier(uuid, uuid, uuid, text, text, uuid, text) from public;
grant execute on function fridge_internal.resolve_current_product_identifier(uuid, uuid, uuid, text, text, uuid, text) to fridge_app;

commit;
