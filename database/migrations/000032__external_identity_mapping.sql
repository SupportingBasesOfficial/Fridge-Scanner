-- FridgeScanner BE-02
-- 000032__external_identity_mapping.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Materializes B2-004/B2-017/B2-018: a verified external identity crosses an
-- explicit platform-owned, intent-specific mapping boundary before it can become
-- a PrincipalId.

begin;

create table fridge.external_identity_link (
  external_identity_link_id uuid primary key,
  authority text not null,
  subject text not null,
  user_id uuid not null,
  linked_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  constraint external_identity_link_authority_nonblank
    check (btrim(authority) <> ''),
  constraint external_identity_link_authority_exact
    check (authority = btrim(authority)),
  constraint external_identity_link_authority_bounded
    check (char_length(authority) <= 512),
  constraint external_identity_link_subject_nonblank
    check (btrim(subject) <> ''),
  constraint external_identity_link_subject_exact
    check (subject = btrim(subject)),
  constraint external_identity_link_subject_bounded
    check (char_length(subject) <= 1024),
  constraint external_identity_link_revoked_after_linked
    check (revoked_at is null or revoked_at >= linked_at),
  constraint external_identity_link_user_fk
    foreign key (user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict
);

comment on table fridge.external_identity_link is
  'Platform-owned mapping from a verified external authority namespace plus subject to one platform PrincipalId. The relation contains no provider credential and grants no Household authority.';

create unique index external_identity_link_one_current_subject_uq
  on fridge.external_identity_link (authority, subject)
  where revoked_at is null;

create index external_identity_link_user_idx
  on fridge.external_identity_link (user_id)
  where revoked_at is null;

-- Runtime code must not enumerate the global mapping relation. The only runtime
-- capability is exact identity resolution through the function below.
revoke all on table fridge.external_identity_link from public;
revoke all on table fridge.external_identity_link
  from fridge_app, fridge_worker, fridge_readonly;

create or replace function fridge_internal.resolve_external_identity_principal(
  p_authority text,
  p_subject text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_ids uuid[];
begin
  if p_authority is null or p_subject is null then
    return null;
  end if;

  select array_agg(link.user_id order by link.external_identity_link_id)
    into v_user_ids
    from fridge.external_identity_link as link
   where link.authority = p_authority
     and link.subject = p_subject
     and link.revoked_at is null;

  if coalesce(cardinality(v_user_ids), 0) <> 1 then
    return null;
  end if;

  return v_user_ids[1];
end;
$$;

comment on function fridge_internal.resolve_external_identity_principal(text, text) is
  'Intent-specific exact lookup from verified external authority+subject to one current platform PrincipalId. Missing or ambiguous mappings return null; callers cannot enumerate mapping rows.';

revoke all on function fridge_internal.resolve_external_identity_principal(text, text)
  from public;
grant execute on function fridge_internal.resolve_external_identity_principal(text, text)
  to fridge_app;

commit;
