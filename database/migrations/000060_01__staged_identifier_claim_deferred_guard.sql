-- FridgeScanner BE-05
-- 000060_01__staged_identifier_claim_deferred_guard.sql
-- Keep deferred staged-claim contract enforcement internal when governed app writes commit.

begin;

create or replace function fridge_internal.guard_staged_identifier_claim_contract_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform fridge_internal.assert_staged_identifier_claim_contract(
    new.staged_identifier_claim_id
  );
  return null;
end;
$$;

comment on function fridge_internal.guard_staged_identifier_claim_contract_row() is
  'Internal deferred staged_identifier_claim contract guard. Runs with definer authority so a governed app write can commit without exposing assertion helpers to application roles.';

revoke all on function fridge_internal.guard_staged_identifier_claim_contract_row() from public;

drop trigger staged_identifier_claim_contract_guard
  on fridge.staged_identifier_claim;

create constraint trigger staged_identifier_claim_contract_guard
after insert or update on fridge.staged_identifier_claim
deferrable initially deferred
for each row
execute function fridge_internal.guard_staged_identifier_claim_contract_row();

commit;
