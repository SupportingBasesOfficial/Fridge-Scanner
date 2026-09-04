-- FridgeScanner DB-02 RLS tests
-- Requires migrations through 000019 applied by a bootstrap/superuser test identity.

begin;

-- Seed authoritative fixtures as the privileged test identity.
insert into fridge.household (household_id, display_name)
values
  ('17000000-0000-0000-0000-000000000001', 'RLS Household A'),
  ('17000000-0000-0000-0000-000000000002', 'RLS Household B');

insert into fridge.storage_location_kind (kind_code, display_name)
values ('RLS_FRIDGE', 'RLS fridge kind');

insert into fridge.storage_location (
  storage_location_id,
  household_id,
  kind_code,
  display_name
) values
  ('17100000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', 'RLS_FRIDGE', 'A fridge'),
  ('17100000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000002', 'RLS_FRIDGE', 'B fridge');

insert into fridge.product (
  product_id,
  catalog_scope,
  owner_household_id,
  canonical_name
) values
  ('17200000-0000-0000-0000-000000000001', 'GLOBAL', null, 'Global product'),
  ('17200000-0000-0000-0000-000000000002', 'HOUSEHOLD', '17000000-0000-0000-0000-000000000001', 'Private A'),
  ('17200000-0000-0000-0000-000000000003', 'HOUSEHOLD', '17000000-0000-0000-0000-000000000002', 'Private B');

set local role fridge_app;

-- Missing context must fail closed rather than expose all tenant rows.
do $$
begin
  if (select count(*) from fridge.storage_location) <> 0 then
    raise exception 'RLS failure: missing Household context exposed storage rows';
  end if;

  if (select count(*) from fridge.household) <> 0 then
    raise exception 'RLS failure: missing Household context exposed Household rows';
  end if;
end;
$$;

select set_config('fridge.household_id', '17000000-0000-0000-0000-000000000001', true);

do $$
begin
  if (select count(*) from fridge.storage_location) <> 1 then
    raise exception 'RLS failure: Household A must see exactly its own storage row';
  end if;

  if exists (
    select 1 from fridge.storage_location
    where household_id = '17000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'RLS failure: Household A saw Household B storage';
  end if;

  if (select count(*) from fridge.product) <> 2 then
    raise exception 'catalog RLS failure: Household A must see GLOBAL + private A only';
  end if;

  if not exists (
    select 1 from fridge.product
    where product_id = '17200000-0000-0000-0000-000000000001'
  ) then
    raise exception 'catalog RLS failure: GLOBAL product must remain tenant-readable';
  end if;

  if exists (
    select 1 from fridge.product
    where product_id = '17200000-0000-0000-0000-000000000003'
  ) then
    raise exception 'catalog RLS failure: Household A saw Household B private product';
  end if;
end;
$$;

-- Direct DML is denied even when the row would match RLS.
do $$
begin
  begin
    insert into fridge.storage_location (
      storage_location_id,
      household_id,
      kind_code,
      display_name
    ) values (
      '17100000-0000-0000-0000-000000000099',
      '17000000-0000-0000-0000-000000000001',
      'RLS_FRIDGE',
      'must not insert directly'
    );
    raise exception 'privilege failure: fridge_app performed direct table DML';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

-- The hardened function accepts only the active Household context.
do $$
declare
  v_result fridge_internal.idempotency_acquire_result;
begin
  select * into v_result
  from fridge_internal.acquire_idempotency(
    '17300000-0000-0000-0000-000000000001',
    'HOUSEHOLD',
    '17000000-0000-0000-0000-000000000001',
    'rls-test-principal',
    'RLS_TEST',
    '1',
    'same-household',
    'fingerprint-a',
    'STARTED',
    null
  );

  if not v_result.is_executor or not v_result.fingerprint_matches then
    raise exception 'idempotency boundary failure: first same-Household caller must be executor';
  end if;

  begin
    perform fridge_internal.acquire_idempotency(
      '17300000-0000-0000-0000-000000000002',
      'HOUSEHOLD',
      '17000000-0000-0000-0000-000000000002',
      'rls-test-principal',
      'RLS_TEST',
      '1',
      'wrong-household',
      'fingerprint-b',
      'STARTED',
      null
    );
    raise exception 'idempotency boundary failure: cross-Household acquisition succeeded';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform fridge_internal.acquire_idempotency(
      '17300000-0000-0000-0000-000000000003',
      'GLOBAL',
      null,
      'rls-test-principal',
      'RLS_TEST',
      '1',
      'global-forbidden',
      'fingerprint-c',
      'STARTED',
      null
    );
    raise exception 'idempotency boundary failure: fridge_app acquired GLOBAL idempotency';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

-- Switching trusted transaction context changes the visible tenant, never merges it.
select set_config('fridge.household_id', '17000000-0000-0000-0000-000000000002', true);

do $$
begin
  if (select count(*) from fridge.storage_location) <> 1 then
    raise exception 'RLS failure: Household B must see exactly its own storage row';
  end if;

  if exists (
    select 1 from fridge.storage_location
    where household_id = '17000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'RLS failure: Household B saw Household A storage';
  end if;
end;
$$;

-- Invalid context is deliberately interpreted as no trusted context.
select set_config('fridge.household_id', 'not-a-uuid', true);

do $$
begin
  if fridge_internal.current_household_id() is not null then
    raise exception 'context helper failure: invalid UUID context did not fail closed';
  end if;

  if (select count(*) from fridge.storage_location) <> 0 then
    raise exception 'RLS failure: invalid context exposed tenant rows';
  end if;
end;
$$;

reset role;

-- Readonly can evaluate RLS but has no mutation-boundary EXECUTE privilege.
set local role fridge_readonly;
select set_config('fridge.household_id', '17000000-0000-0000-0000-000000000001', true);

do $$
begin
  begin
    perform fridge_internal.acquire_idempotency(
      '17300000-0000-0000-0000-000000000004',
      'HOUSEHOLD',
      '17000000-0000-0000-0000-000000000001',
      'readonly-principal',
      'RLS_TEST',
      '1',
      'readonly-forbidden',
      'fingerprint-d',
      'STARTED',
      null
    );
    raise exception 'privilege failure: fridge_readonly executed mutation boundary';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;
rollback;
