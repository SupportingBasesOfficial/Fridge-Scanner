-- FridgeScanner BE-06
-- 000076__detected_over_receipt_materialization_guard.sql
-- A detected over-receipt exception is a workflow barrier, not materialization authority.

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
    raise exception using
      errcode = 'P6R02',
      message = 'ReceiptItemIntent has an unresolved over-receipt exception';
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
  'Shared ordinary/substitution physical claim. Refuses already-materialized intents and intents held behind a detected over-receipt exception until a future governed resolution explicitly changes that eligibility.';

revoke all on function fridge_internal.claim_receipt_item_intent_physical_materialization()
  from public, fridge_app, fridge_worker, fridge_readonly;

commit;
