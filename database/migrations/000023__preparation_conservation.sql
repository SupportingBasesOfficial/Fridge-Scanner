-- FridgeScanner DB-02
-- 000023__preparation_conservation.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Enforces exact Preparation conservation at transaction end:
-- - decrement movement effects exactly materialize each PreparationInput;
-- - allocations plus explicit source deviations exactly exhaust each input;
-- - allocations plus explicit target deviation reconcile each frozen requirement;
-- - increment movement effects exactly materialize each PreparationOutput.

begin;

create or replace function fridge_internal.assert_preparation_input_movements(
  p_household_id uuid,
  p_preparation_input_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_input fridge.preparation_input%rowtype;
  v_edge record;
  v_movement fridge.inventory_movement%rowtype;
  v_edge_in_movement record;
  v_edge_in_input record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select *
    into v_input
    from fridge.preparation_input
   where household_id = p_household_id
     and preparation_input_id = p_preparation_input_id
   for update;

  if not found then
    return;
  end if;

  for v_edge in
    select *
      from fridge.preparation_input_movement
     where household_id = p_household_id
       and preparation_input_id = p_preparation_input_id
  loop
    select *
      into v_movement
      from fridge.inventory_movement
     where household_id = p_household_id
       and inventory_movement_id = v_edge.inventory_movement_id;

    if not found then
      raise exception using errcode = '23503', message = 'PreparationInput movement endpoint is missing';
    end if;

    if v_movement.quantity_num >= 0 then
      raise exception using errcode = '23514', message = 'PreparationInput must be materialized by stock-decreasing InventoryMovement';
    end if;

    select *
      into v_edge_in_movement
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_edge.quantity_num,
        v_edge.quantity_den,
        v_edge.measurement_unit_id,
        v_movement.measurement_unit_id,
        v_edge.conversion_evidence_id
      );

    if not fridge_internal.rational_equal(
      v_edge_in_movement.quantity_num,
      v_edge_in_movement.quantity_den,
      -v_movement.quantity_num,
      v_movement.quantity_den
    ) then
      raise exception using
        errcode = '23514',
        message = 'PreparationInput movement edge does not exactly reconcile to ledger decrement';
    end if;

    select *
      into v_edge_in_input
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_edge.quantity_num,
        v_edge.quantity_den,
        v_edge.measurement_unit_id,
        v_input.consumed_unit_id,
        v_edge.conversion_evidence_id
      );

    select quantity_num, quantity_den
      into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_edge_in_input.quantity_den
          + v_edge_in_input.quantity_num * v_sum_den,
        v_sum_den * v_edge_in_input.quantity_den
      );
    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  if not fridge_internal.rational_equal(
    v_sum_num,
    v_sum_den,
    v_input.consumed_quantity_num,
    v_input.consumed_quantity_den
  ) then
    raise exception using
      errcode = '23514',
      message = 'PreparationInput movement effects do not exactly sum to consumed quantity';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_preparation_input_movements(uuid,uuid) from public;

create or replace function fridge_internal.assert_preparation_input_accounting(
  p_household_id uuid,
  p_preparation_input_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_input fridge.preparation_input%rowtype;
  v_row record;
  v_converted record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select *
    into v_input
    from fridge.preparation_input
   where household_id = p_household_id
     and preparation_input_id = p_preparation_input_id
   for update;

  if not found then
    return;
  end if;

  for v_row in
    select allocated_quantity_num as q_num,
           allocated_quantity_den as q_den,
           allocation_unit_id as unit_id,
           conversion_evidence_id
      from fridge.preparation_input_allocation
     where household_id = p_household_id
       and preparation_input_id = p_preparation_input_id
  loop
    select *
      into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_row.q_num,
        v_row.q_den,
        v_row.unit_id,
        v_input.consumed_unit_id,
        v_row.conversion_evidence_id
      );

    select quantity_num, quantity_den
      into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_converted.quantity_den
          + v_converted.quantity_num * v_sum_den,
        v_sum_den * v_converted.quantity_den
      );
    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  for v_row in
    select quantity_num as q_num,
           quantity_den as q_den,
           measurement_unit_id as unit_id
      from fridge.preparation_input_deviation
     where household_id = p_household_id
       and preparation_input_id = p_preparation_input_id
  loop
    if v_row.unit_id <> v_input.consumed_unit_id then
      raise exception using
        errcode = '23514',
        message = 'PreparationInput deviation must use consumed unit until explicit deviation conversion evidence exists';
    end if;

    select quantity_num, quantity_den
      into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_row.q_den + v_row.q_num * v_sum_den,
        v_sum_den * v_row.q_den
      );
    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  if not fridge_internal.rational_equal(
    v_sum_num,
    v_sum_den,
    v_input.consumed_quantity_num,
    v_input.consumed_quantity_den
  ) then
    raise exception using
      errcode = '23514',
      message = 'PreparationInput allocations plus deviations do not exactly exhaust consumed quantity';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_preparation_input_accounting(uuid,uuid) from public;

