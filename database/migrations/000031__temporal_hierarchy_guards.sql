-- FridgeScanner DB-02
-- 000031__temporal_hierarchy_guards.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Adds transaction-end guards for two cross-row invariants that core local CHECKs
-- cannot express: HouseholdTimezoneVersion interval non-overlap and ProductCategory
-- hierarchy acyclicity.

begin;

create or replace function fridge_internal.assert_household_timezone_nonoverlap(
  p_household_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_overlap boolean;
begin
  -- Serializes concurrent interval writers for one Household. A contender that
  -- waits here observes the winner's committed interval before validating.
  perform 1
    from fridge.household
   where household_id = p_household_id
   for update;

  select exists (
    select 1
      from fridge.household_timezone_version a
      join fridge.household_timezone_version b
        on b.household_id = a.household_id
       and b.household_timezone_version_id > a.household_timezone_version_id
     where a.household_id = p_household_id
       and a.effective_from < coalesce(b.effective_to, 'infinity'::timestamptz)
       and b.effective_from < coalesce(a.effective_to, 'infinity'::timestamptz)
  ) into v_overlap;

  if v_overlap then
    raise exception using
      errcode = '23P01',
      message = 'HouseholdTimezoneVersion effective intervals must not overlap within one Household';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_household_timezone_nonoverlap(uuid) from public;

create or replace function fridge_internal.guard_household_timezone_nonoverlap()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_household_timezone_nonoverlap(old.household_id);
  end if;
  if tg_op <> 'DELETE'
     and (tg_op = 'INSERT' or old.household_id is distinct from new.household_id) then
    perform fridge_internal.assert_household_timezone_nonoverlap(new.household_id);
  elsif tg_op = 'UPDATE' then
    perform fridge_internal.assert_household_timezone_nonoverlap(new.household_id);
  end if;
  return null;
end;
$$;

revoke all on function fridge_internal.guard_household_timezone_nonoverlap() from public;

create constraint trigger household_timezone_nonoverlap_guard
after insert or update or delete on fridge.household_timezone_version
deferrable initially deferred
for each row execute function fridge_internal.guard_household_timezone_nonoverlap();

create or replace function fridge_internal.assert_product_category_acyclic(
  p_product_category_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_cycle boolean;
begin
  -- Category parent mutation is rare. A table-level writer lock gives a simple,
  -- provider-neutral serializable boundary for concurrent hierarchy changes.
  lock table fridge.product_category in share row exclusive mode;

  with recursive ancestors(product_category_id, parent_product_category_id) as (
    select pc.product_category_id, pc.parent_product_category_id
      from fridge.product_category pc
     where pc.product_category_id = (
       select parent_product_category_id
         from fridge.product_category
        where product_category_id = p_product_category_id
     )
    union
    select parent.product_category_id, parent.parent_product_category_id
      from fridge.product_category parent
      join ancestors a
        on parent.product_category_id = a.parent_product_category_id
  )
  select exists (
    select 1
      from ancestors
     where product_category_id = p_product_category_id
  ) into v_cycle;

  if v_cycle then
    raise exception using
      errcode = '23514',
      message = 'ProductCategory hierarchy must remain acyclic';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_product_category_acyclic(uuid) from public;

create or replace function fridge_internal.guard_product_category_acyclic()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'DELETE' then
    perform fridge_internal.assert_product_category_acyclic(new.product_category_id);
  end if;
  return null;
end;
$$;

revoke all on function fridge_internal.guard_product_category_acyclic() from public;

create constraint trigger product_category_acyclic_guard
after insert or update of parent_product_category_id on fridge.product_category
deferrable initially deferred
for each row execute function fridge_internal.guard_product_category_acyclic();

commit;
