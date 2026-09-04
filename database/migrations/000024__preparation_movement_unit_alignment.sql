-- FridgeScanner DB-02
-- 000024__preparation_movement_unit_alignment.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- A Preparation movement edge currently carries one conversion-evidence identity.
-- Therefore its ledger movement and its Preparation input/output must share one
-- canonical reconciliation unit; the edge may itself use another unit only when
-- the single evidence converts that edge quantity into this shared target unit.

begin;

create or replace function fridge_internal.guard_preparation_input_movement_unit_alignment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_input_unit uuid;
  v_movement_unit uuid;
begin
  select consumed_unit_id
    into v_input_unit
    from fridge.preparation_input
   where household_id = new.household_id
     and preparation_input_id = new.preparation_input_id;

  select measurement_unit_id
    into v_movement_unit
    from fridge.inventory_movement
   where household_id = new.household_id
     and inventory_movement_id = new.inventory_movement_id;

  if v_input_unit is null or v_movement_unit is null then
    raise exception using errcode = '23503', message = 'PreparationInput movement unit endpoints are missing';
  end if;

  if v_input_unit <> v_movement_unit then
    raise exception using
      errcode = '23514',
      message = 'PreparationInput and its ledger movement must share one canonical reconciliation unit';
  end if;

  return null;
end;
$$;

create or replace function fridge_internal.guard_preparation_output_movement_unit_alignment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_output_unit uuid;
  v_movement_unit uuid;
begin
  select produced_unit_id
    into v_output_unit
    from fridge.preparation_output
   where household_id = new.household_id
     and preparation_output_id = new.preparation_output_id;

  select measurement_unit_id
    into v_movement_unit
    from fridge.inventory_movement
   where household_id = new.household_id
     and inventory_movement_id = new.inventory_movement_id;

  if v_output_unit is null or v_movement_unit is null then
    raise exception using errcode = '23503', message = 'PreparationOutput movement unit endpoints are missing';
  end if;

  if v_output_unit <> v_movement_unit then
    raise exception using
      errcode = '23514',
      message = 'PreparationOutput and its ledger movement must share one canonical reconciliation unit';
  end if;

  return null;
end;
$$;

revoke all on function fridge_internal.guard_preparation_input_movement_unit_alignment() from public;
revoke all on function fridge_internal.guard_preparation_output_movement_unit_alignment() from public;

create constraint trigger preparation_input_movement_unit_alignment_ct
  after insert or update
  on fridge.preparation_input_movement
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_input_movement_unit_alignment();

create constraint trigger preparation_output_movement_unit_alignment_ct
  after insert or update
  on fridge.preparation_output_movement
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_output_movement_unit_alignment();

commit;