create or replace function fridge_internal.assert_preparation_requirement_fulfillment(
  p_household_id uuid,
  p_requirement_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_requirement fridge.preparation_recipe_requirement%rowtype;
  v_row record;
  v_converted record;
  v_deviation fridge.recipe_fulfillment_deviation%rowtype;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select *
    into v_requirement
    from fridge.preparation_recipe_requirement
   where household_id = p_household_id
     and preparation_recipe_requirement_id = p_requirement_id
   for update;

  if not found then
    return;
  end if;

  for v_row in
    select allocated_quantity_num as q_num,
           allocated_quantity_den as q_den,
           allocation_unit_id as unit_id,
           conversion_evidence_id
      from fridge.preparation_input_allocation
     where household_id = p_household_id
       and preparation_recipe_requirement_id = p_requirement_id
  loop
    select *
      into v_converted
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_row.q_num,
        v_row.q_den,
        v_row.unit_id,
        v_requirement.effective_required_unit_id,
        v_row.conversion_evidence_id
      );

    select quantity_num, quantity_den
      into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_converted.quantity_den
          + v_converted.quantity_num * v_sum_den,
        v_sum_den * v_converted.quantity_den
      );
    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  select *
    into v_deviation
    from fridge.recipe_fulfillment_deviation
   where household_id = p_household_id
     and preparation_recipe_requirement_id = p_requirement_id;

  if found then
    if v_deviation.measurement_unit_id <> v_requirement.effective_required_unit_id then
      raise exception using
        errcode = '23514',
        message = 'Recipe fulfillment deviation must use frozen requirement unit';
    end if;

    if not fridge_internal.rational_equal(
      v_deviation.expected_quantity_num,
      v_deviation.expected_quantity_den,
      v_requirement.effective_required_quantity_num,
      v_requirement.effective_required_quantity_den
    ) then
      raise exception using
        errcode = '23514',
        message = 'Recipe fulfillment deviation expected quantity must equal frozen effective requirement';
    end if;

    if not fridge_internal.rational_equal(
      v_deviation.actual_quantity_num,
      v_deviation.actual_quantity_den,
      v_sum_num,
      v_sum_den
    ) then
      raise exception using
        errcode = '23514',
        message = 'Recipe fulfillment deviation actual quantity must equal exact committed allocations';
    end if;
  elsif not fridge_internal.rational_equal(
    v_sum_num,
    v_sum_den,
    v_requirement.effective_required_quantity_num,
    v_requirement.effective_required_quantity_den
  ) then
    raise exception using
      errcode = '23514',
      message = 'Recipe requirement allocations differ from effective requirement without explicit fulfillment deviation';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_preparation_requirement_fulfillment(uuid,uuid) from public;

create or replace function fridge_internal.assert_preparation_output_movements(
  p_household_id uuid,
  p_preparation_output_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_output fridge.preparation_output%rowtype;
  v_edge record;
  v_movement fridge.inventory_movement%rowtype;
  v_edge_in_movement record;
  v_edge_in_output record;
  v_sum_num numeric := 0;
  v_sum_den numeric := 1;
  v_norm_num numeric;
  v_norm_den numeric;
begin
  select *
    into v_output
    from fridge.preparation_output
   where household_id = p_household_id
     and preparation_output_id = p_preparation_output_id
   for update;

  if not found then
    return;
  end if;

  for v_edge in
    select *
      from fridge.preparation_output_movement
     where household_id = p_household_id
       and preparation_output_id = p_preparation_output_id
  loop
    select *
      into v_movement
      from fridge.inventory_movement
     where household_id = p_household_id
       and inventory_movement_id = v_edge.inventory_movement_id;

    if not found then
      raise exception using errcode = '23503', message = 'PreparationOutput movement endpoint is missing';
    end if;

    if v_movement.quantity_num <= 0 then
      raise exception using errcode = '23514', message = 'PreparationOutput must be materialized by stock-increasing InventoryMovement';
    end if;

    select *
      into v_edge_in_movement
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_edge.quantity_num,
        v_edge.quantity_den,
        v_edge.measurement_unit_id,
        v_movement.measurement_unit_id,
        v_edge.conversion_evidence_id
      );

    if not fridge_internal.rational_equal(
      v_edge_in_movement.quantity_num,
      v_edge_in_movement.quantity_den,
      v_movement.quantity_num,
      v_movement.quantity_den
    ) then
      raise exception using
        errcode = '23514',
        message = 'PreparationOutput movement edge does not exactly reconcile to ledger increment';
    end if;

    select *
      into v_edge_in_output
      from fridge_internal.quantity_in_target_unit(
        p_household_id,
        v_edge.quantity_num,
        v_edge.quantity_den,
        v_edge.measurement_unit_id,
        v_output.produced_unit_id,
        v_edge.conversion_evidence_id
      );

    select quantity_num, quantity_den
      into v_norm_num, v_norm_den
      from fridge_internal.normalize_rational(
        v_sum_num * v_edge_in_output.quantity_den
          + v_edge_in_output.quantity_num * v_sum_den,
        v_sum_den * v_edge_in_output.quantity_den
      );
    v_sum_num := v_norm_num;
    v_sum_den := v_norm_den;
  end loop;

  if not fridge_internal.rational_equal(
    v_sum_num,
    v_sum_den,
    v_output.produced_quantity_num,
    v_output.produced_quantity_den
  ) then
    raise exception using
      errcode = '23514',
      message = 'PreparationOutput movement effects do not exactly sum to produced quantity';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_preparation_output_movements(uuid,uuid) from public;

