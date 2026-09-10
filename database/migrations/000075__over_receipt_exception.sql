-- FridgeScanner BE-06
-- 000075__over_receipt_exception.sql
-- Govern explicit pre-materialization over-receipt discrepancy detection.

begin;

alter table fridge.household_procurement_command_registry
  drop constraint household_procurement_command_registry_intent_ck,
  add constraint household_procurement_command_registry_intent_ck
    check (intent_code in (
      'CREATE_PURCHASE',
      'COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS',
      'COMMIT_PURCHASE_ITEM_PRICING_BASIS',
      'COMMIT_PURCHASE_ITEM_PRICING_EXTENSION',
      'CREATE_RECEIPT',
      'CREATE_RECEIPT_ITEM_INTENT',
      'MATERIALIZE_ORDINARY_RECEIPT_ITEM',
      'MATERIALIZE_SUBSTITUTION_RECEIPT_ITEM',
      'REGISTER_OVER_RECEIPT_EXCEPTION'
    ));

-- BE-06 treats committed discrepancy evidence as history. Resolution is an
-- explicit later fact, never an UPDATE/DELETE of the detected exception.
create trigger purchase_receiving_exception_immutable
before update or delete on fridge.purchase_receiving_exception
for each row execute function fridge_internal.reject_historical_mutation();

