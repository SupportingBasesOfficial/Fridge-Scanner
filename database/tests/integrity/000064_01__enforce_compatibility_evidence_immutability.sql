-- FridgeScanner BE-05 integrity checks for 000064_01__enforce_compatibility_evidence_immutability.sql

begin;

do $$
declare
  v_trigger_function text;
  v_trigger_type integer;
begin
  select p.proname, t.tgtype::integer
    into v_trigger_function, v_trigger_type
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
   where t.tgrelid='fridge.compatibility_decision_evidence'::regclass
     and t.tgname='compatibility_evidence_immutable_guard'
     and not t.tgisinternal;

  if v_trigger_function is distinct from 'reject_compatibility_evidence_mutation' then
    raise exception 'compatibility evidence immutable trigger is missing or misbound';
  end if;

  -- pg_trigger.tgtype is a structural event bitmask. Require row-level BEFORE
  -- semantics plus both DELETE and UPDATE events without depending on textual
  -- formatting/order from pg_get_triggerdef().
  if v_trigger_type is null
     or (v_trigger_type & 1) = 0
     or (v_trigger_type & 2) = 0
     or (v_trigger_type & 8) = 0
     or (v_trigger_type & 16) = 0 then
    raise exception 'compatibility evidence immutable trigger must be row-level BEFORE UPDATE and DELETE';
  end if;

  if has_function_privilege(
    'fridge_app',
    'fridge_internal.reject_compatibility_evidence_mutation()',
    'EXECUTE'
  ) then
    raise exception 'fridge_app must not directly execute evidence mutation blocker';
  end if;
end;
$$;

rollback;
