-- FridgeScanner BE-02 integrity checks for 000032__external_identity_mapping.sql

begin;

insert into fridge.user_profile (user_id, display_name)
values
  ('f8000000-0000-4000-8000-000000000001', 'External identity principal A'),
  ('f8000000-0000-4000-8000-000000000002', 'External identity principal B');

insert into fridge.external_identity_link (
  external_identity_link_id,
  authority,
  subject,
  user_id,
  linked_at
) values
  (
    'f8100000-0000-4000-8000-000000000001',
    'https://issuer-a.example.test',
    'shared-subject',
    'f8000000-0000-4000-8000-000000000001',
    '2026-01-01T00:00:00Z'
  ),
  (
    'f8100000-0000-4000-8000-000000000002',
    'https://issuer-b.example.test',
    'shared-subject',
    'f8000000-0000-4000-8000-000000000002',
    '2026-01-01T00:00:00Z'
  );

-- Equal subjects under different authorities are distinct namespaces.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from fridge.external_identity_link
   where subject = 'shared-subject'
     and revoked_at is null;
  if v_count <> 2 then
    raise exception 'authority namespace separation was not preserved';
  end if;
end;
$$;

-- A current authority/subject pair can resolve to only one principal.
do $$
begin
  begin
    insert into fridge.external_identity_link (
      external_identity_link_id,
      authority,
      subject,
      user_id
    ) values (
      'f8100000-0000-4000-8000-000000000003',
      'https://issuer-a.example.test',
      'shared-subject',
      'f8000000-0000-4000-8000-000000000002'
    );
    raise exception 'duplicate current external identity mapping unexpectedly accepted';
  exception when unique_violation then null;
  end;
end;
$$;

-- Provider input is stored exactly; surrounding-whitespace confusion is rejected.
do $$
begin
  begin
    insert into fridge.external_identity_link (
      external_identity_link_id,
      authority,
      subject,
      user_id
    ) values (
      'f8100000-0000-4000-8000-000000000004',
      ' https://issuer-a.example.test',
      'subject',
      'f8000000-0000-4000-8000-000000000001'
    );
    raise exception 'non-canonical authority unexpectedly accepted';
  exception when check_violation then null;
  end;

  begin
    insert into fridge.external_identity_link (
      external_identity_link_id,
      authority,
      subject,
      user_id
    ) values (
      'f8100000-0000-4000-8000-000000000005',
      'https://issuer-a.example.test',
      'subject ',
      'f8000000-0000-4000-8000-000000000001'
    );
    raise exception 'non-canonical subject unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Mapping is least-privilege global auth data: app may read, not mutate;
-- worker/readonly capabilities do not receive it by implication.
do $$
begin
  if not has_table_privilege('fridge_app', 'fridge.external_identity_link', 'SELECT') then
    raise exception 'fridge_app lacks required external identity mapping SELECT';
  end if;
  if has_table_privilege('fridge_app', 'fridge.external_identity_link', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.external_identity_link', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.external_identity_link', 'DELETE') then
    raise exception 'fridge_app received forbidden direct mapping mutation privilege';
  end if;
  if has_table_privilege('fridge_worker', 'fridge.external_identity_link', 'SELECT')
     or has_table_privilege('fridge_readonly', 'fridge.external_identity_link', 'SELECT') then
    raise exception 'external identity mapping leaked to unrelated runtime capabilities';
  end if;
end;
$$;

rollback;
