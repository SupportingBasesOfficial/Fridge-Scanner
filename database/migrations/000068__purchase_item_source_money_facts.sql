-- FridgeScanner BE-06
-- 000068__purchase_item_source_money_facts.sql
-- Governed append-only commitment of source monetary facts for one PurchaseItem.

begin;

alter table fridge.household_procurement_command_registry
  drop constraint household_procurement_command_registry_intent_ck,
  add constraint household_procurement_command_registry_intent_ck
    check (intent_code in (
      'CREATE_PURCHASE',
      'COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS'
    ));

-- One canonical source fact per semantic role per PurchaseItem. Corrections do
-- not overwrite/redeclare the source fact; they use discrepancy/correction
-- evidence in later governed workflows.
create unique index purchase_item_source_money_role_uq
  on fridge.purchase_item_money_fact (
    household_id,
    purchase_item_id,
    semantic_role
  )
  where is_source_fact;

create or replace function fridge_internal.guard_purchase_item_money_fact_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'committed PurchaseItem money facts are immutable';
end;
$$;

revoke all on function fridge_internal.guard_purchase_item_money_fact_immutable()
  from public, fridge_app, fridge_worker, fridge_readonly;

drop trigger if exists purchase_item_money_fact_immutable
  on fridge.purchase_item_money_fact;
create trigger purchase_item_money_fact_immutable
before update or delete on fridge.purchase_item_money_fact
for each row execute function fridge_internal.guard_purchase_item_money_fact_immutable();

create table fridge.household_purchase_item_source_money_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  purchase_id uuid not null,
  purchase_item_id uuid not null,
  semantic_facts jsonb not null,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_purchase_item_source_money_command_pk
    primary key (household_id, command_id),
  constraint household_purchase_item_source_money_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_source_money_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_source_money_command_item_fk
    foreign key (household_id, purchase_id, purchase_item_id)
    references fridge.purchase_item (household_id, purchase_id, purchase_item_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_source_money_command_facts_ck
    check (jsonb_typeof(semantic_facts) = 'array' and jsonb_array_length(semantic_facts) between 1 and 5),
  constraint household_purchase_item_source_money_command_outcome_ck
    check (outcome_code in ('PENDING', 'COMMITTED'))
);

comment on table fridge.household_purchase_item_source_money_command is
  'Durable BE-06 idempotency identity for committing source monetary facts of one PurchaseItem. Semantic equality binds actor, Purchase/PurchaseItem and canonical role/amount/provenance facts while generated fact IDs are result-only.';

