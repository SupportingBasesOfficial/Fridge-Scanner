-- FridgeScanner DB-02 integrity test
-- BE-06 substitution receipt materialization.

begin;

-- Shared procurement CommandId registry must preserve prior meanings and add only
-- the explicit substitution materialization intent.
do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition
    from pg_constraint
   where conname = 'household_procurement_command_registry_intent_ck';

  if v_definition not like '%MATERIALIZE_ORDINARY_RECEIPT_ITEM%'
     or v_definition not like '%MATERIALIZE_SUBSTITUTION_RECEIPT_ITEM%'
     or v_definition not like '%CREATE_RECEIPT_ITEM_INTENT%' then
    raise exception 'BE-06 command registry lost accepted intents or substitution intent';
  end if;
end;
$$;

-- Exactly one cross-kind physical claim trigger must guard each bridge.
do $$
begin
  if (
    select count(*)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'fridge'
       and c.relname in (
         'receipt_item_intent_materialization',
         'receipt_item_intent_substitution_materialization'
       )
       and t.tgname in (
         'receipt_item_intent_materialization_claim_physical',
         'receipt_item_intent_substitution_materialization_claim_physical'
       )
       and not t.tgisinternal
  ) <> 2 then
    raise exception 'cross-kind ReceiptItemIntent physical claim triggers are incomplete';
  end if;
end;
$$;

-- Claim helper is database-internal, definer-scoped and not callable by runtime.
do $$
begin
  if not (
    select p.prosecdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'fridge_internal'
       and p.proname = 'claim_receipt_item_intent_physical_materialization'
       and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    raise exception 'physical materialization claim helper must be SECURITY DEFINER';
  end if;

  if has_function_privilege('fridge_app', 'fridge_internal.claim_receipt_item_intent_physical_materialization()', 'EXECUTE') then
    raise exception 'fridge_app must not call physical materialization claim helper directly';
  end if;
end;
$$;

-- Only the narrow substitution boundary is executable by the app role.
do $$
declare
  v_signature text := 'fridge_internal.materialize_substitution_receipt_item(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid)';
begin
  if not has_function_privilege('fridge_app', v_signature, 'EXECUTE') then
    raise exception 'fridge_app lacks substitution receiving EXECUTE';
  end if;
  if has_function_privilege('fridge_worker', v_signature, 'EXECUTE')
     or has_function_privilege('fridge_readonly', v_signature, 'EXECUTE') then
    raise exception 'non-app runtime role can execute substitution receiving';
  end if;
end;
$$;

-- Runtime receives no direct mutation privilege on new internal truth.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'receipt_item_intent_physical_materialization',
    'receipt_item_intent_substitution_materialization',
    'household_substitution_receipt_materialization_command'
  ] loop
    if has_table_privilege('fridge_app', 'fridge.' || v_table, 'INSERT')
       or has_table_privilege('fridge_app', 'fridge.' || v_table, 'UPDATE')
       or has_table_privilege('fridge_app', 'fridge.' || v_table, 'DELETE') then
      raise exception 'fridge_app gained direct DML on %', v_table;
    end if;
  end loop;
end;
$$;

-- Function shape must preserve substitution semantics and atomic physical ingress;
-- over-receipt exception creation is explicitly not part of this slice.
do $$
declare
  v_body text;
begin
  select pg_get_functiondef(p.oid) into v_body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'fridge_internal'
     and p.proname = 'materialize_substitution_receipt_item'
     and pg_get_function_identity_arguments(p.oid) =
       'p_household_id uuid, p_actor_user_id uuid, p_actor_membership_id uuid, p_command_id uuid, p_receipt_item_intent_id uuid, p_purchase_item_id uuid, p_allocation_conversion_evidence_id uuid, p_reason text, p_placement_kind text, p_storage_location_id uuid, p_compartment_id uuid, p_provenance text, p_candidate_receipt_item_id uuid, p_candidate_substitution_allocation_id uuid, p_candidate_stock_item_id uuid, p_candidate_inventory_movement_id uuid, p_candidate_receipt_inventory_effect_id uuid';

  if v_body is null then
    raise exception 'substitution receiving function not found';
  end if;
  if v_body not like '%acquire_household_procurement_admin_authority%'
     or v_body not like '%receiving_pool_can_allocate%'
     or v_body not like '%insert into fridge.receipt_item%'
     or v_body not like '%insert into fridge.purchase_item_substitution_allocation%'
     or v_body not like '%insert into fridge.stock_item%'
     or v_body not like '%insert into fridge.inventory_movement%'
     or v_body not like '%insert into fridge.receipt_item_inventory_effect%'
     or v_body not like '%assert_purchase_receiving_pool%'
     or v_body not like '%assert_receipt_item_allocation_pool%'
     or v_body not like '%assert_receipt_item_inventory_effects%' then
    raise exception 'substitution receiving function lacks required authority/allocation/physical conservation steps';
  end if;
  if v_body like '%insert into fridge.purchase_item_receipt_allocation%'
     or v_body like '%insert into fridge.purchase_receiving_exception%' then
    raise exception 'substitution boundary crossed into ordinary allocation or over-receipt exception workflow';
  end if;
end;
$$;

-- New history is append-only after commitment.
do $$
begin
  if not exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'fridge'
       and c.relname = 'receipt_item_intent_substitution_materialization'
       and t.tgname = 'receipt_item_intent_substitution_materialization_immutable'
       and not t.tgisinternal
  ) then
    raise exception 'substitution materialization bridge lacks immutable-history trigger';
  end if;
end;
$$;

rollback;
