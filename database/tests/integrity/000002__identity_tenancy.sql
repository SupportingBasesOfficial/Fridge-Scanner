-- FridgeScanner DB-02 integrity checks for 000002__identity_tenancy.sql

begin;

insert into fridge.household_role (
  role_code,
  display_name,
  description,
  is_assignable,
  lifecycle_status
) values (
  'TEST_ROLE',
  'Test role',
  'Test-only governed role fixture.',
  true,
  'ACTIVE'
);

insert into fridge.user_profile (user_id, display_name)
values
  ('00000000-0000-4000-8000-000000000001', 'User One'),
  ('00000000-0000-4000-8000-000000000002', 'User Two');

insert into fridge.household (household_id, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'Household A'),
  ('10000000-0000-4000-8000-000000000002', 'Household B');

insert into fridge.household_timezone_version (
  household_timezone_version_id,
  household_id,
  version_no,
  iana_timezone,
  effective_from
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    1,
    'America/Sao_Paulo',
    '2026-01-01T00:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    1,
    'UTC',
    '2026-01-01T00:00:00Z'
  );

-- Same-Household current timezone pointer succeeds.
update fridge.household
set current_timezone_version_id = '20000000-0000-4000-8000-000000000001'
where household_id = '10000000-0000-4000-8000-000000000001';

-- Cross-Household current timezone pointer must fail.
do $$
begin
  begin
    update fridge.household
    set current_timezone_version_id = '20000000-0000-4000-8000-000000000002'
    where household_id = '10000000-0000-4000-8000-000000000001';

    raise exception 'cross-Household timezone pointer unexpectedly accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

insert into fridge.household_membership (
  membership_id,
  household_id,
  user_id,
  role_code,
  lifecycle_status,
  effective_from
) values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'TEST_ROLE',
  'ACTIVE',
  '2026-01-01T00:00:00Z'
);

-- A second open membership for the same Household/User must fail regardless of status label.
do $$
begin
  begin
    insert into fridge.household_membership (
      membership_id,
      household_id,
      user_id,
      role_code,
      lifecycle_status,
      effective_from
    ) values (
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      'TEST_ROLE',
      'SUSPENDED_BUT_OPEN',
      '2026-02-01T00:00:00Z'
    );

    raise exception 'duplicate open membership unexpectedly accepted';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

-- Closing the previous interval permits a new current membership.
update fridge.household_membership
set effective_to = '2026-02-01T00:00:00Z'
where membership_id = '30000000-0000-4000-8000-000000000001';

insert into fridge.household_membership (
  membership_id,
  household_id,
  user_id,
  role_code,
  lifecycle_status,
  effective_from
) values (
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'TEST_ROLE',
  'CURRENT',
  '2026-02-01T00:00:00Z'
);

-- The same user may have an independent current membership in another Household.
insert into fridge.household_membership (
  membership_id,
  household_id,
  user_id,
  role_code,
  lifecycle_status,
  effective_from
) values (
  '30000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'TEST_ROLE',
  'CURRENT',
  '2026-01-01T00:00:00Z'
);

-- Invalid intervals are rejected.
do $$
begin
  begin
    insert into fridge.household_membership (
      membership_id,
      household_id,
      user_id,
      role_code,
      lifecycle_status,
      effective_from,
      effective_to
    ) values (
      '30000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      'TEST_ROLE',
      'CLOSED',
      '2026-03-01T00:00:00Z',
      '2026-02-01T00:00:00Z'
    );

    raise exception 'invalid membership interval unexpectedly accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

rollback;