create or replace function fridge_internal.guard_preparation_input_parent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'DELETE' then
    perform fridge_internal.assert_preparation_input_movements(new.household_id, new.preparation_input_id);
    perform fridge_internal.assert_preparation_input_accounting(new.household_id, new.preparation_input_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_preparation_input_child()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_preparation_input_movements(old.household_id, old.preparation_input_id);
    perform fridge_internal.assert_preparation_input_accounting(old.household_id, old.preparation_input_id);
  end if;
  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old.household_id is distinct from new.household_id
    or old.preparation_input_id is distinct from new.preparation_input_id
  ) then
    perform fridge_internal.assert_preparation_input_movements(new.household_id, new.preparation_input_id);
    perform fridge_internal.assert_preparation_input_accounting(new.household_id, new.preparation_input_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_preparation_input_accounting_child()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_preparation_input_accounting(old.household_id, old.preparation_input_id);
  end if;
  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old.household_id is distinct from new.household_id
    or old.preparation_input_id is distinct from new.preparation_input_id
  ) then
    perform fridge_internal.assert_preparation_input_accounting(new.household_id, new.preparation_input_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_preparation_requirement_parent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'DELETE' then
    perform fridge_internal.assert_preparation_requirement_fulfillment(new.household_id, new.preparation_recipe_requirement_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_preparation_requirement_child()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_preparation_requirement_fulfillment(old.household_id, old.preparation_recipe_requirement_id);
  end if;
  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old.household_id is distinct from new.household_id
    or old.preparation_recipe_requirement_id is distinct from new.preparation_recipe_requirement_id
  ) then
    perform fridge_internal.assert_preparation_requirement_fulfillment(new.household_id, new.preparation_recipe_requirement_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_preparation_output_parent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'DELETE' then
    perform fridge_internal.assert_preparation_output_movements(new.household_id, new.preparation_output_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_preparation_output_child()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_preparation_output_movements(old.household_id, old.preparation_output_id);
  end if;
  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old.household_id is distinct from new.household_id
    or old.preparation_output_id is distinct from new.preparation_output_id
  ) then
    perform fridge_internal.assert_preparation_output_movements(new.household_id, new.preparation_output_id);
  end if;
  return null;
end;
$$;

revoke all on function fridge_internal.guard_preparation_input_parent() from public;
revoke all on function fridge_internal.guard_preparation_input_child() from public;
revoke all on function fridge_internal.guard_preparation_input_accounting_child() from public;
revoke all on function fridge_internal.guard_preparation_requirement_parent() from public;
revoke all on function fridge_internal.guard_preparation_requirement_child() from public;
revoke all on function fridge_internal.guard_preparation_output_parent() from public;
revoke all on function fridge_internal.guard_preparation_output_child() from public;

create constraint trigger preparation_input_parent_conservation_ct
  after insert or update
  on fridge.preparation_input
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_input_parent();

create constraint trigger preparation_input_movement_conservation_ct
  after insert or update or delete
  on fridge.preparation_input_movement
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_input_child();

create constraint trigger preparation_input_allocation_conservation_ct
  after insert or update or delete
  on fridge.preparation_input_allocation
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_input_accounting_child();

create constraint trigger preparation_input_deviation_conservation_ct
  after insert or update or delete
  on fridge.preparation_input_deviation
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_input_accounting_child();

create constraint trigger preparation_requirement_parent_conservation_ct
  after insert or update
  on fridge.preparation_recipe_requirement
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_requirement_parent();

create constraint trigger preparation_requirement_allocation_conservation_ct
  after insert or update or delete
  on fridge.preparation_input_allocation
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_requirement_child();

create constraint trigger preparation_requirement_deviation_conservation_ct
  after insert or update or delete
  on fridge.recipe_fulfillment_deviation
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_requirement_child();

create constraint trigger preparation_output_parent_conservation_ct
  after insert or update
  on fridge.preparation_output
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_output_parent();

create constraint trigger preparation_output_movement_conservation_ct
  after insert or update or delete
  on fridge.preparation_output_movement
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_preparation_output_child();

commit;
