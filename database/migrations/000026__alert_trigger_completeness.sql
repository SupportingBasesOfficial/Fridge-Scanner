-- FridgeScanner DB-02
-- 000026__alert_trigger_completeness.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Primariness is typed as a boolean instead of inventing a magic subject_role
-- string. Every committed Alert must retain at least one trigger subject and at
-- least one of those subjects must be explicitly primary.

begin;

alter table fridge.alert_trigger_subject
  add column is_primary boolean not null default false;

comment on column fridge.alert_trigger_subject.is_primary is
  'Typed explainability marker. Avoids interpreting a free-form subject_role string as the canonical primary-trigger taxonomy.';

create or replace function fridge_internal.assert_alert_trigger_completeness(
  p_household_id uuid,
  p_alert_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_alert_id uuid;
  v_total integer;
  v_primary integer;
begin
  select alert_id
    into v_alert_id
    from fridge.alert
   where household_id = p_household_id
     and alert_id = p_alert_id
   for update;

  if not found then
    return;
  end if;

  select count(*), count(*) filter (where is_primary)
    into v_total, v_primary
    from fridge.alert_trigger_subject
   where household_id = p_household_id
     and alert_id = p_alert_id;

  if v_total = 0 then
    raise exception using
      errcode = '23514',
      message = 'committed Alert requires at least one typed trigger subject';
  end if;

  if v_primary = 0 then
    raise exception using
      errcode = '23514',
      message = 'committed Alert requires at least one explicitly primary trigger subject';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_alert_trigger_completeness(uuid,uuid) from public;

create or replace function fridge_internal.guard_alert_parent_completeness()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'DELETE' then
    perform fridge_internal.assert_alert_trigger_completeness(new.household_id, new.alert_id);
  end if;
  return null;
end;
$$;

create or replace function fridge_internal.guard_alert_trigger_subject_completeness()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_op <> 'INSERT' then
    perform fridge_internal.assert_alert_trigger_completeness(old.household_id, old.alert_id);
  end if;

  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old.household_id is distinct from new.household_id
    or old.alert_id is distinct from new.alert_id
  ) then
    perform fridge_internal.assert_alert_trigger_completeness(new.household_id, new.alert_id);
  end if;

  return null;
end;
$$;

revoke all on function fridge_internal.guard_alert_parent_completeness() from public;
revoke all on function fridge_internal.guard_alert_trigger_subject_completeness() from public;

create constraint trigger alert_parent_trigger_completeness_ct
  after insert or update
  on fridge.alert
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_alert_parent_completeness();

create constraint trigger alert_trigger_subject_completeness_ct
  after insert or update or delete
  on fridge.alert_trigger_subject
  deferrable initially deferred
  for each row
  execute function fridge_internal.guard_alert_trigger_subject_completeness();

commit;
