-- FridgeScanner DB-02
-- 000010_01__shelf_life_timezone_contract.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

alter table fridge.shelf_life_rule
  add constraint shelf_life_rule_timezone_basis_contract
  check (
    (
      temporal_basis = 'ELAPSED'
      and timezone_selection_code is null
    )
    or
    (
      temporal_basis = 'LOCAL_CALENDAR'
      and timezone_selection_code is not null
      and btrim(timezone_selection_code) <> ''
    )
  );

comment on constraint shelf_life_rule_timezone_basis_contract
  on fridge.shelf_life_rule is
  'LOCAL_CALENDAR requires an explicit governed timezone-selection contract; ELAPSED duration is timezone-independent and must not carry competing timezone-selection semantics.';

commit;
