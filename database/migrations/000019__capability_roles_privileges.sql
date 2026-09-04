-- FridgeScanner DB-02
-- 000019__capability_roles_privileges.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Establishes provider-neutral NOLOGIN capability roles and least-privilege
-- grants. Environment login identities may be members of these capabilities;
-- browser/mobile/provider role names never become domain authority semantics.
-- This migration must run under a bootstrap identity allowed to CREATE ROLE.

begin;

do $$
declare
  v_role text;
  v_roles constant text[] := array[
    'fridge_owner',
    'fridge_migrator',
    'fridge_app',
    'fridge_worker',
    'fridge_readonly'
  ];
begin
  foreach v_role in array v_roles loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute format(
        'create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',
        v_role
      );
    end if;
  end loop;
end;
$$;

-- Canonical schemas are never public capability surfaces.
revoke all on schema fridge from public;
revoke all on schema fridge_internal from public;
revoke create on schema fridge from fridge_app, fridge_worker, fridge_readonly;
revoke create on schema fridge_internal from fridge_app, fridge_worker, fridge_readonly;

grant usage on schema fridge to fridge_app, fridge_worker, fridge_readonly;
grant usage on schema fridge_internal to fridge_app, fridge_worker, fridge_readonly;

-- PUBLIC receives no canonical table or sequence privileges.
revoke all on all tables in schema fridge from public;
revoke all on all sequences in schema fridge from public;
revoke all on all functions in schema fridge from public;
revoke all on all functions in schema fridge_internal from public;

-- Normal application capabilities receive read access only to explicitly
-- reviewed relations. Tenant-bearing/mixed catalog rows remain constrained by
-- RLS installed in 000017. No direct INSERT/UPDATE/DELETE is granted here.
do $$
declare
  v_table text;
  v_tables constant text[] := array[
    -- governed global/reference data
    'household_role',
    'storage_location_kind',
    'compartment_kind',
    'brand',
    'manufacturer',
    'product_category',
    'product_identifier_normalization_rule',
    'measurement_dimension',
    'measurement_unit',
    'measurement_conversion_rule',
    'currency',
    'money_rounding_policy',

    -- Household / mixed catalog / operational data protected by RLS
    'household',
    'household_timezone_version',
    'household_membership',
    'storage_location',
    'compartment',
    'ingredient_concept',
    'product',
    'product_ingredient_compatibility',
    'compatibility_decision_evidence',
    'product_identifier',
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
    'recipe',
    'recipe_version',
    'recipe_ingredient',
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
    'shelf_life_rule',
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
    'integration',
    'import_run',
    'external_reference',
    'idempotency_record',
    'audit_event',
    'outbox_record'
  ];
begin
  foreach v_table in array v_tables loop
    execute format(
      'grant select on table fridge.%I to fridge_app, fridge_worker, fridge_readonly',
      v_table
    );
  end loop;
end;
$$;

-- RLS predicate helper is executable by trusted DB capabilities only.
grant execute on function fridge_internal.current_household_id()
  to fridge_app, fridge_worker, fridge_readonly;

-- Idempotency mutation remains function-only. Readonly cannot acquire/modify.
grant usage on type fridge_internal.idempotency_acquire_result
  to fridge_app, fridge_worker;
grant execute on function fridge_internal.acquire_idempotency(
  uuid,
  fridge.command_scope,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to fridge_app, fridge_worker;

-- Explicit privileged GLOBAL policy used only by owner/migrator-capable sessions.
create policy idempotency_global_privileged
  on fridge.idempotency_record
  for all
  using (
    pg_has_role(session_user, 'fridge_owner', 'member')
    or pg_has_role(session_user, 'fridge_migrator', 'member')
  )
  with check (
    target_scope = 'GLOBAL'
    and household_id is null
    and (
      pg_has_role(session_user, 'fridge_owner', 'member')
      or pg_has_role(session_user, 'fridge_migrator', 'member')
    )
  );

-- Future mutation boundaries grant EXECUTE explicitly as they are installed.
-- Direct DML remains absent for app/worker/readonly by design.

commit;
