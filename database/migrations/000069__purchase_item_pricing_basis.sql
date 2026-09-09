-- FridgeScanner BE-06
-- 000069__purchase_item_pricing_basis.sql
-- Commit one immutable pricing basis and its exact source PRICING_BASIS money fact.

begin;

alter table fridge.household_procurement_command_registry
  drop constraint household_procurement_command_registry_intent_ck,
  add constraint household_procurement_command_registry_intent_ck
    check (intent_code in (
      'CREATE_PURCHASE',
      'COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS',
      'COMMIT_PURCHASE_ITEM_PRICING_BASIS'
    ));

create table fridge.household_purchase_item_pricing_basis_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  purchase_id uuid not null,
  purchase_item_id uuid not null,
  pricing_basis_quantity_num numeric not null,
  pricing_basis_quantity_den numeric not null,
  pricing_basis_unit_id uuid not null,
  pricing_conversion_evidence_id uuid,
  basis_amount numeric not null,
  provenance text not null,
  outcome_code text not null,
  result_purchase_item_money_fact_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_purchase_item_pricing_basis_command_pk primary key (household_id, command_id),
  constraint household_purchase_item_pricing_basis_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_basis_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_basis_command_item_fk
    foreign key (household_id, purchase_id, purchase_item_id)
    references fridge.purchase_item (household_id, purchase_id, purchase_item_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_basis_command_unit_fk
    foreign key (pricing_basis_unit_id) references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_basis_command_conversion_fk
    foreign key (pricing_conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_basis_command_result_fk
    foreign key (household_id, result_purchase_item_money_fact_id)
    references fridge.purchase_item_money_fact (household_id, purchase_item_money_fact_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_pricing_basis_command_quantity_ck
    check (
      pricing_basis_quantity_num > 0
      and fridge_internal.assert_normalized_rational(pricing_basis_quantity_num, pricing_basis_quantity_den)
    ),
  constraint household_purchase_item_pricing_basis_command_amount_ck check (basis_amount >= 0),
  constraint household_purchase_item_pricing_basis_command_provenance_ck check (btrim(provenance) <> ''),
  constraint household_purchase_item_pricing_basis_command_outcome_ck check (outcome_code in ('PENDING', 'COMMITTED')),
  constraint household_purchase_item_pricing_basis_command_result_ck check (
    (outcome_code = 'COMMITTED' and result_purchase_item_money_fact_id is not null)
    or (outcome_code = 'PENDING' and result_purchase_item_money_fact_id is null)
  )
);

comment on table fridge.household_purchase_item_pricing_basis_command is
  'Durable BE-06 idempotency identity for committing one immutable PurchaseItem pricing basis. Fingerprint binds actor, target, exact basis quantity/unit, conversion evidence identity, exact source amount and provenance; generated money-fact identity is result-only.';

create or replace function fridge_internal.guard_purchase_item_pricing_basis_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.pricing_basis_quantity_num is not null
     and (
       new.pricing_basis_quantity_num is distinct from old.pricing_basis_quantity_num
       or new.pricing_basis_quantity_den is distinct from old.pricing_basis_quantity_den
       or new.pricing_basis_unit_id is distinct from old.pricing_basis_unit_id
       or new.pricing_conversion_evidence_id is distinct from old.pricing_conversion_evidence_id
     ) then
    raise exception using errcode = '55000', message = 'committed PurchaseItem pricing basis is immutable';
  end if;
  return new;
end;
$$;

revoke all on function fridge_internal.guard_purchase_item_pricing_basis_immutable()
  from public, fridge_app, fridge_worker, fridge_readonly;

drop trigger if exists purchase_item_pricing_basis_immutable on fridge.purchase_item;
create trigger purchase_item_pricing_basis_immutable
before update on fridge.purchase_item
for each row execute function fridge_internal.guard_purchase_item_pricing_basis_immutable();

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
declare
  v_actor_role_code text;
  v_basis_amount numeric;
  v_provenance text;
  v_purchase_currency text;
  v_purchased_quantity_num numeric;
  v_purchased_quantity_den numeric;
  v_purchased_unit_id uuid;
  v_existing_basis_quantity_num numeric;
  v_basis_unit_locked uuid;
  v_evidence_locked uuid;
  v_existing_actor_user_id uuid;
  v_existing_purchase_id uuid;
  v_existing_purchase_item_id uuid;
  v_existing_basis_quantity_num_cmd numeric;
  v_existing_basis_quantity_den_cmd numeric;
  v_existing_basis_unit_id uuid;
  v_existing_conversion_evidence_id uuid;
  v_existing_basis_amount numeric;
  v_existing_provenance text;
  v_existing_outcome_code text;
  v_existing_result_id uuid;
  v_inserted_command_id uuid;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_procurement_admin_authority(
    p_household_id, p_actor_user_id, p_actor_membership_id
  );
  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_procurement_command_intent(
    p_household_id, p_command_id, 'COMMIT_PURCHASE_ITEM_PRICING_BASIS'
  );

  if p_purchase_id is null
     or p_purchase_item_id is null
     or p_pricing_basis_unit_id is null
     or p_candidate_purchase_item_money_fact_id is null
     or p_pricing_basis_quantity_num is null
     or p_pricing_basis_quantity_den is null
     or p_pricing_basis_quantity_num <= 0
     or not fridge_internal.assert_normalized_rational(p_pricing_basis_quantity_num, p_pricing_basis_quantity_den)
     or p_basis_amount_text is null
     or p_provenance is null
     or btrim(p_provenance) = '' then
    return query select 'INVALID_INPUT'::text, null::uuid;
    return;
  end if;

  begin
    v_basis_amount := p_basis_amount_text::numeric;
  exception
    when sqlstate '22P02' or sqlstate '22003' or sqlstate '22023' then
      return query select 'INVALID_INPUT'::text, null::uuid;
      return;
  end;
  if v_basis_amount < 0 or v_basis_amount::text in ('NaN', 'Infinity', '-Infinity') then
    return query select 'INVALID_INPUT'::text, null::uuid;
    return;
  end if;
  v_provenance := btrim(p_provenance);

  -- Committed replay is resolved after current authority but before target-state checks.
  select c.actor_user_id, c.purchase_id, c.purchase_item_id,
         c.pricing_basis_quantity_num, c.pricing_basis_quantity_den,
         c.pricing_basis_unit_id, c.pricing_conversion_evidence_id,
         c.basis_amount, c.provenance, c.outcome_code,
         c.result_purchase_item_money_fact_id
    into v_existing_actor_user_id, v_existing_purchase_id, v_existing_purchase_item_id,
         v_existing_basis_quantity_num_cmd, v_existing_basis_quantity_den_cmd,
         v_existing_basis_unit_id, v_existing_conversion_evidence_id,
         v_existing_basis_amount, v_existing_provenance, v_existing_outcome_code,
         v_existing_result_id
    from fridge.household_purchase_item_pricing_basis_command c
   where c.household_id = p_household_id and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_basis_quantity_num_cmd is distinct from p_pricing_basis_quantity_num
       or v_existing_basis_quantity_den_cmd is distinct from p_pricing_basis_quantity_den
       or v_existing_basis_unit_id is distinct from p_pricing_basis_unit_id
       or v_existing_conversion_evidence_id is distinct from p_pricing_conversion_evidence_id
       or v_existing_basis_amount is distinct from v_basis_amount
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;
    if v_existing_outcome_code = 'COMMITTED' then
      return query select 'COMMITTED'::text, v_existing_result_id;
      return;
    end if;
    raise exception 'unexpected pending PurchaseItem pricing basis command';
  end if;

  -- Canonical aggregate order: Purchase before PurchaseItem.
  select p.transaction_currency_code
    into v_purchase_currency
    from fridge.purchase p
   where p.household_id = p_household_id and p.purchase_id = p_purchase_id
   for key share;
  if v_purchase_currency is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  select pi.purchased_quantity_num, pi.purchased_quantity_den, pi.purchased_unit_id,
         pi.pricing_basis_quantity_num
    into v_purchased_quantity_num, v_purchased_quantity_den, v_purchased_unit_id,
         v_existing_basis_quantity_num
    from fridge.purchase_item pi
   where pi.household_id = p_household_id
     and pi.purchase_id = p_purchase_id
     and pi.purchase_item_id = p_purchase_item_id
   for update;
  if v_purchased_unit_id is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  -- A same-command peer may have committed while this execution waited on the item.
  select c.actor_user_id, c.purchase_id, c.purchase_item_id,
         c.pricing_basis_quantity_num, c.pricing_basis_quantity_den,
         c.pricing_basis_unit_id, c.pricing_conversion_evidence_id,
         c.basis_amount, c.provenance, c.outcome_code,
         c.result_purchase_item_money_fact_id
    into v_existing_actor_user_id, v_existing_purchase_id, v_existing_purchase_item_id,
         v_existing_basis_quantity_num_cmd, v_existing_basis_quantity_den_cmd,
         v_existing_basis_unit_id, v_existing_conversion_evidence_id,
         v_existing_basis_amount, v_existing_provenance, v_existing_outcome_code,
         v_existing_result_id
    from fridge.household_purchase_item_pricing_basis_command c
   where c.household_id = p_household_id and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_basis_quantity_num_cmd is distinct from p_pricing_basis_quantity_num
       or v_existing_basis_quantity_den_cmd is distinct from p_pricing_basis_quantity_den
       or v_existing_basis_unit_id is distinct from p_pricing_basis_unit_id
       or v_existing_conversion_evidence_id is distinct from p_pricing_conversion_evidence_id
       or v_existing_basis_amount is distinct from v_basis_amount
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;
    if v_existing_outcome_code = 'COMMITTED' then
      return query select 'COMMITTED'::text, v_existing_result_id;
      return;
    end if;
  end if;

  if v_existing_basis_quantity_num is not null then
    return query select 'CONFLICT'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from fridge.purchase_item_money_fact mf
     where mf.household_id = p_household_id
       and mf.purchase_item_id = p_purchase_item_id
       and mf.semantic_role = 'PRICING_BASIS'
       and mf.is_source_fact
  ) then
    return query select 'CONFLICT'::text, null::uuid;
    return;
  end if;

  -- Basis Unit is historical source evidence. It must exist, but late-arriving
  -- pricing evidence remains valid after MeasurementUnit retirement.
  select mu.measurement_unit_id
    into v_basis_unit_locked
    from fridge.measurement_unit mu
   where mu.measurement_unit_id = p_pricing_basis_unit_id
   for key share;
  if v_basis_unit_locked is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  if p_pricing_basis_unit_id = v_purchased_unit_id then
    if p_pricing_conversion_evidence_id is not null then
      return query select 'INVALID_INPUT'::text, null::uuid;
      return;
    end if;
  else
    if p_pricing_conversion_evidence_id is null then
      return query select 'INVALID_INPUT'::text, null::uuid;
      return;
    end if;
    select e.measurement_conversion_evidence_id
      into v_evidence_locked
      from fridge.measurement_conversion_evidence e
     where e.measurement_conversion_evidence_id = p_pricing_conversion_evidence_id
       and (e.household_id is null or e.household_id = p_household_id)
       and e.source_unit_id = v_purchased_unit_id
       and e.target_unit_id = p_pricing_basis_unit_id
       and e.source_quantity_num = v_purchased_quantity_num
       and e.source_quantity_den = v_purchased_quantity_den
     for key share;
    if v_evidence_locked is null then
      return query select 'NOT_FOUND'::text, null::uuid;
      return;
    end if;
  end if;

  insert into fridge.household_purchase_item_pricing_basis_command (
    household_id, command_id, actor_user_id, purchase_id, purchase_item_id,
    pricing_basis_quantity_num, pricing_basis_quantity_den, pricing_basis_unit_id,
    pricing_conversion_evidence_id, basis_amount, provenance, outcome_code
  ) values (
    p_household_id, p_command_id, p_actor_user_id, p_purchase_id, p_purchase_item_id,
    p_pricing_basis_quantity_num, p_pricing_basis_quantity_den, p_pricing_basis_unit_id,
    p_pricing_conversion_evidence_id, v_basis_amount, v_provenance, 'PENDING'
  )
  on conflict (household_id, command_id) do nothing
  returning command_id into v_inserted_command_id;

  if v_inserted_command_id is null then
    select c.actor_user_id, c.purchase_id, c.purchase_item_id,
           c.pricing_basis_quantity_num, c.pricing_basis_quantity_den,
           c.pricing_basis_unit_id, c.pricing_conversion_evidence_id,
           c.basis_amount, c.provenance, c.outcome_code,
           c.result_purchase_item_money_fact_id
      into v_existing_actor_user_id, v_existing_purchase_id, v_existing_purchase_item_id,
           v_existing_basis_quantity_num_cmd, v_existing_basis_quantity_den_cmd,
           v_existing_basis_unit_id, v_existing_conversion_evidence_id,
           v_existing_basis_amount, v_existing_provenance, v_existing_outcome_code,
           v_existing_result_id
      from fridge.household_purchase_item_pricing_basis_command c
     where c.household_id = p_household_id and c.command_id = p_command_id
     for update;

    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_basis_quantity_num_cmd is distinct from p_pricing_basis_quantity_num
       or v_existing_basis_quantity_den_cmd is distinct from p_pricing_basis_quantity_den
       or v_existing_basis_unit_id is distinct from p_pricing_basis_unit_id
       or v_existing_conversion_evidence_id is distinct from p_pricing_conversion_evidence_id
       or v_existing_basis_amount is distinct from v_basis_amount
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;
    if v_existing_outcome_code = 'COMMITTED' then
      return query select 'COMMITTED'::text, v_existing_result_id;
      return;
    end if;
  end if;

  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id, p_command_id, 'COMMIT_PURCHASE_ITEM_PRICING_BASIS'
  );

  update fridge.purchase_item
     set pricing_basis_quantity_num = p_pricing_basis_quantity_num,
         pricing_basis_quantity_den = p_pricing_basis_quantity_den,
         pricing_basis_unit_id = p_pricing_basis_unit_id,
         pricing_conversion_evidence_id = p_pricing_conversion_evidence_id
   where household_id = p_household_id
     and purchase_id = p_purchase_id
     and purchase_item_id = p_purchase_item_id;

  insert into fridge.purchase_item_money_fact (
    purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
    semantic_role, amount, currency_code, is_source_fact,
    money_rounding_policy_id, provenance
  ) values (
    p_candidate_purchase_item_money_fact_id, p_household_id, p_purchase_id, p_purchase_item_id,
    'PRICING_BASIS', v_basis_amount, v_purchase_currency, true, null, v_provenance
  );

  update fridge.household_purchase_item_pricing_basis_command
     set outcome_code = 'COMMITTED',
         result_purchase_item_money_fact_id = p_candidate_purchase_item_money_fact_id
   where household_id = p_household_id and command_id = p_command_id;

  return query select 'COMMITTED'::text, p_candidate_purchase_item_money_fact_id;
end;
$$;

comment on function fridge_internal.commit_purchase_item_pricing_basis(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, uuid, uuid, uuid, text, text
) is
  'Least-privileged BE-06 pricing-basis commit boundary. Commits immutable exact basis quantity/unit plus source PRICING_BASIS money evidence; it performs no line-gross extension or rounding.';

revoke all on table fridge.household_purchase_item_pricing_basis_command
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.commit_purchase_item_pricing_basis(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, uuid, uuid, uuid, text, text
) from public, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.commit_purchase_item_pricing_basis(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, uuid, uuid, uuid, text, text
) to fridge_app;

commit;
