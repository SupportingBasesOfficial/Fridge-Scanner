-- FridgeScanner DB-02
-- 000009_02__preparation_input_execution_key.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Supplies the exact candidate key required by the execution-scoped
-- PreparationInputAllocation foreign key introduced in 000009_01.

begin;

alter table fridge.preparation_input
  add constraint preparation_input_execution_product_identity_uq
  unique (
    household_id,
    preparation_id,
    preparation_input_id,
    product_id
  );

commit;
