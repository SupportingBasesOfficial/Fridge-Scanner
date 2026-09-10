-- FridgeScanner BE-06
-- 000081__resolve_over_receipt_without_ingress.sql
-- Resolve one DETECTED over-receipt without creating physical inventory truth.

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
      'REGISTER_OVER_RECEIPT_EXCEPTION',
      'ACCEPT_ORDINARY_OVER_RECEIPT',
      'ACCEPT_SUBSTITUTION_OVER_RECEIPT',
      'RESOLVE_OVER_RECEIPT_WITHOUT_INGRESS'
    ));

alter table fridge.purchase_receiving_exception_resolution
  alter column receipt_item_id drop not null,
  alter column accepted_excess_quantity_num drop not null,
  alter column accepted_excess_quantity_den drop not null,
  alter column accepted_excess_unit_id drop not null,
  add column resolution_reason text;

alter table fridge.purchase_receiving_exception_resolution
  drop constraint receiving_exception_resolution_kind_ck,
  drop constraint receiving_exception_resolution_allocation_kind_ck,
  drop constraint receiving_exception_resolution_quantity_positive_normalized,
  add constraint receiving_exception_resolution_kind_ck
    check (resolution_kind in (
      'ACCEPTED_ORDINARY_EXCESS',
      'ACCEPTED_SUBSTITUTION_EXCESS',
      'REJECTED_NO_INGRESS',
      'SUPERSEDED_DETECTION'
    )),
  add constraint receiving_exception_resolution_shape_ck
    check (
      (resolution_kind = 'ACCEPTED_ORDINARY_EXCESS'
        and receipt_item_id is not null
        and ordinary_allocation_id is not null
        and substitution_allocation_id is null
        and accepted_excess_quantity_num is not null
        and accepted_excess_quantity_den is not null
        and accepted_excess_unit_id is not null
        and accepted_excess_quantity_num > 0
        and fridge_internal.assert_normalized_rational(
          accepted_excess_quantity_num,
          accepted_excess_quantity_den
        )
        and resolution_reason is null)
      or
      (resolution_kind = 'ACCEPTED_SUBSTITUTION_EXCESS'
        and receipt_item_id is not null
        and ordinary_allocation_id is null
        and substitution_allocation_id is not null
        and accepted_excess_quantity_num is not null
        and accepted_excess_quantity_den is not null
        and accepted_excess_unit_id is not null
        and accepted_excess_quantity_num > 0
        and fridge_internal.assert_normalized_rational(
          accepted_excess_quantity_num,
          accepted_excess_quantity_den
        )
        and resolution_reason is null)
      or
      (resolution_kind in ('REJECTED_NO_INGRESS', 'SUPERSEDED_DETECTION')
        and receipt_item_id is null
        and ordinary_allocation_id is null
        and substitution_allocation_id is null
        and accepted_excess_quantity_num is null
        and accepted_excess_quantity_den is null
        and accepted_excess_unit_id is null
        and resolution_reason is not null
        and btrim(resolution_reason) <> '')
    );

comment on table fridge.purchase_receiving_exception_resolution is
  'Single append-only BE-06 over-receipt resolution truth. Accepted kinds bind exact physical allocations and exact excess; REJECTED_NO_INGRESS and SUPERSEDED_DETECTION carry no physical identities or quantities. DETECTED history and PurchaseItem purchased truth remain immutable.';

comment on column fridge.purchase_receiving_exception_resolution.resolution_reason is
  'Required canonical reason for nonphysical over-receipt resolution; null for accepted physical excess resolutions.';

create table fridge.household_resolve_over_receipt_without_ingress_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  purchase_receiving_exception_id uuid not null,
  resolution_kind text not null,
  reason text not null,
  provenance text not null,
  candidate_purchase_receiving_exception_resolution_id uuid not null,
  result_purchase_receiving_exception_resolution_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_resolve_over_receipt_without_ingress_command_pk
    primary key (household_id, command_id),
  constraint household_resolve_over_receipt_without_ingress_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_resolve_over_receipt_without_ingress_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_resolve_over_receipt_without_ingress_command_exception_fk
    foreign key (household_id, purchase_receiving_exception_id)
    references fridge.purchase_receiving_exception (household_id, purchase_receiving_exception_id)
    on update restrict on delete restrict,
  constraint household_resolve_over_receipt_without_ingress_command_result_fk
    foreign key (household_id, result_purchase_receiving_exception_resolution_id)
    references fridge.purchase_receiving_exception_resolution (
      household_id, purchase_receiving_exception_resolution_id
    )
    on update restrict on delete restrict,
  constraint household_resolve_over_receipt_without_ingress_command_kind_ck
    check (resolution_kind in ('REJECTED_NO_INGRESS', 'SUPERSEDED_DETECTION')),
  constraint household_resolve_over_receipt_without_ingress_command_reason_ck
    check (btrim(reason) <> ''),
  constraint household_resolve_over_receipt_without_ingress_command_provenance_ck
    check (btrim(provenance) <> ''),
  constraint household_resolve_over_receipt_without_ingress_command_outcome_ck
    check (outcome_code in ('PENDING', 'RESOLVED')),
  constraint household_resolve_over_receipt_without_ingress_command_result_ck
    check (
      (outcome_code = 'PENDING' and result_purchase_receiving_exception_resolution_id is null)
      or
      (outcome_code = 'RESOLVED' and result_purchase_receiving_exception_resolution_id is not null)
    )
);

