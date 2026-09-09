-- FridgeScanner BE-06
-- 000066__create_purchase.sql
-- Governed, idempotent creation of one Household Purchase and its exact PurchaseItems.

begin;

create table fridge.household_procurement_command_registry (
  household_id uuid not null,
  command_id uuid not null,
  intent_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_procurement_command_registry_pk
    primary key (household_id, command_id),
  constraint household_procurement_command_registry_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_procurement_command_registry_intent_ck
    check (intent_code in ('CREATE_PURCHASE'))
);

comment on table fridge.household_procurement_command_registry is
  'Canonical BE-06 Household-scoped CommandId-to-intent reservation. A committed procurement CommandId belongs to exactly one semantic BE-06 intent.';

create or replace function fridge_internal.assert_household_procurement_command_intent(
  p_household_id uuid,
  p_command_id uuid,
  p_intent_code text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_existing_intent text;
begin
  select r.intent_code
    into v_existing_intent
    from fridge.household_procurement_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id;

  if v_existing_intent is not null
     and v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P6I01',
      message = 'Household procurement command id is reserved for another intent';
  end if;
end;
$$;

create or replace function fridge_internal.register_household_procurement_command_intent(
  p_household_id uuid,
  p_command_id uuid,
  p_intent_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_existing_intent text;
begin
  insert into fridge.household_procurement_command_registry (
    household_id,
    command_id,
    intent_code
  ) values (
    p_household_id,
    p_command_id,
    p_intent_code
  )
  on conflict (household_id, command_id) do nothing;

  select r.intent_code
    into v_existing_intent
    from fridge.household_procurement_command_registry r
   where r.household_id = p_household_id
     and r.command_id = p_command_id
   for update;

  if v_existing_intent is distinct from p_intent_code then
    raise exception using
      errcode = 'P6I01',
      message = 'Household procurement command id is reserved for another intent';
  end if;
end;
$$;

create table fridge.household_purchase_create_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  transaction_currency_code text not null,
  semantic_items jsonb not null,
  candidate_purchase_id uuid not null,
  result_purchase_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_purchase_create_command_pk
    primary key (household_id, command_id),
  constraint household_purchase_create_command_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_purchase_create_command_actor_fk
    foreign key (actor_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_purchase_create_command_currency_fk
    foreign key (transaction_currency_code)
    references fridge.currency (currency_code)
    on update restrict on delete restrict,
  constraint household_purchase_create_command_result_fk
    foreign key (result_purchase_id)
    references fridge.purchase (purchase_id)
    on update restrict on delete restrict,
  constraint household_purchase_create_command_items_ck
    check (jsonb_typeof(semantic_items) = 'array' and jsonb_array_length(semantic_items) > 0),
  constraint household_purchase_create_command_outcome_ck
    check (outcome_code in ('PENDING', 'CREATED')),
  constraint household_purchase_create_command_result_ck
    check (
      (outcome_code = 'CREATED' and result_purchase_id is not null)
      or (outcome_code = 'PENDING' and result_purchase_id is null)
    )
);

comment on table fridge.household_purchase_create_command is
  'Durable BE-06 CreatePurchase command identity. The fingerprint binds actor, currency and the exact ordered semantic PurchaseItem payload; server-generated Purchase/PurchaseItem candidates are excluded from semantic equality.';

create table fridge.household_purchase_create_command_item_result (
  household_id uuid not null,
  command_id uuid not null,
  line_no integer not null,
  purchase_item_id uuid not null,
  constraint household_purchase_create_command_item_result_pk
    primary key (household_id, command_id, line_no),
  constraint household_purchase_create_command_item_result_command_fk
    foreign key (household_id, command_id)
    references fridge.household_purchase_create_command (household_id, command_id)
    on update restrict on delete restrict,
  constraint household_purchase_create_command_item_result_item_fk
    foreign key (household_id, purchase_item_id)
    references fridge.purchase_item (household_id, purchase_item_id)
    on update restrict on delete restrict,
  constraint household_purchase_create_command_item_result_line_ck
    check (line_no > 0),
  constraint household_purchase_create_command_item_result_item_uq
    unique (household_id, command_id, purchase_item_id)
);

comment on table fridge.household_purchase_create_command_item_result is
  'Ordered durable result identities for CreatePurchase replay. line_no is command-payload order only and does not create an accounting ordering invariant on PurchaseItem itself.';

create or replace function fridge_internal.create_household_purchase(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_purchase_id uuid,
  p_transaction_currency_code text,
  p_items jsonb
)
returns table (
  outcome_code text,
  result_purchase_id uuid,
  line_no integer,
  result_purchase_item_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_currency_locked text;
  v_semantic_items jsonb := '[]'::jsonb;
  v_existing_actor_user_id uuid;
  v_existing_currency_code text;
  v_existing_semantic_items jsonb;
  v_existing_outcome_code text;
  v_existing_result_purchase_id uuid;
  v_element jsonb;
  v_ordinality bigint;
  v_candidate_purchase_item_id uuid;
  v_candidate_item_ids uuid[] := array[]::uuid[];
  v_product_id uuid;
  v_unit_id uuid;
  v_quantity_num numeric;
  v_quantity_den numeric;
  v_product_locked uuid;
  v_unit_locked uuid;
  v_committed_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::integer, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_procurement_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );

  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::integer, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_PURCHASE'
  );

  if p_transaction_currency_code is null
     or p_transaction_currency_code !~ '^[A-Z]{3}$'
     or p_items is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
    return;
  end if;

  -- Build the exact semantic fingerprint first. Candidate item identities are
  -- deliberately omitted; array order is part of this command's identity.
  for v_element, v_ordinality in
    select e.value, e.ordinality
      from jsonb_array_elements(p_items) with ordinality as e(value, ordinality)
     order by e.ordinality
  loop
    if jsonb_typeof(v_element) is distinct from 'object' then
      return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
      return;
    end if;

    begin
      v_candidate_purchase_item_id := (v_element ->> 'candidatePurchaseItemId')::uuid;
      v_product_id := (v_element ->> 'productId')::uuid;
      v_quantity_num := (v_element ->> 'quantityNumerator')::numeric;
      v_quantity_den := (v_element ->> 'quantityDenominator')::numeric;
      v_unit_id := (v_element ->> 'measurementUnitId')::uuid;
    exception
      when sqlstate '22P02' or sqlstate '22003' or sqlstate '22023' or sqlstate '22012' then
        return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
        return;
    end;

    if v_candidate_purchase_item_id = any(v_candidate_item_ids)
       or v_quantity_num <= 0
       or v_quantity_den <= 0 then
      return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
      return;
    end if;

    begin
      if not fridge_internal.assert_normalized_rational(v_quantity_num, v_quantity_den) then
        return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
        return;
      end if;
    exception
      when sqlstate '22023' or sqlstate '22012' then
        return query select 'INVALID_INPUT'::text, null::uuid, null::integer, null::uuid;
        return;
    end;

    v_candidate_item_ids := array_append(v_candidate_item_ids, v_candidate_purchase_item_id);
    v_semantic_items := v_semantic_items || jsonb_build_array(
      jsonb_build_object(
        'productId', v_product_id::text,
        'quantityNumerator', v_quantity_num::text,
        'quantityDenominator', v_quantity_den::text,
        'measurementUnitId', v_unit_id::text
      )
    );
  end loop;

  -- Committed replay is resolved before current currency/Product/unit checks.
  select c.actor_user_id,
         c.transaction_currency_code,
         c.semantic_items,
         c.outcome_code,
         c.result_purchase_id
    into v_existing_actor_user_id,
         v_existing_currency_code,
         v_existing_semantic_items,
         v_existing_outcome_code,
         v_existing_result_purchase_id
    from fridge.household_purchase_create_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_currency_code is distinct from p_transaction_currency_code
       or v_existing_semantic_items is distinct from v_semantic_items then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::integer, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CREATED'
       and v_existing_result_purchase_id is not null then
      perform fridge_internal.register_household_procurement_command_intent(
        p_household_id,
        p_command_id,
        'CREATE_PURCHASE'
      );

      return query
      select 'CREATED'::text,
             v_existing_result_purchase_id,
             r.line_no,
             r.purchase_item_id
        from fridge.household_purchase_create_command_item_result r
       where r.household_id = p_household_id
         and r.command_id = p_command_id
       order by r.line_no;
      return;
    end if;

    raise exception 'unexpected pending Household Purchase create command';
  end if;

  -- Reference validation/locking begins only after authority + replay resolution.
  select c.currency_code
    into v_currency_locked
    from fridge.currency c
   where c.currency_code = p_transaction_currency_code
     and c.lifecycle_status = 'ACTIVE'
   for share;

  if v_currency_locked is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::integer, null::uuid;
    return;
  end if;

  -- Canonical lock order inside the reference class is deterministic by ProductId.
  for v_product_id in
    select distinct ((e.value ->> 'productId')::uuid)
      from jsonb_array_elements(p_items) as e(value)
     order by 1
  loop
    select p.product_id
      into v_product_locked
      from fridge.product p
     where p.product_id = v_product_id
       and p.lifecycle_status = 'ACTIVE'
       and (
         p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
         or (
           p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope
           and p.owner_household_id = p_household_id
         )
       )
     for key share;

    if v_product_locked is null then
      return query select 'NOT_FOUND'::text, null::uuid, null::integer, null::uuid;
      return;
    end if;
  end loop;

  -- Units are governed reference data and are locked after Product references.
  for v_unit_id in
    select distinct ((e.value ->> 'measurementUnitId')::uuid)
      from jsonb_array_elements(p_items) as e(value)
     order by 1
  loop
    select u.measurement_unit_id
      into v_unit_locked
      from fridge.measurement_unit u
     where u.measurement_unit_id = v_unit_id
       and u.lifecycle_status = 'ACTIVE'
     for share;

    if v_unit_locked is null then
      return query select 'NOT_FOUND'::text, null::uuid, null::integer, null::uuid;
      return;
    end if;
  end loop;

  -- This first CreatePurchase slice represents a live purchase occurrence;
  -- source/backdated occurrence is a separate future provenance-governed workflow.
  v_committed_at := clock_timestamp();

  insert into fridge.household_purchase_create_command (
    household_id,
    command_id,
    actor_user_id,
    transaction_currency_code,
    semantic_items,
    candidate_purchase_id,
    result_purchase_id,
    outcome_code
  ) values (
    p_household_id,
    p_command_id,
    p_actor_user_id,
    p_transaction_currency_code,
    v_semantic_items,
    p_candidate_purchase_id,
    null,
    'PENDING'
  );

  insert into fridge.purchase (
    purchase_id,
    household_id,
    transaction_currency_code,
    source_identity,
    occurred_at,
    merchant_provenance,
    source_provenance,
    recorded_at
  ) values (
    p_candidate_purchase_id,
    p_household_id,
    p_transaction_currency_code,
    null,
    v_committed_at,
    null,
    null,
    v_committed_at
  );

  for v_element, v_ordinality in
    select e.value, e.ordinality
      from jsonb_array_elements(p_items) with ordinality as e(value, ordinality)
     order by e.ordinality
  loop
    v_candidate_purchase_item_id := (v_element ->> 'candidatePurchaseItemId')::uuid;
    v_product_id := (v_element ->> 'productId')::uuid;
    v_quantity_num := (v_element ->> 'quantityNumerator')::numeric;
    v_quantity_den := (v_element ->> 'quantityDenominator')::numeric;
    v_unit_id := (v_element ->> 'measurementUnitId')::uuid;

    insert into fridge.purchase_item (
      purchase_item_id,
      household_id,
      purchase_id,
      product_id,
      purchased_quantity_num,
      purchased_quantity_den,
      purchased_unit_id,
      pricing_basis_quantity_num,
      pricing_basis_quantity_den,
      pricing_basis_unit_id,
      pricing_conversion_evidence_id,
      source_identity,
      provenance,
      recorded_at
    ) values (
      v_candidate_purchase_item_id,
      p_household_id,
      p_candidate_purchase_id,
      v_product_id,
      v_quantity_num,
      v_quantity_den,
      v_unit_id,
      null,
      null,
      null,
      null,
      null,
      null,
      v_committed_at
    );

    insert into fridge.household_purchase_create_command_item_result (
      household_id,
      command_id,
      line_no,
      purchase_item_id
    ) values (
      p_household_id,
      p_command_id,
      v_ordinality::integer,
      v_candidate_purchase_item_id
    );
  end loop;

  update fridge.household_purchase_create_command
     set outcome_code = 'CREATED',
         result_purchase_id = p_candidate_purchase_id
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_PURCHASE'
  );

  return query
  select 'CREATED'::text,
         p_candidate_purchase_id,
         r.line_no,
         r.purchase_item_id
    from fridge.household_purchase_create_command_item_result r
   where r.household_id = p_household_id
     and r.command_id = p_command_id
   order by r.line_no;
end;
$$;

comment on function fridge_internal.create_household_purchase(uuid, uuid, uuid, uuid, uuid, text, jsonb) is
  'BE-06 intent-specific CreatePurchase boundary. Revalidates HOUSEHOLD_PROCUREMENT_ADMINISTER authority, resolves replay before current reference validation, requires ACTIVE currency/measurement units plus ACTIVE GLOBAL-or-same-Household Products, creates Purchase+PurchaseItems atomically at fresh post-lock database time, and provides non-reapplying ordered replay.';

revoke all on table fridge.household_procurement_command_registry from public;
revoke all on table fridge.household_purchase_create_command from public;
revoke all on table fridge.household_purchase_create_command_item_result from public;
revoke all on function fridge_internal.assert_household_procurement_command_intent(uuid, uuid, text) from public;
revoke all on function fridge_internal.register_household_procurement_command_intent(uuid, uuid, text) from public;
revoke all on function fridge_internal.create_household_purchase(uuid, uuid, uuid, uuid, uuid, text, jsonb) from public;

grant execute on function fridge_internal.create_household_purchase(uuid, uuid, uuid, uuid, uuid, text, jsonb)
  to fridge_app;

commit;
