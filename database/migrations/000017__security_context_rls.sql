-- FridgeScanner DB-02
-- 000017__security_context_rls.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Installs the trusted per-transaction Household context reader and fail-closed
-- RLS for directly Household-scoped canonical relations. Authentication and
-- current authorization remain service-boundary responsibilities; the GUC is
-- defense in depth and is never treated as cryptographic authority.

begin;

create or replace function fridge_internal.current_household_id()
returns uuid
language plpgsql
stable
parallel safe
security invoker
set search_path = pg_catalog
as $$
declare
  v_raw text;
begin
  v_raw := current_setting('fridge.household_id', true);

  if v_raw is null or btrim(v_raw) = '' then
    return null;
  end if;

  begin
    return v_raw::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;
end;
$$;

comment on function fridge_internal.current_household_id() is
  'Returns the trusted server-set transaction Household UUID, or NULL on missing/invalid context. NULL intentionally makes Household RLS fail closed.';

revoke all on function fridge_internal.current_household_id() from public;

-- Direct Household-scoped tables. Every listed relation owns a household_id
-- column and therefore receives the same deny-by-default tenant predicate.
-- Structural composite FKs remain the primary integrity boundary; RLS is
-- defense in depth against accidental cross-tenant access by ordinary roles.
do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'household_timezone_version',
    'household_membership',
    'storage_location',
    'compartment',
    'product_identifier_staged_claim',
    'purchase',
    'purchase_item',
    'purchase_money_fact',
    'purchase_item_money_fact',
    'purchase_item_pricing_discrepancy',
    'receipt',
    'receipt_item',
    'purchase_item_receipt_allocation',
    'purchase_item_substitution_allocation',
    'purchase_receiving_exception',
    'batch',
    'stock_item',
    'inventory_movement',
    'inventory_transfer',
    'inventory_transfer_effect',
    'inventory_quantity_lineage',
    'receipt_item_inventory_effect',
    'waste_record',
    'waste_record_movement',
    'inventory_count',
    'inventory_ledger_basis',
    'inventory_count_item',
    'inventory_count_allocation',
    'inventory_reconciliation_outcome',
    'preparation',
    'preparation_recipe_requirement',
    'preparation_input',
    'preparation_input_movement',
    'preparation_input_allocation',
    'preparation_input_deviation',
    'recipe_fulfillment_deviation',
    'preparation_output',
    'preparation_output_movement',
    'source_expiration_fact',
    'food_lifecycle_event',
    'shelf_life_rule_activation',
    'effective_expiration',
    'effective_expiration_candidate',
    'inventory_shelf_life_lineage',
    'household_product_policy',
    'household_product_storage_preference',
    'shopping_list',
    'shopping_list_item',
    'shopping_list_fulfillment',
    'alert_rule',
    'alert_rule_subject',
    'alert',
    'alert_trigger_subject',
    'notification_delivery',
    'import_run',
    'audit_event',
    'outbox_record'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('alter table fridge.%I enable row level security', v_table);
    execute format('alter table fridge.%I force row level security', v_table);
    execute format(
      'create policy household_isolation on fridge.%I using (household_id = fridge_internal.current_household_id()) with check (household_id = fridge_internal.current_household_id())',
      v_table
    );
  end loop;
end;
$$;

-- Nullable-Household scope relations need explicit global-vs-Household handling.
-- Ordinary tenant roles may see/write only rows scoped to their active Household;
-- GLOBAL rows are not implicitly exposed through these policies.
alter table fridge.integration enable row level security;
alter table fridge.integration force row level security;
create policy integration_household_isolation
  on fridge.integration
  using (
    binding_scope = 'HOUSEHOLD'
    and household_id = fridge_internal.current_household_id()
  )
  with check (
    binding_scope = 'HOUSEHOLD'
    and household_id = fridge_internal.current_household_id()
  );

alter table fridge.external_reference enable row level security;
alter table fridge.external_reference force row level security;
create policy external_reference_household_isolation
  on fridge.external_reference
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

alter table fridge.idempotency_record enable row level security;
alter table fridge.idempotency_record force row level security;
create policy idempotency_household_isolation
  on fridge.idempotency_record
  using (
    target_scope = 'HOUSEHOLD'
    and household_id = fridge_internal.current_household_id()
  )
  with check (
    target_scope = 'HOUSEHOLD'
    and household_id = fridge_internal.current_household_id()
  );

-- Household itself is filtered by identity rather than a household_id child column.
alter table fridge.household enable row level security;
alter table fridge.household force row level security;
create policy household_identity_isolation
  on fridge.household
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

commit;
