-- FridgeScanner BE-06
-- 000070__purchase_item_pricing_extension.sql
-- Governed exact pricing extension, single monetary rounding boundary and
-- source-versus-computed LINE_GROSS discrepancy evidence.

begin;

alter table fridge.household_procurement_command_registry
  drop constraint household_procurement_command_registry_intent_ck,
  add constraint household_procurement_command_registry_intent_ck
    check (intent_code in (
      'CREATE_PURCHASE',
      'COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS',
      'COMMIT_PURCHASE_ITEM_PRICING_BASIS',
      'COMMIT_PURCHASE_ITEM_PRICING_EXTENSION'
    ));

-- At most one platform-computed gross exists for one PurchaseItem. Source gross
-- remains an independent fact and may coexist for reconciliation evidence.
create unique index purchase_item_computed_line_gross_uq
  on fridge.purchase_item_money_fact (household_id, purchase_item_id)
  where semantic_role = 'LINE_GROSS' and not is_source_fact;

create table fridge.household_purchase_item_pricing_extension_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  purchase_id uuid not null,
  purchase_item_id uuid not null,
  money_rounding_policy_id uuid not null,
  provenance text not null,
  outcome_code text not null,
  result_purchase_item_money_fact_id uuid,
  result_purchase_item_pricing_discrepancy_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_purchase_item_pricing_extension_command_pk
    primary key (household_id, command_id),
  constraint household_purchase_item_pricing_extension_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_extension_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_extension_command_item_fk
    foreign key (household_id, purchase_id, purchase_item_id)
    references fridge.purchase_item (household_id, purchase_id, purchase_item_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_extension_command_policy_fk
    foreign key (money_rounding_policy_id)
    references fridge.money_rounding_policy (money_rounding_policy_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_extension_command_fact_fk
    foreign key (household_id, result_purchase_item_money_fact_id)
    references fridge.purchase_item_money_fact (household_id, purchase_item_money_fact_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_extension_command_discrepancy_fk
    foreign key (household_id, result_purchase_item_pricing_discrepancy_id)
    references fridge.purchase_item_pricing_discrepancy (
      household_id,
      purchase_item_pricing_discrepancy_id
    )
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_extension_command_provenance_ck
    check (btrim(provenance) <> ''),
  constraint household_purchase_item_pricing_extension_command_outcome_ck
    check (outcome_code in ('PENDING', 'COMMITTED')),
  constraint household_purchase_item_pricing_extension_command_result_ck
    check (
      (outcome_code = 'PENDING' and result_purchase_item_money_fact_id is null
        and result_purchase_item_pricing_discrepancy_id is null)
      or
      (outcome_code = 'COMMITTED' and result_purchase_item_money_fact_id is not null)
    )
);

comment on table fridge.household_purchase_item_pricing_extension_command is
  'Durable BE-06 idempotency identity for one governed pricing extension. Semantic equality binds actor, target PurchaseItem, explicit MoneyRoundingPolicy and provenance; generated money-fact/discrepancy identities are result-only.';

create or replace function fridge_internal.guard_purchase_item_pricing_discrepancy_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'PurchaseItem pricing discrepancy evidence is history-bearing';
  end if;

  if new.household_id is distinct from old.household_id
     or new.purchase_id is distinct from old.purchase_id
     or new.purchase_item_id is distinct from old.purchase_item_id
     or new.source_amount is distinct from old.source_amount
     or new.computed_amount is distinct from old.computed_amount
     or new.currency_code is distinct from old.currency_code
     or new.money_rounding_policy_id is distinct from old.money_rounding_policy_id
     or new.quantity_conversion_evidence_id is distinct from old.quantity_conversion_evidence_id
     or new.reason is distinct from old.reason
     or new.recorded_at is distinct from old.recorded_at then
    raise exception using errcode = '55000', message = 'PurchaseItem pricing discrepancy evidence is immutable';
  end if;

  return new;
end;
$$;

comment on function fridge_internal.guard_purchase_item_pricing_discrepancy_history() is
  'Protects immutable pricing-discrepancy evidence while leaving resolution_status/resolution_provenance available only to a future governed resolution boundary.';

revoke all on function fridge_internal.guard_purchase_item_pricing_discrepancy_history()
  from public, fridge_app, fridge_worker, fridge_readonly;

drop trigger if exists purchase_item_pricing_discrepancy_history
  on fridge.purchase_item_pricing_discrepancy;
create trigger purchase_item_pricing_discrepancy_history
before update or delete on fridge.purchase_item_pricing_discrepancy
for each row execute function fridge_internal.guard_purchase_item_pricing_discrepancy_history();

create or replace function fridge_internal.commit_purchase_item_pricing_extension(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_purchase_id uuid,
  p_purchase_item_id uuid,
  p_money_rounding_policy_id uuid,
  p_candidate_purchase_item_money_fact_id uuid,
  p_candidate_pricing_discrepancy_id uuid,
  p_provenance text
)
returns table (
  outcome_code text,
  result_purchase_item_money_fact_id uuid,
  result_purchase_item_pricing_discrepancy_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_provenance text;
  v_purchase_currency text;
  v_purchase_occurred_at timestamptz;
  v_purchased_quantity_num numeric;
  v_purchased_quantity_den numeric;
  v_purchased_unit_id uuid;
  v_pricing_basis_quantity_num numeric;
  v_pricing_basis_quantity_den numeric;
  v_pricing_basis_unit_id uuid;
  v_pricing_conversion_evidence_id uuid;
  v_basis_amount numeric;
  v_source_line_gross numeric;
  v_extension_quantity_num numeric;
  v_extension_quantity_den numeric;
  v_policy_scale smallint;
  v_policy_algorithm_code text;
  v_policy_algorithm_version text;
  v_policy_locked uuid;
  v_amount_scale integer;
  v_amount_factor numeric;
  v_round_factor numeric;
  v_exact_numerator numeric;
  v_exact_denominator numeric;
  v_scaled_numerator numeric;
  v_quotient numeric;
  v_remainder numeric;
  v_computed_line_gross numeric;
  v_existing_actor_user_id uuid;
  v_existing_purchase_id uuid;
  v_existing_purchase_item_id uuid;
  v_existing_policy_id uuid;
  v_existing_provenance text;
  v_existing_outcome_code text;
  v_existing_result_fact_id uuid;
  v_existing_result_discrepancy_id uuid;
  v_inserted_command_id uuid;
  v_result_discrepancy_id uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_procurement_admin_authority(
    p_household_id, p_actor_user_id, p_actor_membership_id
  );
  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_procurement_command_intent(
    p_household_id, p_command_id, 'COMMIT_PURCHASE_ITEM_PRICING_EXTENSION'
  );

  if p_purchase_id is null
     or p_purchase_item_id is null
     or p_money_rounding_policy_id is null
     or p_candidate_purchase_item_money_fact_id is null
     or p_candidate_pricing_discrepancy_id is null
     or p_provenance is null
     or btrim(p_provenance) = '' then
    return query select 'INVALID_INPUT'::text, null::uuid, null::uuid;
    return;
  end if;
  v_provenance := btrim(p_provenance);

  -- Committed replay is resolved after current authority but before current
  -- target-state checks; generated result identities are not semantic input.
  select c.actor_user_id, c.purchase_id, c.purchase_item_id,
         c.money_rounding_policy_id, c.provenance, c.outcome_code,
         c.result_purchase_item_money_fact_id,
         c.result_purchase_item_pricing_discrepancy_id
    into v_existing_actor_user_id, v_existing_purchase_id, v_existing_purchase_item_id,
         v_existing_policy_id, v_existing_provenance, v_existing_outcome_code,
         v_existing_result_fact_id, v_existing_result_discrepancy_id
    from fridge.household_purchase_item_pricing_extension_command c
   where c.household_id = p_household_id and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_policy_id is distinct from p_money_rounding_policy_id
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::uuid;
      return;
    end if;
    if v_existing_outcome_code = 'COMMITTED' then
      return query select 'COMMITTED'::text,
        v_existing_result_fact_id, v_existing_result_discrepancy_id;
      return;
    end if;
    raise exception 'unexpected pending PurchaseItem pricing extension command';
  end if;

  -- Canonical aggregate order: Purchase before PurchaseItem.
  select p.transaction_currency_code, p.occurred_at
    into v_purchase_currency, v_purchase_occurred_at
    from fridge.purchase p
   where p.household_id = p_household_id and p.purchase_id = p_purchase_id
   for key share;
  if v_purchase_currency is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  select pi.purchased_quantity_num, pi.purchased_quantity_den, pi.purchased_unit_id,
         pi.pricing_basis_quantity_num, pi.pricing_basis_quantity_den,
         pi.pricing_basis_unit_id, pi.pricing_conversion_evidence_id
    into v_purchased_quantity_num, v_purchased_quantity_den, v_purchased_unit_id,
         v_pricing_basis_quantity_num, v_pricing_basis_quantity_den,
         v_pricing_basis_unit_id, v_pricing_conversion_evidence_id
    from fridge.purchase_item pi
   where pi.household_id = p_household_id
     and pi.purchase_id = p_purchase_id
     and pi.purchase_item_id = p_purchase_item_id
   for update;
  if v_purchased_unit_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  -- Same-command peer may have committed while this execution waited on item.
  select c.actor_user_id, c.purchase_id, c.purchase_item_id,
         c.money_rounding_policy_id, c.provenance, c.outcome_code,
         c.result_purchase_item_money_fact_id,
         c.result_purchase_item_pricing_discrepancy_id
    into v_existing_actor_user_id, v_existing_purchase_id, v_existing_purchase_item_id,
         v_existing_policy_id, v_existing_provenance, v_existing_outcome_code,
         v_existing_result_fact_id, v_existing_result_discrepancy_id
    from fridge.household_purchase_item_pricing_extension_command c
   where c.household_id = p_household_id and c.command_id = p_command_id
   for update;
  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_policy_id is distinct from p_money_rounding_policy_id
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::uuid;
      return;
    end if;
    if v_existing_outcome_code = 'COMMITTED' then
      return query select 'COMMITTED'::text,
        v_existing_result_fact_id, v_existing_result_discrepancy_id;
      return;
    end if;
  end if;

  if v_pricing_basis_quantity_num is null
     or v_pricing_basis_quantity_den is null
     or v_pricing_basis_unit_id is null then
    return query select 'CONFLICT'::text, null::uuid, null::uuid;
    return;
  end if;

  if exists (
    select 1 from fridge.purchase_item_money_fact mf
     where mf.household_id = p_household_id
       and mf.purchase_item_id = p_purchase_item_id
       and mf.semantic_role = 'LINE_GROSS'
       and not mf.is_source_fact
  ) then
    return query select 'CONFLICT'::text, null::uuid, null::uuid;
    return;
  end if;

  select mf.amount
    into v_basis_amount
    from fridge.purchase_item_money_fact mf
   where mf.household_id = p_household_id
     and mf.purchase_item_id = p_purchase_item_id
     and mf.semantic_role = 'PRICING_BASIS'
     and mf.is_source_fact
   for key share;
  if v_basis_amount is null then
    return query select 'CONFLICT'::text, null::uuid, null::uuid;
    return;
  end if;

  select mf.amount
    into v_source_line_gross
    from fridge.purchase_item_money_fact mf
   where mf.household_id = p_household_id
     and mf.purchase_item_id = p_purchase_item_id
     and mf.semantic_role = 'LINE_GROSS'
     and mf.is_source_fact
   for key share;

  -- Explicit policy identity; never choose/default one heuristically. Historical
  -- eligibility is anchored to Purchase.occurred_at, not current lifecycle state.
  select rp.money_rounding_policy_id, rp.decimal_scale,
         rp.rounding_algorithm_code, rp.rounding_algorithm_version
    into v_policy_locked, v_policy_scale,
         v_policy_algorithm_code, v_policy_algorithm_version
    from fridge.money_rounding_policy rp
   where rp.money_rounding_policy_id = p_money_rounding_policy_id
     and rp.currency_code = v_purchase_currency
     and rp.effective_from <= v_purchase_occurred_at
     and (rp.effective_to is null or rp.effective_to > v_purchase_occurred_at)
   for key share;
  if v_policy_locked is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  -- Versioned executable contract. Stored algorithm text is never dynamically
  -- executed. New algorithms require a new reviewed code path.
  if v_policy_algorithm_code <> 'DECIMAL_HALF_AWAY_FROM_ZERO'
     or v_policy_algorithm_version <> '1' then
    return query select 'UNSUPPORTED_POLICY'::text, null::uuid, null::uuid;
    return;
  end if;

  -- Resolve the purchased quantity in pricing-basis units. For cross-unit
  -- pricing #60 physically guarantees evidence source/target exactly match the
  -- committed PurchaseItem source and pricing-basis target.
  if v_purchased_unit_id = v_pricing_basis_unit_id then
    v_extension_quantity_num := v_purchased_quantity_num;
    v_extension_quantity_den := v_purchased_quantity_den;
  else
    if v_pricing_conversion_evidence_id is null then
      return query select 'CONFLICT'::text, null::uuid, null::uuid;
      return;
    end if;
    select e.target_quantity_num, e.target_quantity_den
      into v_extension_quantity_num, v_extension_quantity_den
      from fridge.measurement_conversion_evidence e
     where e.measurement_conversion_evidence_id = v_pricing_conversion_evidence_id
       and (e.household_id is null or e.household_id = p_household_id)
       and e.source_unit_id = v_purchased_unit_id
       and e.source_quantity_num = v_purchased_quantity_num
       and e.source_quantity_den = v_purchased_quantity_den
       and e.target_unit_id = v_pricing_basis_unit_id
       and e.target_quantity_num = v_pricing_basis_quantity_num
       and e.target_quantity_den = v_pricing_basis_quantity_den
     for key share;
    if v_extension_quantity_num is null then
      return query select 'CONFLICT'::text, null::uuid, null::uuid;
      return;
    end if;
  end if;

  -- Exact rational extension, then exactly one monetary rounding boundary.
  -- Convert the exact decimal basis amount to an integer coefficient, keep the
  -- quantity extension as integer rational arithmetic, then use div/mod for
  -- half-away-from-zero. LINE_GROSS is nonnegative in this contract.
  v_amount_scale := scale(v_basis_amount);
  v_amount_factor := power(10::numeric, v_amount_scale);
  v_round_factor := power(10::numeric, v_policy_scale);
  v_exact_numerator := (v_basis_amount * v_amount_factor)
    * v_extension_quantity_num * v_pricing_basis_quantity_den;
  v_exact_denominator := v_amount_factor
    * v_extension_quantity_den * v_pricing_basis_quantity_num;
  v_scaled_numerator := v_exact_numerator * v_round_factor;
  v_quotient := div(v_scaled_numerator, v_exact_denominator);
  v_remainder := mod(v_scaled_numerator, v_exact_denominator);
  if v_remainder * 2 >= v_exact_denominator then
    v_quotient := v_quotient + 1;
  end if;
  v_computed_line_gross := v_quotient / v_round_factor;

  insert into fridge.household_purchase_item_pricing_extension_command (
    household_id, command_id, actor_user_id, purchase_id, purchase_item_id,
    money_rounding_policy_id, provenance, outcome_code
  ) values (
    p_household_id, p_command_id, p_actor_user_id, p_purchase_id, p_purchase_item_id,
    p_money_rounding_policy_id, v_provenance, 'PENDING'
  )
  on conflict (household_id, command_id) do nothing
  returning command_id into v_inserted_command_id;

  if v_inserted_command_id is null then
    select c.actor_user_id, c.purchase_id, c.purchase_item_id,
           c.money_rounding_policy_id, c.provenance, c.outcome_code,
           c.result_purchase_item_money_fact_id,
           c.result_purchase_item_pricing_discrepancy_id
      into v_existing_actor_user_id, v_existing_purchase_id, v_existing_purchase_item_id,
           v_existing_policy_id, v_existing_provenance, v_existing_outcome_code,
           v_existing_result_fact_id, v_existing_result_discrepancy_id
      from fridge.household_purchase_item_pricing_extension_command c
     where c.household_id = p_household_id and c.command_id = p_command_id
     for update;
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_policy_id is distinct from p_money_rounding_policy_id
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::uuid;
      return;
    end if;
    if v_existing_outcome_code = 'COMMITTED' then
      return query select 'COMMITTED'::text,
        v_existing_result_fact_id, v_existing_result_discrepancy_id;
      return;
    end if;
    raise exception 'unexpected pending PurchaseItem pricing extension command after serialization';
  end if;

  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id, p_command_id, 'COMMIT_PURCHASE_ITEM_PRICING_EXTENSION'
  );

  insert into fridge.purchase_item_money_fact (
    purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
    semantic_role, amount, currency_code, is_source_fact,
    money_rounding_policy_id, provenance
  ) values (
    p_candidate_purchase_item_money_fact_id, p_household_id, p_purchase_id,
    p_purchase_item_id, 'LINE_GROSS', v_computed_line_gross,
    v_purchase_currency, false, p_money_rounding_policy_id, v_provenance
  );

  v_result_discrepancy_id := null;
  if v_source_line_gross is not null
     and v_source_line_gross is distinct from v_computed_line_gross then
    insert into fridge.purchase_item_pricing_discrepancy (
      purchase_item_pricing_discrepancy_id, household_id, purchase_id, purchase_item_id,
      source_amount, computed_amount, currency_code, money_rounding_policy_id,
      quantity_conversion_evidence_id, reason, resolution_status,
      resolution_provenance
    ) values (
      p_candidate_pricing_discrepancy_id, p_household_id, p_purchase_id,
      p_purchase_item_id, v_source_line_gross, v_computed_line_gross,
      v_purchase_currency, p_money_rounding_policy_id,
      v_pricing_conversion_evidence_id, 'SOURCE_LINE_GROSS_MISMATCH', 'OPEN', null
    );
    v_result_discrepancy_id := p_candidate_pricing_discrepancy_id;
  end if;

  update fridge.household_purchase_item_pricing_extension_command
     set outcome_code = 'COMMITTED',
         result_purchase_item_money_fact_id = p_candidate_purchase_item_money_fact_id,
         result_purchase_item_pricing_discrepancy_id = v_result_discrepancy_id
   where household_id = p_household_id and command_id = p_command_id;

  return query select 'COMMITTED'::text,
    p_candidate_purchase_item_money_fact_id, v_result_discrepancy_id;
end;
$$;

comment on function fridge_internal.commit_purchase_item_pricing_extension(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text
) is
  'Least-privileged BE-06 pricing extension boundary. Performs exact rational extension, executes only explicitly supported versioned monetary rounding, persists computed LINE_GROSS and preserves source mismatch as PricingDiscrepancy evidence.';

revoke all on table fridge.household_purchase_item_pricing_extension_command
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.commit_purchase_item_pricing_extension(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text
) from public, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.commit_purchase_item_pricing_extension(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text
) to fridge_app;

commit;