create table fridge.receipt_item_intent_over_receipt_exception (
  household_id uuid not null,
  receipt_item_intent_id uuid not null,
  purchase_item_id uuid not null,
  purchase_receiving_exception_id uuid not null,
  allocation_conversion_evidence_id uuid,
  detection_provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receipt_item_intent_over_receipt_exception_pk
    primary key (household_id, receipt_item_intent_id),
  constraint receipt_item_intent_over_receipt_exception_intent_fk
    foreign key (household_id, receipt_item_intent_id)
    references fridge.receipt_item_intent (household_id, receipt_item_intent_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_over_receipt_exception_purchase_item_fk
    foreign key (household_id, purchase_item_id)
    references fridge.purchase_item (household_id, purchase_item_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_over_receipt_exception_exception_fk
    foreign key (household_id, purchase_receiving_exception_id)
    references fridge.purchase_receiving_exception (household_id, purchase_receiving_exception_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_over_receipt_exception_conversion_fk
    foreign key (allocation_conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_over_receipt_exception_exception_uq
    unique (household_id, purchase_receiving_exception_id),
  constraint receipt_item_intent_over_receipt_exception_provenance_ck
    check (btrim(detection_provenance) <> '')
);

comment on table fridge.receipt_item_intent_over_receipt_exception is
  'Immutable BE-06 evidence binding an unmaterialized ReceiptItemIntent to an exact detected PurchaseItem over-receipt discrepancy. Detection reserves no receiving allowance and creates no physical inventory truth.';

alter table fridge.receipt_item_intent_over_receipt_exception enable row level security;
create policy household_isolation on fridge.receipt_item_intent_over_receipt_exception
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

create trigger receipt_item_intent_over_receipt_exception_immutable
before update or delete on fridge.receipt_item_intent_over_receipt_exception
for each row execute function fridge_internal.reject_historical_mutation();

create table fridge.household_over_receipt_exception_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  receipt_item_intent_id uuid not null,
  purchase_item_id uuid not null,
  allocation_conversion_evidence_id uuid,
  reason text not null,
  provenance text not null,
  candidate_purchase_receiving_exception_id uuid not null,
  result_purchase_receiving_exception_id uuid,
  result_discrepant_quantity_num numeric,
  result_discrepant_quantity_den numeric,
  result_discrepant_unit_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_over_receipt_exception_command_pk
    primary key (household_id, command_id),
  constraint household_over_receipt_exception_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_over_receipt_exception_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_over_receipt_exception_command_intent_fk
    foreign key (household_id, receipt_item_intent_id)
    references fridge.receipt_item_intent (household_id, receipt_item_intent_id)
    on update restrict on delete restrict,
  constraint household_over_receipt_exception_command_purchase_item_fk
    foreign key (household_id, purchase_item_id)
    references fridge.purchase_item (household_id, purchase_item_id)
    on update restrict on delete restrict,
  constraint household_over_receipt_exception_command_conversion_fk
    foreign key (allocation_conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint household_over_receipt_exception_command_result_exception_fk
    foreign key (household_id, result_purchase_receiving_exception_id)
    references fridge.purchase_receiving_exception (household_id, purchase_receiving_exception_id)
    on update restrict on delete restrict,
  constraint household_over_receipt_exception_command_result_unit_fk
    foreign key (result_discrepant_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint household_over_receipt_exception_command_reason_ck check (btrim(reason) <> ''),
  constraint household_over_receipt_exception_command_provenance_ck check (btrim(provenance) <> ''),
  constraint household_over_receipt_exception_command_outcome_ck
    check (outcome_code in ('PENDING', 'REGISTERED')),
  constraint household_over_receipt_exception_command_result_ck
    check (
      (outcome_code = 'PENDING'
        and result_purchase_receiving_exception_id is null
        and result_discrepant_quantity_num is null
        and result_discrepant_quantity_den is null
        and result_discrepant_unit_id is null)
      or
      (outcome_code = 'REGISTERED'
        and result_purchase_receiving_exception_id is not null
        and result_discrepant_quantity_num is not null
        and result_discrepant_quantity_den is not null
        and result_discrepant_unit_id is not null
        and result_discrepant_quantity_num > 0
        and fridge_internal.assert_normalized_rational(
          result_discrepant_quantity_num,
          result_discrepant_quantity_den
        ))
    )
);

comment on table fridge.household_over_receipt_exception_command is
  'Durable CommandId state for explicit over-receipt discrepancy detection. Candidate exception identity is result-only; replay returns the originally computed exact discrepancy.';

alter table fridge.household_over_receipt_exception_command enable row level security;
create policy household_isolation on fridge.household_over_receipt_exception_command
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

create trigger household_over_receipt_exception_command_immutable
before update or delete on fridge.household_over_receipt_exception_command
for each row when (old.outcome_code = 'REGISTERED')
execute function fridge_internal.reject_historical_mutation();

create or replace function fridge_internal.receiving_pool_overage(
  p_household_id uuid,
  p_purchase_item_id uuid,
  p_quantity_num numeric,
  p_quantity_den numeric,
  p_unit_id uuid,
  p_conversion_evidence_id uuid
)
returns table (
  overage_num numeric,
  overage_den numeric,
  comparison_unit_id uuid
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_purchase fridge.purchase_item%rowtype;
  v_row record;
  v_converted record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_total_num numeric;
  v_total_den numeric;
  v_norm_num numeric;
  v_norm_den numeric;
  v_diff_num numeric;
  v_diff_den numeric;
begin
  select * into v_purchase
    from fridge.purchase_item
   where household_id = p_household_id
     and purchase_item_id = p_purchase_item_id
   for update;

  if not found then
    return;
  end if;

  for v_row in
    select allocated_quantity_num as q_num,
           allocated_quantity_den as q_den,
           allocation_unit_id as unit_id,
           conversion_evidence_id
      from fridge.purchase_item_receipt_allocation
     where household_id = p_household_id
       and purchase_item_id = p_purchase_item_id
    union all
    select substituted_quantity_num,
           substituted_quantity_den,
           allocation_unit_id,
           conversion_evidence_id
      from fridge.purchase_item_substitution_allocation
     where household_id = p_household_id
       and purchase_item_id = p_purchase_item_id
  loop
    select * into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_row.q_num,
        v_row.q_den,
        v_row.unit_id,
        v_purchase.purchased_unit_id,
        v_row.conversion_evidence_id
      );

    select quantity_num, quantity_den into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_converted.quantity_den + v_converted.quantity_num * v_sum_den,
        v_sum_den * v_converted.quantity_den
      );
    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  select * into v_converted
    from fridge_internal.quantity_in_target_unit(
      p_household_id,
      p_quantity_num,
      p_quantity_den,
      p_unit_id,
      v_purchase.purchased_unit_id,
      p_conversion_evidence_id
    );

  select quantity_num, quantity_den into v_total_num, v_total_den
    from fridge_internal.normalize_rational(
      v_sum_num * v_converted.quantity_den + v_converted.quantity_num * v_sum_den,
      v_sum_den * v_converted.quantity_den
    );

  v_diff_num := v_total_num * v_purchase.purchased_quantity_den
              - v_purchase.purchased_quantity_num * v_total_den;
  v_diff_den := v_total_den * v_purchase.purchased_quantity_den;

  if v_diff_num <= 0 then
    return query select 0::numeric, 1::numeric, v_purchase.purchased_unit_id;
    return;
  end if;

  select quantity_num, quantity_den into v_norm_num, v_norm_den
    from fridge_internal.normalize_rational(v_diff_num, v_diff_den);

  return query select v_norm_num, v_norm_den, v_purchase.purchased_unit_id;
end;
$$;

comment on function fridge_internal.receiving_pool_overage(uuid,uuid,numeric,numeric,uuid,uuid) is
  'Locks one PurchaseItem receiving pool and returns the exact positive overage, if any, in the purchased comparison unit after existing ordinary + substitution allocation plus one proposed ReceiptItemIntent quantity.';

revoke all on function fridge_internal.receiving_pool_overage(uuid,uuid,numeric,numeric,uuid,uuid)
  from public, fridge_app, fridge_worker, fridge_readonly;

create or replace function fridge_internal.register_over_receipt_exception(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_receipt_item_intent_id uuid,
  p_purchase_item_id uuid,
  p_allocation_conversion_evidence_id uuid,
  p_reason text,
  p_provenance text,
  p_candidate_purchase_receiving_exception_id uuid
)
returns table (
  outcome_code text,
  result_purchase_receiving_exception_id uuid,
  result_discrepant_quantity_num numeric,
  result_discrepant_quantity_den numeric,
  result_discrepant_unit_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_reason text;
  v_provenance text;
  v_existing_actor_user_id uuid;
  v_existing_intent_id uuid;
  v_existing_purchase_item_id uuid;
  v_existing_conversion_id uuid;
  v_existing_reason text;
  v_existing_provenance text;
  v_existing_outcome text;
  v_existing_result_id uuid;
  v_existing_q_num numeric;
  v_existing_q_den numeric;
  v_existing_unit_id uuid;
  v_discovered_receipt_id uuid;
  v_receipt fridge.receipt%rowtype;
  v_intent fridge.receipt_item_intent%rowtype;
  v_purchase_item fridge.purchase_item%rowtype;
  v_physical_intent uuid;
  v_exception_intent uuid;
  v_overage record;
  v_recorded_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_procurement_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );
  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'REGISTER_OVER_RECEIPT_EXCEPTION'
  );

  if p_command_id is null
     or p_receipt_item_intent_id is null
     or p_purchase_item_id is null
     or p_candidate_purchase_receiving_exception_id is null
     or p_reason is null
     or btrim(p_reason) = ''
     or p_provenance is null
     or btrim(p_provenance) = '' then
    return query select 'INVALID_INPUT'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  v_reason := btrim(p_reason);
  v_provenance := btrim(p_provenance);

  -- Committed replay is resolved before current Receipt/Purchase/availability revalidation.
  select c.actor_user_id,
         c.receipt_item_intent_id,
         c.purchase_item_id,
         c.allocation_conversion_evidence_id,
         c.reason,
         c.provenance,
         c.outcome_code,
         c.result_purchase_receiving_exception_id,
         c.result_discrepant_quantity_num,
         c.result_discrepant_quantity_den,
         c.result_discrepant_unit_id
    into v_existing_actor_user_id,
         v_existing_intent_id,
         v_existing_purchase_item_id,
         v_existing_conversion_id,
         v_existing_reason,
         v_existing_provenance,
         v_existing_outcome,
         v_existing_result_id,
         v_existing_q_num,
         v_existing_q_den,
         v_existing_unit_id
    from fridge.household_over_receipt_exception_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_intent_id is distinct from p_receipt_item_intent_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_conversion_id is distinct from p_allocation_conversion_evidence_id
       or v_existing_reason is distinct from v_reason
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::numeric, null::numeric, null::uuid;
      return;
    end if;

    if v_existing_outcome = 'REGISTERED' then
      perform fridge_internal.register_household_procurement_command_intent(
        p_household_id, p_command_id, 'REGISTER_OVER_RECEIPT_EXCEPTION'
      );
      return query select 'REGISTERED'::text,
        v_existing_result_id,
        v_existing_q_num,
        v_existing_q_den,
        v_existing_unit_id;
      return;
    end if;
    raise exception 'unexpected pending over-receipt exception command';
  end if;

  -- Canonical lock direction follows materialization: Receipt -> Intent -> PurchaseItem.
  select i.receipt_id into v_discovered_receipt_id
    from fridge.receipt_item_intent i
   where i.household_id = p_household_id
     and i.receipt_item_intent_id = p_receipt_item_intent_id;
  if v_discovered_receipt_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  select * into v_receipt
    from fridge.receipt r
   where r.household_id = p_household_id
     and r.receipt_id = v_discovered_receipt_id
   for key share;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  select * into v_intent
    from fridge.receipt_item_intent i
   where i.household_id = p_household_id
     and i.receipt_item_intent_id = p_receipt_item_intent_id
     and i.receipt_id = v_receipt.receipt_id
   for update;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  select pm.receipt_item_intent_id into v_physical_intent
    from fridge.receipt_item_intent_physical_materialization pm
   where pm.household_id = p_household_id
     and pm.receipt_item_intent_id = p_receipt_item_intent_id;
  if v_physical_intent is not null then
    return query select 'CONFLICT'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  select oe.receipt_item_intent_id into v_exception_intent
    from fridge.receipt_item_intent_over_receipt_exception oe
   where oe.household_id = p_household_id
     and oe.receipt_item_intent_id = p_receipt_item_intent_id;
  if v_exception_intent is not null then
    return query select 'CONFLICT'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_receipt.purchase_id is null then
    return query select 'CONFLICT'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  select * into v_purchase_item
    from fridge.purchase_item pi
   where pi.household_id = p_household_id
     and pi.purchase_item_id = p_purchase_item_id
     and pi.purchase_id = v_receipt.purchase_id
   for update;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  begin
    select * into v_overage
      from fridge_internal.receiving_pool_overage(
        p_household_id,
        p_purchase_item_id,
        v_intent.intended_quantity_num,
        v_intent.intended_quantity_den,
        v_intent.intended_unit_id,
        p_allocation_conversion_evidence_id
      );
  exception
    when foreign_key_violation or check_violation or invalid_parameter_value or division_by_zero then
      return query select 'INVALID_INPUT'::text, null::uuid, null::numeric, null::numeric, null::uuid;
      return;
  end;

  if v_overage.overage_num is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;
  if v_overage.overage_num <= 0 then
    return query select 'NO_OVER_RECEIPT'::text, null::uuid, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  v_recorded_at := clock_timestamp();

  insert into fridge.household_over_receipt_exception_command (
    household_id, command_id, actor_user_id, receipt_item_intent_id, purchase_item_id,
    allocation_conversion_evidence_id, reason, provenance,
    candidate_purchase_receiving_exception_id,
    result_purchase_receiving_exception_id,
    result_discrepant_quantity_num, result_discrepant_quantity_den, result_discrepant_unit_id,
    outcome_code, recorded_at
  ) values (
    p_household_id, p_command_id, p_actor_user_id, p_receipt_item_intent_id, p_purchase_item_id,
    p_allocation_conversion_evidence_id, v_reason, v_provenance,
    p_candidate_purchase_receiving_exception_id,
    null, null, null, null,
    'PENDING', v_recorded_at
  );

  insert into fridge.purchase_receiving_exception (
    purchase_receiving_exception_id,
    household_id,
    purchase_item_id,
    receipt_item_id,
    ordinary_allocation_id,
    substitution_allocation_id,
    discrepant_quantity_num,
    discrepant_quantity_den,
    discrepant_unit_id,
    exception_kind,
    resolution_status,
    reason,
    approved_by_user_id,
    correction_provenance,
    recorded_at
  ) values (
    p_candidate_purchase_receiving_exception_id,
    p_household_id,
    p_purchase_item_id,
    null,
    null,
    null,
    v_overage.overage_num,
    v_overage.overage_den,
    v_overage.comparison_unit_id,
    'OVER_RECEIPT',
    'DETECTED',
    v_reason,
    null,
    null,
    v_recorded_at
  );

  insert into fridge.receipt_item_intent_over_receipt_exception (
    household_id,
    receipt_item_intent_id,
    purchase_item_id,
    purchase_receiving_exception_id,
    allocation_conversion_evidence_id,
    detection_provenance,
    recorded_at
  ) values (
    p_household_id,
    p_receipt_item_intent_id,
    p_purchase_item_id,
    p_candidate_purchase_receiving_exception_id,
    p_allocation_conversion_evidence_id,
    v_provenance,
    v_recorded_at
  );

  update fridge.household_over_receipt_exception_command
     set result_purchase_receiving_exception_id = p_candidate_purchase_receiving_exception_id,
         result_discrepant_quantity_num = v_overage.overage_num,
         result_discrepant_quantity_den = v_overage.overage_den,
         result_discrepant_unit_id = v_overage.comparison_unit_id,
         outcome_code = 'REGISTERED'
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id, p_command_id, 'REGISTER_OVER_RECEIPT_EXCEPTION'
  );

  return query select 'REGISTERED'::text,
    p_candidate_purchase_receiving_exception_id,
    v_overage.overage_num,
    v_overage.overage_den,
    v_overage.comparison_unit_id;
end;
$$;

comment on function fridge_internal.register_over_receipt_exception(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid) is
  'BE-06 governed pre-materialization over-receipt discrepancy detection. Computes exact excess from the serialized PurchaseItem receiving pool and persists append-only exception evidence only; it creates no ReceiptItem, allocation, StockItem or InventoryMovement.';

revoke all on table fridge.purchase_receiving_exception
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on table fridge.receipt_item_intent_over_receipt_exception
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on table fridge.household_over_receipt_exception_command
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.register_over_receipt_exception(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid)
  from public, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.register_over_receipt_exception(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid)
  to fridge_app;

commit;
