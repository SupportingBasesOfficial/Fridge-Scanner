-- FridgeScanner BE-06
-- 000080_01__detected_over_receipt_claim_contract_compatibility.sql
-- Preserve the accepted ordinary claim barrier structure while adding the
-- distinct substitution acceptance authority.

begin;

create or replace function fridge_internal.claim_receipt_item_intent_physical_materialization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_kind text;
  v_detected_exception_id uuid;
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
    -- Preserve the accepted ordinary barrier shape. Any non-ordinary claim must
    -- prove that it is specifically the substitution path and has its own
    -- matching same-transaction PENDING authority.
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
  'Shared ordinary/substitution physical claim. DETECTED over-receipt remains blocked. The accepted ordinary v_kind <> ORDINARY barrier is preserved, while the only permitted non-ordinary branch is SUBSTITUTION with its own exact same-transaction PENDING acceptance authority.';

revoke all on function fridge_internal.claim_receipt_item_intent_physical_materialization()
  from public, fridge_app, fridge_worker, fridge_readonly;

commit;
