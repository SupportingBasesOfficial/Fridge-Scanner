-- FridgeScanner DB-02
-- 000007_02__procurement_money_guards.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Closes F2-008 by making a persisted rounding-policy reference valid only
-- when the monetary fact and the referenced policy carry the same currency.

begin;

alter table fridge.money_rounding_policy
  add constraint money_rounding_policy_currency_identity_uq
  unique (currency_code, money_rounding_policy_id);

alter table fridge.purchase_money_fact
  drop constraint purchase_money_fact_rounding_policy_fk,
  add constraint purchase_money_fact_rounding_policy_currency_fk
    foreign key (currency_code, money_rounding_policy_id)
    references fridge.money_rounding_policy (
      currency_code,
      money_rounding_policy_id
    )
    on update restrict on delete restrict;

alter table fridge.purchase_item_money_fact
  drop constraint purchase_item_money_fact_rounding_policy_fk,
  add constraint purchase_item_money_fact_rounding_policy_currency_fk
    foreign key (currency_code, money_rounding_policy_id)
    references fridge.money_rounding_policy (
      currency_code,
      money_rounding_policy_id
    )
    on update restrict on delete restrict;

alter table fridge.purchase_item_pricing_discrepancy
  drop constraint pricing_discrepancy_rounding_policy_fk,
  add constraint pricing_discrepancy_rounding_policy_currency_fk
    foreign key (currency_code, money_rounding_policy_id)
    references fridge.money_rounding_policy (
      currency_code,
      money_rounding_policy_id
    )
    on update restrict on delete restrict;

comment on constraint money_rounding_policy_currency_identity_uq
  on fridge.money_rounding_policy is
  'Candidate key used by monetary evidence so a rounding policy cannot be applied under a different currency identity.';

comment on constraint purchase_money_fact_rounding_policy_currency_fk
  on fridge.purchase_money_fact is
  'Pins a purchase-level monetary fact only to a rounding policy for the same currency.';

comment on constraint purchase_item_money_fact_rounding_policy_currency_fk
  on fridge.purchase_item_money_fact is
  'Pins a line-level monetary fact only to a rounding policy for the same currency.';

comment on constraint pricing_discrepancy_rounding_policy_currency_fk
  on fridge.purchase_item_pricing_discrepancy is
  'Pins pricing discrepancy evidence only to a rounding policy for the same currency.';

commit;
