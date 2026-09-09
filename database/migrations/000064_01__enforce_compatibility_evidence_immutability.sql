-- FridgeScanner BE-05
-- 000064_01__enforce_compatibility_evidence_immutability.sql
-- Structural immutability for committed CompatibilityDecisionEvidence.

begin;

create or replace function fridge_internal.reject_compatibility_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'CompatibilityDecisionEvidence is immutable; create explicit correction evidence instead';
end;
$$;

comment on function fridge_internal.reject_compatibility_evidence_mutation() is
  'Rejects UPDATE/DELETE of committed CompatibilityDecisionEvidence. Corrections must append new governed evidence rather than rewrite history.';

revoke all on function fridge_internal.reject_compatibility_evidence_mutation() from public;

drop trigger if exists compatibility_evidence_immutable_guard
  on fridge.compatibility_decision_evidence;

create trigger compatibility_evidence_immutable_guard
before update or delete on fridge.compatibility_decision_evidence
for each row
execute function fridge_internal.reject_compatibility_evidence_mutation();

commit;
