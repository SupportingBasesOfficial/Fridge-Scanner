-- FridgeScanner BE-06
-- 000071__create_receipt.sql
-- Governed, idempotent creation of one Household Receipt without committing ReceiptItem physical truth.

begin;

alter table fridge.household_procurement_command_registry
  drop constraint household_procurement_command_registry_intent_ck,
  add constraint household_procurement_command_registry_intent_ck
    check (intent_code in (
      'CREATE_PURCHASE',
      'COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS',
      'COMMIT_PURCHASE_ITEM_PRICING_BASIS',
      'COMMIT_PURCHASE_ITEM_PRICING_EXTENSION',
      'CREATE_RECEIPT'
    ));

create table fridge.household_receipt_create_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  purchase_id uuid,
  provenance text not null,
  candidate_receipt_id uuid not null,
  result_receipt_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_receipt_create_command_pk
    primary key (household_id, command_id),
  constraint household_receipt_create_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_receipt_create_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_receipt_create_command_purchase_fk
    foreign key (household_id, purchase_id)
    references fridge.purchase (household_id, purchase_id)
    on update restrict on delete restrict,
  constraint household_receipt_create_command_result_fk
    foreign key (household_id, result_receipt_id)
    references fridge.receipt (household_id, receipt_id)
    on update restrict on delete restrict,
  constraint household_receipt_create_command_provenance_ck
    check (btrim(provenance) <> ''),
  constraint household_receipt_create_command_outcome_ck
    check (outcome_code in ('PENDING', 'CREATED')),
  constraint household_receipt_create_command_result_ck
    check (
      (outcome_code = 'PENDING' and result_receipt_id is null)
      or (outcome_code = 'CREATED' and result_receipt_id is not null)
    )
);

comment on table fridge.household_receipt_create_command is
  'Durable BE-06 CreateReceipt command identity. Semantic equality binds actor, optional same-Household Purchase and canonical provenance; server-generated Receipt candidate identity is result-only.';

-- Receipt is already authoritative receiving-occurrence history. Corrections must
-- be modeled as explicit later facts rather than destructive rewriting.
drop trigger if exists receipt_immutable on fridge.receipt;
create trigger receipt_immutable
before update or delete on fridge.receipt
for each row execute function fridge_internal.reject_historical_mutation();

create or replace function fridge_internal.create_household_receipt(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_receipt_id uuid,
  p_purchase_id uuid,
  p_provenance text
)
returns table (
  outcome_code text,
  result_receipt_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_provenance text;
  v_existing_actor_user_id uuid;
  v_existing_purchase_id uuid;
  v_existing_provenance text;
  v_existing_outcome_code text;
  v_existing_result_receipt_id uuid;
  v_purchase_locked uuid;
  v_committed_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_procurement_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_RECEIPT'
  );

  if p_command_id is null
     or p_candidate_receipt_id is null
     or p_provenance is null
     or btrim(p_provenance) = '' then
    return query select 'INVALID_INPUT'::text, null::uuid;
    return;
  end if;

  v_provenance := btrim(p_provenance);

  -- Committed replay resolves before revalidating an optional Purchase. Later
  -- state may not invalidate or recreate an already committed Receipt.
  select c.actor_user_id,
         c.purchase_id,
         c.provenance,
         c.outcome_code,
         c.result_receipt_id
    into v_existing_actor_user_id,
         v_existing_purchase_id,
         v_existing_provenance,
         v_existing_outcome_code,
         v_existing_result_receipt_id
    from fridge.household_receipt_create_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_purchase_id is distinct from p_purchase_id
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CREATED'
       and v_existing_result_receipt_id is not null then
      perform fridge_internal.register_household_procurement_command_intent(
        p_household_id,
        p_command_id,
        'CREATE_RECEIPT'
      );
      return query select 'CREATED'::text, v_existing_result_receipt_id;
      return;
    end if;

    raise exception 'unexpected pending Household Receipt create command';
  end if;

  if p_purchase_id is not null then
    select p.purchase_id
      into v_purchase_locked
      from fridge.purchase p
     where p.household_id = p_household_id
       and p.purchase_id = p_purchase_id
     for key share;

    if v_purchase_locked is null then
      return query select 'NOT_FOUND'::text, null::uuid;
      return;
    end if;
  end if;

  -- This first Receipt slice records a live receiving occurrence. Backdated or
  -- imported source occurrence time remains a separate provenance-governed intent.
  v_committed_at := clock_timestamp();

  insert into fridge.household_receipt_create_command (
    household_id,
    command_id,
    actor_user_id,
    purchase_id,
    provenance,
    candidate_receipt_id,
    result_receipt_id,
    outcome_code,
    recorded_at
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_purchase_id,
    v_provenance,
    p_candidate_receipt_id,
    null,
    'PENDING',
    v_committed_at
  );

  insert into fridge.receipt (
    receipt_id,
    household_id,
    purchase_id,
    source_identity,
    occurred_at,
    source_provenance,
    recorded_at
  ) values (
    p_candidate_receipt_id,
    p_household_id,
    p_purchase_id,
    null,
    v_committed_at,
    v_provenance,
    v_committed_at
  );

  update fridge.household_receipt_create_command
     set result_receipt_id = p_candidate_receipt_id,
         outcome_code = 'CREATED'
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_RECEIPT'
  );

  return query select 'CREATED'::text, p_candidate_receipt_id;
end;
$$;

comment on function fridge_internal.create_household_receipt(uuid, uuid, uuid, uuid, uuid, uuid, text) is
  'BE-06 governed CreateReceipt. Revalidates current procurement authority, supports optional same-Household Purchase provenance, commits immutable Receipt history only, and deliberately does not create ReceiptItem physical truth.';

revoke all on table fridge.household_receipt_create_command
  from public, fridge_app, fridge_worker, fridge_readonly;

revoke all on function fridge_internal.create_household_receipt(uuid, uuid, uuid, uuid, uuid, uuid, text)
  from public, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.create_household_receipt(uuid, uuid, uuid, uuid, uuid, uuid, text)
  to fridge_app;

commit;