alter table fridge.household_resolve_over_receipt_without_ingress_command enable row level security;
create policy household_isolation on fridge.household_resolve_over_receipt_without_ingress_command
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

create trigger household_resolve_over_receipt_without_ingress_command_immutable
before update or delete on fridge.household_resolve_over_receipt_without_ingress_command
for each row when (old.outcome_code = 'RESOLVED')
execute function fridge_internal.reject_historical_mutation();

create or replace function fridge_internal.resolve_over_receipt_without_ingress(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_purchase_receiving_exception_id uuid,
  p_resolution_kind text,
  p_reason text,
  p_provenance text,
  p_candidate_resolution_id uuid
)
returns table (
  outcome_code text,
  result_purchase_receiving_exception_resolution_id uuid,
  result_resolution_kind text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_kind text;
  v_reason text;
  v_provenance text;
  v_existing_actor_user_id uuid;
  v_existing_exception_id uuid;
  v_existing_kind text;
  v_existing_reason text;
  v_existing_provenance text;
  v_existing_outcome text;
  v_existing_resolution_id uuid;
  v_intent_id uuid;
  v_purchase_item_id uuid;
  v_conversion_evidence_id uuid;
  v_intent fridge.receipt_item_intent%rowtype;
  v_exception fridge.purchase_receiving_exception%rowtype;
  v_purchase_item fridge.purchase_item%rowtype;
  v_materialized_intent uuid;
  v_prior_resolution_id uuid;
  v_required_excess record;
  v_recorded_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::text;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_procurement_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );
  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::text;
    return;
  end if;

  perform fridge_internal.assert_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'RESOLVE_OVER_RECEIPT_WITHOUT_INGRESS'
  );

  if p_command_id is null
     or p_purchase_receiving_exception_id is null
     or p_candidate_resolution_id is null
     or p_resolution_kind is null
     or p_resolution_kind not in ('REJECTED_NO_INGRESS', 'SUPERSEDED_DETECTION')
     or p_reason is null or btrim(p_reason) = ''
     or p_provenance is null or btrim(p_provenance) = '' then
    return query select 'INVALID_INPUT'::text, null::uuid, null::text;
    return;
  end if;

  v_kind := p_resolution_kind;
  v_reason := btrim(p_reason);
  v_provenance := btrim(p_provenance);

  select c.actor_user_id,
         c.purchase_receiving_exception_id,
         c.resolution_kind,
         c.reason,
         c.provenance,
         c.outcome_code,
         c.result_purchase_receiving_exception_resolution_id
    into v_existing_actor_user_id,
         v_existing_exception_id,
         v_existing_kind,
         v_existing_reason,
         v_existing_provenance,
         v_existing_outcome,
         v_existing_resolution_id
    from fridge.household_resolve_over_receipt_without_ingress_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_exception_id is distinct from p_purchase_receiving_exception_id
       or v_existing_kind is distinct from v_kind
       or v_existing_reason is distinct from v_reason
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::text;
      return;
    end if;
    if v_existing_outcome = 'RESOLVED' then
      perform fridge_internal.register_household_procurement_command_intent(
        p_household_id, p_command_id, 'RESOLVE_OVER_RECEIPT_WITHOUT_INGRESS'
      );
      return query select 'RESOLVED'::text, v_existing_resolution_id, v_existing_kind;
      return;
    end if;
    raise exception 'unexpected pending nonphysical over-receipt resolution command';
  end if;

  select oe.receipt_item_intent_id,
         oe.purchase_item_id,
         oe.allocation_conversion_evidence_id
    into v_intent_id, v_purchase_item_id, v_conversion_evidence_id
    from fridge.receipt_item_intent_over_receipt_exception oe
   where oe.household_id = p_household_id
     and oe.purchase_receiving_exception_id = p_purchase_receiving_exception_id;
  if v_intent_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::text;
    return;
  end if;

  select * into v_intent
    from fridge.receipt_item_intent i
   where i.household_id = p_household_id
     and i.receipt_item_intent_id = v_intent_id
   for update;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::text;
    return;
  end if;

  -- Re-check replay after serializing the exact intent.
  select c.actor_user_id,
         c.purchase_receiving_exception_id,
         c.resolution_kind,
         c.reason,
         c.provenance,
         c.outcome_code,
         c.result_purchase_receiving_exception_resolution_id
    into v_existing_actor_user_id,
         v_existing_exception_id,
         v_existing_kind,
         v_existing_reason,
         v_existing_provenance,
         v_existing_outcome,
         v_existing_resolution_id
    from fridge.household_resolve_over_receipt_without_ingress_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found and v_existing_outcome = 'RESOLVED' then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_exception_id is distinct from p_purchase_receiving_exception_id
       or v_existing_kind is distinct from v_kind
       or v_existing_reason is distinct from v_reason
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::text;
      return;
    end if;
    return query select 'RESOLVED'::text, v_existing_resolution_id, v_existing_kind;
    return;
  end if;

  select * into v_exception
    from fridge.purchase_receiving_exception e
   where e.household_id = p_household_id
     and e.purchase_receiving_exception_id = p_purchase_receiving_exception_id
     and e.exception_kind = 'OVER_RECEIPT'
     and e.resolution_status = 'DETECTED'
   for key share;
  if not found then
    return query select 'CONFLICT'::text, null::uuid, null::text;
    return;
  end if;

  select pm.receipt_item_intent_id into v_materialized_intent
    from fridge.receipt_item_intent_physical_materialization pm
   where pm.household_id = p_household_id
     and pm.receipt_item_intent_id = v_intent_id;
  if v_materialized_intent is not null then
    return query select 'CONFLICT'::text, null::uuid, null::text;
    return;
  end if;

  select r.purchase_receiving_exception_resolution_id into v_prior_resolution_id
    from fridge.purchase_receiving_exception_resolution r
   where r.household_id = p_household_id
     and r.purchase_receiving_exception_id = p_purchase_receiving_exception_id;
  if v_prior_resolution_id is not null then
    return query select 'CONFLICT'::text, null::uuid, null::text;
    return;
  end if;

  select * into v_purchase_item
    from fridge.purchase_item pi
   where pi.household_id = p_household_id
     and pi.purchase_item_id = v_purchase_item_id
   for update;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::text;
    return;
  end if;

  if v_kind = 'SUPERSEDED_DETECTION' then
    begin
      select * into v_required_excess
        from fridge_internal.receiving_required_accepted_excess(
          p_household_id,
          v_purchase_item_id,
          v_intent.intended_quantity_num,
          v_intent.intended_quantity_den,
          v_intent.intended_unit_id,
          v_conversion_evidence_id
        );
    exception
      when foreign_key_violation or check_violation or invalid_parameter_value or division_by_zero then
        return query select 'INVALID_INPUT'::text, null::uuid, null::text;
        return;
    end;

    if v_required_excess.accepted_excess_num is null then
      return query select 'NOT_FOUND'::text, null::uuid, null::text;
      return;
    end if;
    if v_required_excess.accepted_excess_num > 0 then
      return query select 'STILL_OVER_RECEIPT'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  v_recorded_at := clock_timestamp();

  insert into fridge.household_resolve_over_receipt_without_ingress_command (
    household_id, command_id, actor_user_id,
    purchase_receiving_exception_id, resolution_kind, reason, provenance,
    candidate_purchase_receiving_exception_resolution_id,
    outcome_code, recorded_at
  ) values (
    p_household_id, p_command_id, p_actor_user_id,
    p_purchase_receiving_exception_id, v_kind, v_reason, v_provenance,
    p_candidate_resolution_id,
    'PENDING', v_recorded_at
  );

  insert into fridge.purchase_receiving_exception_resolution (
    purchase_receiving_exception_resolution_id,
    household_id,
    purchase_receiving_exception_id,
    receipt_item_intent_id,
    purchase_item_id,
    receipt_item_id,
    ordinary_allocation_id,
    substitution_allocation_id,
    accepted_excess_quantity_num,
    accepted_excess_quantity_den,
    accepted_excess_unit_id,
    resolution_kind,
    approved_by_user_id,
    provenance,
    recorded_at,
    resolution_reason
  ) values (
    p_candidate_resolution_id,
    p_household_id,
    p_purchase_receiving_exception_id,
    v_intent_id,
    v_purchase_item_id,
    null,
    null,
    null,
    null,
    null,
    null,
    v_kind,
    p_actor_user_id,
    v_provenance,
    v_recorded_at,
    v_reason
  );

  update fridge.household_resolve_over_receipt_without_ingress_command
     set result_purchase_receiving_exception_resolution_id = p_candidate_resolution_id,
         outcome_code = 'RESOLVED'
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id, p_command_id, 'RESOLVE_OVER_RECEIPT_WITHOUT_INGRESS'
  );

  return query select 'RESOLVED'::text, p_candidate_resolution_id, v_kind;
