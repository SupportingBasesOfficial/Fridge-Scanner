-- FridgeScanner BE-02 integrity checks for the exact external identity lookup surface.

begin;

do $$
begin
  if fridge_internal.resolve_external_identity_principal(
       ' https://issuer.example.test',
       'subject'
     ) is not null then
    raise exception 'lookup normalized leading authority whitespace';
  end if;

  if fridge_internal.resolve_external_identity_principal(
       'https://issuer.example.test',
       'subject '
     ) is not null then
    raise exception 'lookup normalized trailing subject whitespace';
  end if;

  if fridge_internal.resolve_external_identity_principal(
       repeat('a', 513),
       'subject'
     ) is not null then
    raise exception 'lookup accepted overlong authority';
  end if;

  if fridge_internal.resolve_external_identity_principal(
       'authority',
       repeat('s', 1025)
     ) is not null then
    raise exception 'lookup accepted overlong subject';
  end if;
end;
$$;

rollback;
