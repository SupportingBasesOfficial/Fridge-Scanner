-- FridgeScanner BE-02
-- 000032__external_identity_mapping.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Materializes B2-004/B2-017: a verified external identity crosses an explicit,
-- platform-owned mapping relation before it can become a PrincipalId.

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

-- At most one current mapping may exist for an authority/subject pair. Historical
-- revoked links are retained without ever becoming current authority again unless
-- a new, explicitly governed link is created.
create unique index external_identity_link_one_current_subject_uq
  on fridge.external_identity_link (authority, subject)
  where revoked_at is null;

create index external_identity_link_user_idx
  on fridge.external_identity_link (user_id)
  where revoked_at is null;

-- Mapping is needed before Household context exists. It is therefore a global
-- authentication-side lookup, but only the API capability receives read access.
revoke all on table fridge.external_identity_link from public;
grant select on table fridge.external_identity_link to fridge_app;

commit;
