-- FridgeScanner DB-02
-- 000009_01__preparation_allocation_scope.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Binds each PreparationInputAllocation to one exact Preparation execution.

begin;

alter table fridge.preparation_recipe_requirement
  add constraint preparation_requirement_execution_line_identity_uq
  unique (
    household_id,
    preparation_id,
    preparation_recipe_requirement_id,
    recipe_ingredient_id
  );

alter table fridge.preparation_input_allocation
  add column preparation_id uuid not null;

alter table fridge.preparation_input_allocation
  drop constraint preparation_input_allocation_input_product_fk,
  drop constraint preparation_input_allocation_requirement_line_fk,
  add constraint preparation_input_allocation_input_execution_product_fk
    foreign key (
      household_id,
      preparation_id,
      preparation_input_id,
      product_id
    )
    references fridge.preparation_input (
      household_id,
      preparation_id,
      preparation_input_id,
      product_id
    )
    on update restrict on delete restrict,
  add constraint preparation_input_allocation_requirement_execution_fk
    foreign key (
      household_id,
      preparation_id,
      preparation_recipe_requirement_id,
      recipe_ingredient_id
    )
    references fridge.preparation_recipe_requirement (
      household_id,
      preparation_id,
      preparation_recipe_requirement_id,
      recipe_ingredient_id
    )
    on update restrict on delete restrict;

comment on column fridge.preparation_input_allocation.preparation_id is
  'Exact Preparation execution shared by both the concrete input and the frozen recipe requirement. Prevents cross-preparation allocation inside one Household.';

commit;
