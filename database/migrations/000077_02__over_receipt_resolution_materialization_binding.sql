-- FridgeScanner BE-06
-- 000077_02__over_receipt_resolution_materialization_binding.sql
-- Accepted excess must belong to the exact physical materialization of the detected intent.

begin;

alter table fridge.receipt_item_intent_materialization
  add constraint receipt_item_intent_materialization_resolution_identity_uq
  unique (
    household_id,
    receipt_item_intent_id,
    receipt_item_id,
    purchase_item_receipt_allocation_id
  );

alter table fridge.purchase_receiving_exception_resolution
  add constraint receiving_exception_resolution_exact_materialization_fk
  foreign key (
    household_id,
    receipt_item_intent_id,
    receipt_item_id,
    ordinary_allocation_id
  ) references fridge.receipt_item_intent_materialization (
    household_id,
    receipt_item_intent_id,
    receipt_item_id,
    purchase_item_receipt_allocation_id
  )
  on update restrict on delete restrict;

comment on constraint receiving_exception_resolution_exact_materialization_fk
  on fridge.purchase_receiving_exception_resolution is
  'Prevents accepted excess from being attributed to an allocation/ReceiptItem that is not the exact ordinary physical materialization of the ReceiptItemIntent bound to the detected exception.';

commit;
