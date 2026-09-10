-- FridgeScanner DB-02
-- 000073_02__receiving_allocation_trigger_security.sql
--
-- Ordinary/substitution receiving allocation conservation is a database-owned
-- deferred postcondition. The shared trigger wrapper must retain controlled
-- internal authority when a least-privileged runtime transaction reaches
-- COMMIT, while its underlying exact-conservation helpers remain private.

begin;

alter function fridge_internal.guard_receiving_allocation_conservation()
  security definer;

alter function fridge_internal.guard_receiving_allocation_conservation()
  set search_path = pg_catalog, fridge, fridge_internal;

revoke all on function fridge_internal.guard_receiving_allocation_conservation() from public;
revoke all on function fridge_internal.assert_purchase_receiving_pool(uuid, uuid) from public;
revoke all on function fridge_internal.assert_receipt_item_allocation_pool(uuid, uuid) from public;

commit;