create table fridge.household_purchase_item_source_money_command_result (
  household_id uuid not null,
  command_id uuid not null,
  line_no integer not null,
  purchase_item_money_fact_id uuid not null,
  constraint household_purchase_item_source_money_command_result_pk
    primary key (household_id, command_id, line_no),
  constraint household_purchase_item_source_money_command_result_command_fk
    foreign key (household_id, command_id)
    references fridge.household_purchase_item_source_money_command (household_id, command_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_source_money_command_result_fact_fk
    foreign key (household_id, purchase_item_money_fact_id)
    references fridge.purchase_item_money_fact (household_id, purchase_item_money_fact_id)
    on update restrict on delete restrict,
  constraint household_purchase_item_source_money_command_result_line_ck
    check (line_no > 0),
  constraint household_purchase_item_source_money_command_result_fact_uq
    unique (household_id, command_id, purchase_item_money_fact_id)
);

create or replace function fridge_internal.commit_purchase_item_source_money_facts(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_purchase_id uuid,
  p_purchase_item_id uuid,
  p_facts jsonb
)
returns table (
  outcome_code text,
  line_no integer,
  result_purchase_item_money_fact_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_element jsonb;
  v_ordinality bigint;
  v_candidate_fact_id uuid;
  v_candidate_fact_ids uuid[] := array[]::uuid[];
  v_role text;
  v_roles text[] := array[]::text[];
  v_amount numeric;
  v_amount_text text;
  v_provenance text;
  v_semantic_facts jsonb := '[]'::jsonb;
  v_existing_actor_user_id uuid;
  v_existing_purchase_id uuid;
  v_existing_purchase_item_id uuid;
  v_existing_semantic_facts jsonb;
  v_existing_outcome_code text;
  v_purchase_currency text;
  v_item_locked uuid;
  v_inserted_command_id uuid;
  v_committed_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::integer, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_procurement_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::integer, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS'
  );

  if p_facts is null
     or jsonb_typeof(p_facts) is distinct from 'array'
     or jsonb_array_length(p_facts) < 1
     or jsonb_array_length(p_facts) > 5 then
    return query select 'INVALID_INPUT'::text, null::integer, null::uuid;
    return;
  end if;

  for v_element, v_ordinality in
    select e.value, e.ordinality
      from jsonb_array_elements(p_facts) with ordinality as e(value, ordinality)
     order by e.ordinality
  loop
    if jsonb_typeof(v_element) is distinct from 'object'
       or jsonb_typeof(v_element -> 'candidatePurchaseItemMoneyFactId') is distinct from 'string'
       or jsonb_typeof(v_element -> 'semanticRole') is distinct from 'string'
       or jsonb_typeof(v_element -> 'amount') is distinct from 'string'
       or jsonb_typeof(v_element -> 'provenance') is distinct from 'string' then
      return query select 'INVALID_INPUT'::text, null::integer, null::uuid;
      return;
    end if;

    begin
      v_candidate_fact_id := (v_element ->> 'candidatePurchaseItemMoneyFactId')::uuid;
      v_amount := (v_element ->> 'amount')::numeric;
    exception
      when sqlstate '22P02' or sqlstate '22003' or sqlstate '22023' then
        return query select 'INVALID_INPUT'::text, null::integer, null::uuid;
        return;
    end;

    v_role := v_element ->> 'semanticRole';
    v_provenance := btrim(v_element ->> 'provenance');

    if v_candidate_fact_id is null
       or v_candidate_fact_id = any(v_candidate_fact_ids)
       or v_role not in ('LINE_GROSS', 'LINE_DISCOUNT', 'LINE_TAX', 'LINE_CHARGE', 'LINE_NET')
       or v_role = any(v_roles)
       or v_provenance is null
       or v_provenance = ''
       or v_amount is null
       or v_amount::text in ('NaN', 'Infinity', '-Infinity') then
      return query select 'INVALID_INPUT'::text, null::integer, null::uuid;
      return;
    end if;

    v_amount_text := trim_scale(v_amount)::text;
    v_candidate_fact_ids := array_append(v_candidate_fact_ids, v_candidate_fact_id);
    v_roles := array_append(v_roles, v_role);
    v_semantic_facts := v_semantic_facts || jsonb_build_array(
      jsonb_build_object(
        'semanticRole', v_role,
        'amount', v_amount_text,
        'provenance', v_provenance
      )
    );
  end loop;

  -- Committed replay is resolved after current authority but before target-state checks.
  select c.actor_user_id,
         c.purchase_id,
         c.purchase_item_id,
         c.semantic_facts,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_purchase_id,
         v_existing_purchase_item_id,
         v_existing_semantic_facts,
         v_existing_outcome_code
    from fridge.household_purchase_item_source_money_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_semantic_facts is distinct from v_semantic_facts then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::integer, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'COMMITTED' then
      return query
      select 'COMMITTED'::text, r.line_no, r.purchase_item_money_fact_id
        from fridge.household_purchase_item_source_money_command_result r
       where r.household_id = p_household_id
         and r.command_id = p_command_id
       order by r.line_no;
      return;
    end if;

    raise exception 'unexpected pending PurchaseItem source money command';
  end if;

  -- Canonical aggregate lock order: Purchase before PurchaseItem.
  select p.transaction_currency_code
    into v_purchase_currency
    from fridge.purchase p
   where p.household_id = p_household_id
     and p.purchase_id = p_purchase_id
   for key share;

  if v_purchase_currency is null then
    return query select 'NOT_FOUND'::text, null::integer, null::uuid;
    return;
  end if;

  select pi.purchase_item_id
    into v_item_locked
    from fridge.purchase_item pi
   where pi.household_id = p_household_id
     and pi.purchase_id = p_purchase_id
     and pi.purchase_item_id = p_purchase_item_id
   for update;

  if v_item_locked is null then
    return query select 'NOT_FOUND'::text, null::integer, null::uuid;
    return;
  end if;

  -- A concurrent same-command execution targeting this item may have committed
  -- while this transaction waited on the PurchaseItem lock.
  select c.actor_user_id,
         c.purchase_id,
         c.purchase_item_id,
         c.semantic_facts,
         c.outcome_code
    into v_existing_actor_user_id,
         v_existing_purchase_id,
         v_existing_purchase_item_id,
         v_existing_semantic_facts,
         v_existing_outcome_code
    from fridge.household_purchase_item_source_money_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_semantic_facts is distinct from v_semantic_facts then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::integer, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'COMMITTED' then
      return query
      select 'COMMITTED'::text, r.line_no, r.purchase_item_money_fact_id
        from fridge.household_purchase_item_source_money_command_result r
       where r.household_id = p_household_id
         and r.command_id = p_command_id
       order by r.line_no;
      return;
    end if;
  end if;

  if exists (
    select 1
      from fridge.purchase_item_money_fact mf
     where mf.household_id = p_household_id
       and mf.purchase_item_id = p_purchase_item_id
       and mf.is_source_fact
       and mf.semantic_role = any(v_roles)
  ) then
    return query select 'CONFLICT'::text, null::integer, null::uuid;
    return;
  end if;

  -- Command-row insertion is the same-intent first-use serializer even when
  -- two requests target different PurchaseItems with one CommandId.
  insert into fridge.household_purchase_item_source_money_command (
    household_id,
    command_id,
    actor_user_id,
    purchase_id,
    purchase_item_id,
    semantic_facts,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_purchase_id,
    p_purchase_item_id,
    v_semantic_facts,
    'PENDING'
  )
  on conflict (household_id, command_id) do nothing
  returning command_id into v_inserted_command_id;

  if v_inserted_command_id is null then
    select c.actor_user_id,
           c.purchase_id,
           c.purchase_item_id,
           c.semantic_facts,
           c.outcome_code
      into v_existing_actor_user_id,
           v_existing_purchase_id,
           v_existing_purchase_item_id,
           v_existing_semantic_facts,
           v_existing_outcome_code
      from fridge.household_purchase_item_source_money_command c
     where c.household_id = p_household_id
       and c.command_id = p_command_id
     for update;

    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_semantic_facts is distinct from v_semantic_facts then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::integer, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'COMMITTED' then
      return query
      select 'COMMITTED'::text, r.line_no, r.purchase_item_money_fact_id
        from fridge.household_purchase_item_source_money_command_result r
       where r.household_id = p_household_id
         and r.command_id = p_command_id
       order by r.line_no;
      return;
    end if;

    raise exception 'unexpected pending PurchaseItem source money command after first-use serialization';
  end if;

  -- Cross-intent reservation occurs only after the target is valid and this
  -- command row has been acquired; a losing cross-intent transaction rolls back.
  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS'
  );

  v_committed_at := clock_timestamp();

  for v_element, v_ordinality in
    select e.value, e.ordinality
      from jsonb_array_elements(p_facts) with ordinality as e(value, ordinality)
     order by e.ordinality
  loop
    v_candidate_fact_id := (v_element ->> 'candidatePurchaseItemMoneyFactId')::uuid;
    v_role := v_element ->> 'semanticRole';
    v_amount := (v_element ->> 'amount')::numeric;
    v_provenance := btrim(v_element ->> 'provenance');

    insert into fridge.purchase_item_money_fact (
      purchase_item_money_fact_id,
      household_id,
      purchase_id,
      purchase_item_id,
      semantic_role,
      amount,
      currency_code,
      is_source_fact,
      money_rounding_policy_id,
      provenance,
      recorded_at
    ) values (
      v_candidate_fact_id,
      p_household_id,
      p_purchase_id,
      p_purchase_item_id,
      v_role,
      v_amount,
      v_purchase_currency,
      true,
      null,
      v_provenance,
      v_committed_at
    );

    insert into fridge.household_purchase_item_source_money_command_result (
      household_id,
      command_id,
      line_no,
      purchase_item_money_fact_id
    ) values (
      p_household_id,
      p_command_id,
      v_ordinality::integer,
      v_candidate_fact_id
    );
  end loop;

  update fridge.household_purchase_item_source_money_command
     set outcome_code = 'COMMITTED',
         recorded_at = v_committed_at
   where household_id = p_household_id
     and command_id = p_command_id;

  return query
  select 'COMMITTED'::text, r.line_no, r.purchase_item_money_fact_id
    from fridge.household_purchase_item_source_money_command_result r
   where r.household_id = p_household_id
     and r.command_id = p_command_id
   order by r.line_no;
end;
$$;

comment on function fridge_internal.commit_purchase_item_source_money_facts(uuid, uuid, uuid, uuid, uuid, uuid, jsonb) is
  'Least-privileged BE-06 boundary for append-only source monetary facts in the Purchase transaction currency. It revalidates procurement authority, supports committed replay, serializes Purchase then PurchaseItem, rejects redeclaration of an existing source role and performs no basis-price derivation or rounding.';

revoke all on function fridge_internal.commit_purchase_item_source_money_facts(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) from public, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.commit_purchase_item_source_money_facts(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) to fridge_app;

commit;
