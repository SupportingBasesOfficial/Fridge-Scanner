-- FridgeScanner DB-02
-- 000016__historical_immutability.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create or replace function fridge_internal.reject_historical_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I.%I is append-only; %s is not permitted', tg_table_schema, tg_table_name, tg_op);
end;
$$;

comment on function fridge_internal.reject_historical_mutation() is
  'Generic append-only guard for facts whose committed row identity/meaning must never be rewritten or deleted.';

revoke all on function fridge_internal.reject_historical_mutation() from public;

create trigger inventory_movement_immutable
before update or delete on fridge.inventory_movement
for each row execute function fridge_internal.reject_historical_mutation();

create trigger inventory_transfer_immutable
before update or delete on fridge.inventory_transfer
for each row execute function fridge_internal.reject_historical_mutation();

create trigger inventory_transfer_effect_immutable
before update or delete on fridge.inventory_transfer_effect
for each row execute function fridge_internal.reject_historical_mutation();

create trigger inventory_quantity_lineage_immutable
before update or delete on fridge.inventory_quantity_lineage
for each row execute function fridge_internal.reject_historical_mutation();

create trigger receipt_item_inventory_effect_immutable
before update or delete on fridge.receipt_item_inventory_effect
for each row execute function fridge_internal.reject_historical_mutation();

create trigger waste_record_movement_immutable
before update or delete on fridge.waste_record_movement
for each row execute function fridge_internal.reject_historical_mutation();

create trigger inventory_ledger_basis_immutable
before update or delete on fridge.inventory_ledger_basis
for each row execute function fridge_internal.reject_historical_mutation();

create trigger inventory_reconciliation_outcome_immutable
before update or delete on fridge.inventory_reconciliation_outcome
for each row execute function fridge_internal.reject_historical_mutation();

create trigger preparation_recipe_requirement_immutable
before update or delete on fridge.preparation_recipe_requirement
for each row execute function fridge_internal.reject_historical_mutation();

create trigger preparation_input_movement_immutable
before update or delete on fridge.preparation_input_movement
for each row execute function fridge_internal.reject_historical_mutation();

create trigger preparation_input_allocation_immutable
before update or delete on fridge.preparation_input_allocation
for each row execute function fridge_internal.reject_historical_mutation();

create trigger preparation_input_deviation_immutable
before update or delete on fridge.preparation_input_deviation
for each row execute function fridge_internal.reject_historical_mutation();

create trigger recipe_fulfillment_deviation_immutable
before update or delete on fridge.recipe_fulfillment_deviation
for each row execute function fridge_internal.reject_historical_mutation();

create trigger preparation_output_movement_immutable
before update or delete on fridge.preparation_output_movement
for each row execute function fridge_internal.reject_historical_mutation();

create trigger source_expiration_fact_immutable
before update or delete on fridge.source_expiration_fact
for each row execute function fridge_internal.reject_historical_mutation();

create trigger food_lifecycle_event_immutable
before update or delete on fridge.food_lifecycle_event
for each row execute function fridge_internal.reject_historical_mutation();

create trigger shelf_life_rule_activation_immutable
before update or delete on fridge.shelf_life_rule_activation
for each row execute function fridge_internal.reject_historical_mutation();

create trigger quantity_lineage_shelf_life_fact_immutable
before update or delete on fridge.quantity_lineage_shelf_life_fact
for each row execute function fridge_internal.reject_historical_mutation();

create trigger shopping_list_fulfillment_immutable
before update or delete on fridge.shopping_list_fulfillment
for each row execute function fridge_internal.reject_historical_mutation();

create trigger alert_trigger_subject_immutable
before update or delete on fridge.alert_trigger_subject
for each row execute function fridge_internal.reject_historical_mutation();

create trigger audit_event_immutable
before update or delete on fridge.audit_event
for each row execute function fridge_internal.reject_historical_mutation();

commit;
