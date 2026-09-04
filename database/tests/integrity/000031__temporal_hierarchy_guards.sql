-- FridgeScanner DB-02 integrity checks for 000031__temporal_hierarchy_guards.sql

begin;

insert into fridge.household (household_id, display_name)
values
  ('f7000000-0000-4000-8000-000000000001', 'Temporal household A'),
  ('f7000000-0000-4000-8000-000000000002', 'Temporal household B');

insert into fridge.household_timezone_version (
  household_timezone_version_id, household_id, version_no,
  iana_timezone, effective_from, effective_to
) values
  (
    'f7100000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    1,
    'America/Sao_Paulo',
    '2026-01-01T00:00:00Z',
    '2026-06-01T00:00:00Z'
  ),
  (
    'f7100000-0000-4000-8000-000000000002',
    'f7000000-0000-4000-8000-000000000001',
    2,
    'America/Sao_Paulo',
    '2026-06-01T00:00:00Z',
    null
  );

select fridge_internal.assert_household_timezone_nonoverlap('f7000000-0000-4000-8000-000000000001');

-- Adjacent intervals are allowed; overlap is not.
do $$
begin
  begin
    insert into fridge.household_timezone_version (
      household_timezone_version_id, household_id, version_no,
      iana_timezone, effective_from, effective_to
    ) values (
      'f7100000-0000-4000-8000-000000000003',
      'f7000000-0000-4000-8000-000000000001',
      3,
      'America/Sao_Paulo',
      '2026-05-01T00:00:00Z',
      '2026-07-01T00:00:00Z'
    );
    perform fridge_internal.assert_household_timezone_nonoverlap('f7000000-0000-4000-8000-000000000001');
    raise exception 'overlapping HouseholdTimezoneVersion unexpectedly accepted';
  exception when exclusion_violation then null;
  end;
end;
$$;

-- Another Household has an independent interval domain.
insert into fridge.household_timezone_version (
  household_timezone_version_id, household_id, version_no,
  iana_timezone, effective_from, effective_to
) values (
  'f7100000-0000-4000-8000-000000000004',
  'f7000000-0000-4000-8000-000000000002',
  1,
  'UTC',
  '2026-01-01T00:00:00Z',
  null
);
select fridge_internal.assert_household_timezone_nonoverlap('f7000000-0000-4000-8000-000000000002');

insert into fridge.product_category (
  product_category_id, parent_product_category_id, canonical_name
) values
  ('f7200000-0000-4000-8000-000000000001', null, 'Root category'),
  ('f7200000-0000-4000-8000-000000000002', 'f7200000-0000-4000-8000-000000000001', 'Child category'),
  ('f7200000-0000-4000-8000-000000000003', 'f7200000-0000-4000-8000-000000000002', 'Grandchild category');

select fridge_internal.assert_product_category_acyclic('f7200000-0000-4000-8000-000000000001');
select fridge_internal.assert_product_category_acyclic('f7200000-0000-4000-8000-000000000002');
select fridge_internal.assert_product_category_acyclic('f7200000-0000-4000-8000-000000000003');

-- Reparenting root under its descendant creates a cycle and must fail.
do $$
begin
  begin
    update fridge.product_category
       set parent_product_category_id = 'f7200000-0000-4000-8000-000000000003'
     where product_category_id = 'f7200000-0000-4000-8000-000000000001';
    perform fridge_internal.assert_product_category_acyclic('f7200000-0000-4000-8000-000000000001');
    raise exception 'ProductCategory cycle unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Guard shape is part of the database contract.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from pg_catalog.pg_trigger
   where tgname in ('household_timezone_nonoverlap_guard', 'product_category_acyclic_guard')
     and (tgconstraint = 0 or not tgdeferrable or not tginitdeferred);
  if v_bad <> 0 then
    raise exception 'timezone/category guards are not deferred constraint triggers';
  end if;
end;
$$;

rollback;
