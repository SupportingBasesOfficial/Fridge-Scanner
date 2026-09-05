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

-- Function semantics are exact and provider namespace aware.
do $$
declare
  v_a uuid;
  v_b uuid;
  v_missing uuid;
begin
  select fridge_internal.resolve_external_identity_principal(
    'https://issuer-a.example.test', 'shared-subject'
  ) into v_a;
  select fridge_internal.resolve_external_identity_principal(
    'https://issuer-b.example.test', 'shared-subject'
  ) into v_b;
  select fridge_internal.resolve_external_identity_principal(
    'https://issuer-a.example.test', 'missing-subject'
  ) into v_missing;

  if v_a <> 'f8000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'issuer A resolved the wrong principal';
  end if;
  if v_b <> 'f8000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'issuer B resolved the wrong principal';
  end if;
  if v_missing is not null then
    raise exception 'unknown external identity unexpectedly resolved';
  end if;
end;
$$;

-- Runtime receives an intent-specific EXECUTE capability, not global table read.
do $$
begin
  if has_table_privilege('fridge_app', 'fridge.external_identity_link', 'SELECT')
     or has_table_privilege('fridge_app', 'fridge.external_identity_link', 'INSERT')
     or has_table_privilege('fridge_app', 'fridge.external_identity_link', 'UPDATE')
     or has_table_privilege('fridge_app', 'fridge.external_identity_link', 'DELETE') then
    raise exception 'fridge_app received forbidden direct external identity table privilege';
  end if;

  if not has_function_privilege(
    'fridge_app',
    'fridge_internal.resolve_external_identity_principal(text,text)',
    'EXECUTE'
  ) then
    raise exception 'fridge_app lacks required exact identity resolution EXECUTE';
  end if;

  if has_function_privilege(
       'fridge_worker',
       'fridge_internal.resolve_external_identity_principal(text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'fridge_readonly',
       'fridge_internal.resolve_external_identity_principal(text,text)',
       'EXECUTE'
     ) then
    raise exception 'external identity resolution leaked to unrelated runtime capabilities';
  end if;
end;
$$;

rollback;
