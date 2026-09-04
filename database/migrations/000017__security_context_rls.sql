-- FridgeScanner DB-02
-- 000017__security_context_rls.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Installs the trusted per-transaction Household context reader and fail-closed
-- RLS for directly Household-scoped and mixed GLOBAL/HOUSEHOLD canonical data.
-- Authentication/current authorization remain service-boundary responsibilities;
-- the GUC is defense in depth and is never treated as cryptographic authority.

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
do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'household_timezone_version',
    'household_membership',
    'storage_location',
    'compartment',
    'staged_identifier_claim',
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
    'quantity_lineage_shelf_life_fact',
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

-- Household itself is filtered by identity rather than a household_id child column.
alter table fridge.household enable row level security;
alter table fridge.household force row level security;
create policy household_identity_isolation
  on fridge.household
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

-- Mixed GLOBAL/HOUSEHOLD catalog roots: GLOBAL is readable by tenant contexts;
-- only the current Household's private rows are readable/writable through RLS.
do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'ingredient_concept',
    'product',
    'product_ingredient_compatibility',
    'recipe',
    'recipe_version',
    'shelf_life_rule'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('alter table fridge.%I enable row level security', v_table);
    execute format('alter table fridge.%I force row level security', v_table);
    execute format(
      'create policy catalog_visible on fridge.%I for select using (catalog_scope = ''GLOBAL'' or (catalog_scope = ''HOUSEHOLD'' and owner_household_id = fridge_internal.current_household_id()))',
      v_table
    );
    execute format(
      'create policy catalog_household_write on fridge.%I for all using (catalog_scope = ''HOUSEHOLD'' and owner_household_id = fridge_internal.current_household_id()) with check (catalog_scope = ''HOUSEHOLD'' and owner_household_id = fridge_internal.current_household_id())',
      v_table
    );
  end loop;
end;
$$;

-- Batch has no direct Household column. Its confidentiality follows Product:
-- global Product batches are readable, private Product batches only by owner Household.
alter table fridge.batch enable row level security;
alter table fridge.batch force row level security;
create policy batch_visible
  on fridge.batch
  for select
  using (
    exists (
      select 1
      from fridge.product p
      where p.product_id = batch.product_id
        and (
          p.catalog_scope = 'GLOBAL'
          or p.owner_household_id = fridge_internal.current_household_id()
        )
    )
  );
create policy batch_household_write
  on fridge.batch
  for all
  using (
    exists (
      select 1
      from fridge.product p
      where p.product_id = batch.product_id
        and p.catalog_scope = 'HOUSEHOLD'
        and p.owner_household_id = fridge_internal.current_household_id()
    )
  )
  with check (
    exists (
      select 1
      from fridge.product p
      where p.product_id = batch.product_id
        and p.catalog_scope = 'HOUSEHOLD'
        and p.owner_household_id = fridge_internal.current_household_id()
    )
  );

-- Child catalog rows inherit visibility from their governed parent/version.
alter table fridge.product_identifier enable row level security;
alter table fridge.product_identifier force row level security;
create policy product_identifier_visible
  on fridge.product_identifier
  for select
  using (
    exists (
      select 1
      from fridge.product p
      where p.product_id = product_identifier.product_id
        and (
          p.catalog_scope = 'GLOBAL'
          or p.owner_household_id = fridge_internal.current_household_id()
        )
    )
  );
create policy product_identifier_household_write
  on fridge.product_identifier
  for all
  using (
    exists (
      select 1
      from fridge.product p
      where p.product_id = product_identifier.product_id
        and p.catalog_scope = 'HOUSEHOLD'
        and p.owner_household_id = fridge_internal.current_household_id()
    )
  )
  with check (
    exists (
      select 1
      from fridge.product p
      where p.product_id = product_identifier.product_id
        and p.catalog_scope = 'HOUSEHOLD'
        and p.owner_household_id = fridge_internal.current_household_id()
    )
  );

alter table fridge.recipe_ingredient enable row level security;
alter table fridge.recipe_ingredient force row level security;
create policy recipe_ingredient_visible
  on fridge.recipe_ingredient
  for select
  using (
    exists (
      select 1
      from fridge.recipe_version rv
      where rv.recipe_version_id = recipe_ingredient.recipe_version_id
        and (
          rv.catalog_scope = 'GLOBAL'
          or rv.owner_household_id = fridge_internal.current_household_id()
        )
    )
  );
create policy recipe_ingredient_household_write
  on fridge.recipe_ingredient
  for all
  using (
    exists (
      select 1
      from fridge.recipe_version rv
      where rv.recipe_version_id = recipe_ingredient.recipe_version_id
        and rv.catalog_scope = 'HOUSEHOLD'
        and rv.owner_household_id = fridge_internal.current_household_id()
    )
  )
  with check (
    exists (
      select 1
      from fridge.recipe_version rv
      where rv.recipe_version_id = recipe_ingredient.recipe_version_id
        and rv.catalog_scope = 'HOUSEHOLD'
        and rv.owner_household_id = fridge_internal.current_household_id()
    )
  );

-- Evidence with nullable Household is tenant-visible only when explicitly bound
-- to the active Household. Global/governance evidence stays outside tenant RLS.
alter table fridge.compatibility_decision_evidence enable row level security;
alter table fridge.compatibility_decision_evidence force row level security;
create policy compatibility_evidence_household_isolation
  on fridge.compatibility_decision_evidence
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

-- Integrations/idempotency can also be GLOBAL, but ordinary Household contexts do
-- not implicitly gain access to those global operational rows.
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

commit;
