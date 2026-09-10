-- FridgeScanner DB-02
-- 000073_01__receipt_inventory_effect_trigger_security.sql
--
-- Receipt/inventory conservation is a database-owned postcondition. The
-- deferred constraint-trigger wrappers therefore need controlled definer
-- authority to invoke private internal helpers when a least-privileged runtime
-- command commits. The helpers themselves remain unavailable to runtime roles.

begin;

alter function fridge_internal.guard_receipt_item_parent_inventory_effects()
  security definer;

alter function fridge_internal.guard_receipt_item_parent_inventory_effects()
  set search_path = pg_catalog, fridge, fridge_internal;

alter function fridge_internal.guard_receipt_item_inventory_effect()
  security definer;

alter function fridge_internal.guard_receipt_item_inventory_effect()
  set search_path = pg_catalog, fridge, fridge_internal;

-- Keep both trigger wrappers and the underlying invariant helper private as
-- callable API surfaces. Trigger execution does not require runtime EXECUTE.
revoke all on function fridge_internal.guard_receipt_item_parent_inventory_effects() from public;
revoke all on function fridge_internal.guard_receipt_item_inventory_effect() from public;
revoke all on function fridge_internal.assert_receipt_item_inventory_effects(uuid, uuid) from public;

commit;
