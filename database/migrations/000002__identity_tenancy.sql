-- FridgeScanner DB-02
-- 000002__identity_tenancy.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create table fridge.user_profile (
  user_id uuid primary key,
  display_name text,
  lifecycle_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  constraint user_profile_lifecycle_status_nonblank
    check (btrim(lifecycle_status) <> ''),
  constraint user_profile_retired_after_created
    check (retired_at is null or retired_at >= created_at)
);

comment on table fridge.user_profile is
  'Food-domain user profile only. Authentication credentials and global Household roles are deliberately absent.';

create table fridge.household (
  household_id uuid primary key,
  display_name text not null,
  lifecycle_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  current_timezone_version_id uuid,
  constraint household_display_name_nonblank
    check (btrim(display_name) <> ''),
  constraint household_lifecycle_status_nonblank
    check (btrim(lifecycle_status) <> ''),
  constraint household_retired_after_created
    check (retired_at is null or retired_at >= created_at),
  constraint household_identity_household_uq
    unique (household_id, household_id)
);

comment on table fridge.household is
  'Primary operational/authorization boundary. current_timezone_version_id is a convenience pointer, never historical timezone truth.';

create table fridge.household_role (
  role_code text primary key,
  display_name text not null,
  description text,
  is_assignable boolean not null default true,
  lifecycle_status text not null default 'ACTIVE',
  constraint household_role_code_nonblank check (btrim(role_code) <> ''),
  constraint household_role_display_name_nonblank check (btrim(display_name) <> ''),
  constraint household_role_status_nonblank check (btrim(lifecycle_status) <> '')
);

comment on table fridge.household_role is
  'Governed Household-scoped authority role reference. Role meaning is not stored globally on user_profile.';

create table fridge.household_timezone_version (
  household_timezone_version_id uuid primary key,
  household_id uuid not null,
  version_no integer not null,
  iana_timezone text not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  reason text,
  provenance text,
  actor_user_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_timezone_version_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_timezone_version_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_timezone_version_version_positive
    check (version_no > 0),
  constraint household_timezone_version_name_nonblank
    check (btrim(iana_timezone) <> ''),
  constraint household_timezone_version_interval_valid
    check (effective_to is null or effective_to > effective_from),
  constraint household_timezone_version_household_version_uq
    unique (household_id, version_no),
  constraint household_timezone_version_household_identity_uq
    unique (household_id, household_timezone_version_id)
);

comment on table fridge.household_timezone_version is
  'Versioned historical Household timezone fact. Non-overlap per Household is enforced by the governed mutation boundary without requiring btree_gist.';

alter table fridge.household
  add constraint household_current_timezone_same_household_fk
  foreign key (household_id, current_timezone_version_id)
  references fridge.household_timezone_version (household_id, household_timezone_version_id)
  deferrable initially immediate;

create index household_timezone_version_anchor_idx
  on fridge.household_timezone_version (household_id, effective_from desc);

create table fridge.household_membership (
  membership_id uuid primary key,
  household_id uuid not null,
  user_id uuid not null,
  role_code text not null,
  lifecycle_status text not null default 'ACTIVE',
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by_user_id uuid,
  constraint household_membership_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_membership_user_fk
    foreign key (user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_membership_role_fk
    foreign key (role_code)
    references fridge.household_role (role_code)
    on update restrict on delete restrict,
  constraint household_membership_creator_fk
    foreign key (created_by_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_membership_status_nonblank
    check (btrim(lifecycle_status) <> ''),
  constraint household_membership_interval_valid
    check (effective_to is null or effective_to > effective_from),
  constraint household_membership_household_identity_uq
    unique (household_id, membership_id)
);

comment on table fridge.household_membership is
  'Household-scoped user authority and membership lifecycle. No authority is inferred from user_profile alone.';

create unique index household_membership_one_open_membership_uq
  on fridge.household_membership (household_id, user_id)
  where effective_to is null and lifecycle_status = 'ACTIVE';

create index household_membership_user_household_idx
  on fridge.household_membership (user_id, household_id);

create index household_membership_household_status_idx
  on fridge.household_membership (household_id, lifecycle_status, user_id);

-- Canonical baseline roles are governed reference data. These are domain role codes,
-- not PostgreSQL login/capability roles.
insert into fridge.household_role (
  role_code,
  display_name,
  description,
  is_assignable,
  lifecycle_status
) values
  ('OWNER', 'Owner', 'Household owner authority.', true, 'ACTIVE'),
  ('ADMIN', 'Admin', 'Household administrative authority.', true, 'ACTIVE'),
  ('MEMBER', 'Member', 'Ordinary Household operating authority.', true, 'ACTIVE'),
  ('AUDITOR', 'Auditor', 'Household-scoped read/audit authority.', true, 'ACTIVE');

commit;
