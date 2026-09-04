-- FridgeScanner DB-02
-- 000013_01__external_reference_import_context.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Prevents MATCH SIMPLE null-short-circuit from allowing a GLOBAL
-- ExternalReference to cite an ImportRun from another Integration.

begin;

alter table fridge.import_run
  add constraint import_run_integration_identity_uq
  unique (integration_id, import_run_id);

alter table fridge.external_reference
  add constraint external_reference_import_run_integration_fk
    foreign key (integration_id, import_run_id)
    references fridge.import_run (integration_id, import_run_id)
    on update restrict on delete restrict;

comment on constraint external_reference_import_run_integration_fk
  on fridge.external_reference is
  'When import_run_id is present, its Integration must match even when Household context is NULL. The existing Household-aware FK additionally enforces Household equality whenever Household scope is present.';

commit;