end;
$$;

comment on function fridge_internal.resolve_over_receipt_without_ingress(
  uuid,uuid,uuid,uuid,uuid,text,text,text,uuid
) is
  'Governed BE-06 nonphysical resolution. REJECTED_NO_INGRESS terminally refuses the detected intent without inventory effects. SUPERSEDED_DETECTION is allowed only when current accepted-excess-aware receiving truth requires zero incremental excess. DETECTED history and PurchaseItem truth are never rewritten.';

-- A superseded detection is no longer a physical claim barrier. A rejected
-- detection remains terminally blocked. Unresolved detections still require
-- the exact same-transaction ordinary/substitution acceptance authority.
create or replace function fridge_internal.claim_receipt_item_intent_physical_materialization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_kind text;
  v_detected_exception_id uuid;
  v_resolution_kind text;
  v_acceptance_command_id uuid;
begin
  v_kind := case tg_table_name
    when 'receipt_item_intent_materialization' then 'ORDINARY'
    when 'receipt_item_intent_substitution_materialization' then 'SUBSTITUTION'
    else null
  end;

  if v_kind is null then
    raise exception 'unsupported ReceiptItemIntent materialization bridge';
  end if;

  select oe.purchase_receiving_exception_id
    into v_detected_exception_id
    from fridge.receipt_item_intent_over_receipt_exception oe
   where oe.household_id = new.household_id
     and oe.receipt_item_intent_id = new.receipt_item_intent_id;

  if v_detected_exception_id is not null then
    select r.resolution_kind into v_resolution_kind
      from fridge.purchase_receiving_exception_resolution r
     where r.household_id = new.household_id
       and r.purchase_receiving_exception_id = v_detected_exception_id;

    if v_resolution_kind = 'SUPERSEDED_DETECTION' then
      null;
    elsif v_resolution_kind is not null then
      raise exception using
        errcode = 'P6R02',
        message = 'ReceiptItemIntent has a terminal over-receipt resolution';
    else
      if v_kind <> 'ORDINARY' then
        if v_kind = 'SUBSTITUTION' then
          select c.command_id into v_acceptance_command_id
            from fridge.household_accept_substitution_over_receipt_command c
           where c.household_id = new.household_id
             and c.purchase_receiving_exception_id = v_detected_exception_id
             and c.receipt_item_intent_id = new.receipt_item_intent_id
             and c.candidate_receipt_item_id = new.receipt_item_id
             and c.outcome_code = 'PENDING';
        else
          raise exception using
            errcode = 'P6R02',
            message = 'ReceiptItemIntent has an unresolved over-receipt exception';
        end if;
      else
        select c.command_id into v_acceptance_command_id
          from fridge.household_accept_ordinary_over_receipt_command c
         where c.household_id = new.household_id
           and c.purchase_receiving_exception_id = v_detected_exception_id
           and c.receipt_item_intent_id = new.receipt_item_intent_id
           and c.candidate_receipt_item_id = new.receipt_item_id
           and c.outcome_code = 'PENDING';
      end if;

      if v_acceptance_command_id is null then
        raise exception using
          errcode = 'P6R02',
          message = 'ReceiptItemIntent has an unresolved over-receipt exception';
      end if;
    end if;
  end if;

  begin
    insert into fridge.receipt_item_intent_physical_materialization (
      household_id, receipt_item_intent_id, materialization_kind, receipt_item_id, recorded_at
    ) values (
      new.household_id, new.receipt_item_intent_id, v_kind, new.receipt_item_id, new.recorded_at
    );
  exception
    when unique_violation then
      raise exception using
        errcode = 'P6R01',
        message = 'ReceiptItemIntent is already physically materialized';
  end;

  return new;
end;
$$;

comment on function fridge_internal.claim_receipt_item_intent_physical_materialization() is
  'Shared ordinary/substitution physical claim. SUPERSEDED_DETECTION removes the historical detection barrier while normal materializer conservation still applies. REJECTED_NO_INGRESS remains terminally blocked. Unresolved DETECTED intents require exact PENDING acceptance authority.';

revoke all on table fridge.household_resolve_over_receipt_without_ingress_command
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.resolve_over_receipt_without_ingress(
  uuid,uuid,uuid,uuid,uuid,text,text,text,uuid
) from public, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.resolve_over_receipt_without_ingress(
  uuid,uuid,uuid,uuid,uuid,text,text,text,uuid
) to fridge_app;
revoke all on function fridge_internal.claim_receipt_item_intent_physical_materialization()
  from public, fridge_app, fridge_worker, fridge_readonly;

commit;
