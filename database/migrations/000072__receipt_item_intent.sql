-- FridgeScanner BE-06
-- 000072__receipt_item_intent.sql
-- Govern an explicit ReceiptItem intent without committing physical ReceiptItem/inventory truth.

begin;

alter table fridge.household_procurement_command_registry
  drop constraint household_procurement_command_registry_intent_ck,
  add constraint household_procurement_command_registry_intent_ck
    check (intent_code in (
      'CREATE_PURCHASE',
      'COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS',
      'COMMIT_PURCHASE_ITEM_PRICING_BASIS',
      'COMMIT_PURCHASE_ITEM_PRICING_EXTENSION',
      'CREATE_RECEIPT',
      'CREATE_RECEIPT_ITEM_INTENT'
    ));

create table fridge.receipt_item_intent (
  receipt_item_intent_id uuid primary key,
  household_id uuid not null,
  receipt_id uuid not null,
  product_id uuid not null,
  intended_quantity_num numeric not null,
  intended_quantity_den numeric not null,
  intended_unit_id uuid not null,
  provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receipt_item_intent_receipt_fk
    foreign key (household_id, receipt_id)
    references fridge.receipt (household_id, receipt_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_unit_fk
    foreign key (intended_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_quantity_ck
    check (
      intended_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        intended_quantity_num,
        intended_quantity_den
      )
    ),
  constraint receipt_item_intent_provenance_ck
    check (btrim(provenance) <> ''),
  constraint receipt_item_intent_household_identity_uq
    unique (household_id, receipt_item_intent_id),
  constraint receipt_item_intent_household_receipt_identity_uq
    unique (household_id, receipt_id, receipt_item_intent_id)
);

comment on table fridge.receipt_item_intent is
  'BE-06 operational intent for a Product + exact quantity/unit inside one Receipt. It is not ReceiptItem physical truth, does not consume Purchase receiving allowance, and has no inventory effect.';

alter table fridge.receipt_item_intent enable row level security;
create policy household_isolation on fridge.receipt_item_intent
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

create trigger receipt_item_intent_immutable
before update or delete on fridge.receipt_item_intent
for each row execute function fridge_internal.reject_historical_mutation();

create table fridge.household_receipt_item_intent_create_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  receipt_id uuid not null,
  product_id uuid not null,
  quantity_num numeric not null,
  quantity_den numeric not null,
  measurement_unit_id uuid not null,
  provenance text not null,
  candidate_receipt_item_intent_id uuid not null,
  result_receipt_item_intent_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_receipt_item_intent_create_command_pk
    primary key (household_id, command_id),
  constraint household_receipt_item_intent_create_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_receipt_item_intent_create_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_receipt_item_intent_create_command_receipt_fk
    foreign key (household_id, receipt_id)
    references fridge.receipt (household_id, receipt_id)
    on update restrict on delete restrict,
  constraint household_receipt_item_intent_create_command_product_fk
    foreign key (product_id) references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint household_receipt_item_intent_create_command_unit_fk
    foreign key (measurement_unit_id) references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint household_receipt_item_intent_create_command_result_fk
    foreign key (household_id, result_receipt_item_intent_id)
    references fridge.receipt_item_intent (household_id, receipt_item_intent_id)
    on update restrict on delete restrict,
  constraint household_receipt_item_intent_create_command_quantity_ck
    check (
      quantity_num > 0
      and fridge_internal.assert_normalized_rational(quantity_num, quantity_den)
    ),
  constraint household_receipt_item_intent_create_command_provenance_ck
    check (btrim(provenance) <> ''),
  constraint household_receipt_item_intent_create_command_outcome_ck
    check (outcome_code in ('PENDING', 'CREATED')),
  constraint household_receipt_item_intent_create_command_result_ck
    check (
      (outcome_code = 'PENDING' and result_receipt_item_intent_id is null)
      or (outcome_code = 'CREATED' and result_receipt_item_intent_id is not null)
    )
);

comment on table fridge.household_receipt_item_intent_create_command is
  'Durable BE-06 CreateReceiptItemIntent command identity. Semantic equality binds actor, Receipt, Product, exact quantity/unit and provenance; generated intent identity is result-only.';

create or replace function fridge_internal.create_household_receipt_item_intent(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_candidate_receipt_item_intent_id uuid,
  p_receipt_id uuid,
  p_product_id uuid,
  p_quantity_num numeric,
  p_quantity_den numeric,
  p_measurement_unit_id uuid,
  p_provenance text
)
returns table (
  outcome_code text,
  result_receipt_item_intent_id uuid
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
  v_existing_receipt_id uuid;
  v_existing_product_id uuid;
  v_existing_quantity_num numeric;
  v_existing_quantity_den numeric;
  v_existing_unit_id uuid;
  v_existing_provenance text;
  v_existing_outcome_code text;
  v_existing_result_id uuid;
  v_receipt_locked uuid;
  v_product_locked uuid;
  v_unit_locked uuid;
  v_recorded_at timestamptz;
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
    'CREATE_RECEIPT_ITEM_INTENT'
  );

  if p_command_id is null
     or p_candidate_receipt_item_intent_id is null
     or p_receipt_id is null
     or p_product_id is null
     or p_measurement_unit_id is null
     or p_quantity_num is null
     or p_quantity_den is null
     or p_quantity_num <= 0
     or p_quantity_den <= 0
     or p_provenance is null
     or btrim(p_provenance) = '' then
    return query select 'INVALID_INPUT'::text, null::uuid;
    return;
  end if;

  begin
    if not fridge_internal.assert_normalized_rational(p_quantity_num, p_quantity_den) then
      return query select 'INVALID_INPUT'::text, null::uuid;
      return;
    end if;
  exception
    when sqlstate '22023' or sqlstate '22012' then
      return query select 'INVALID_INPUT'::text, null::uuid;
      return;
  end;

  v_provenance := btrim(p_provenance);

  -- Replay is resolved before current Receipt/Product/unit revalidation. An
  -- already-created intent is historical operational evidence and is not restored.
  select c.actor_user_id,
         c.receipt_id,
         c.product_id,
         c.quantity_num,
         c.quantity_den,
         c.measurement_unit_id,
         c.provenance,
         c.outcome_code,
         c.result_receipt_item_intent_id
    into v_existing_actor_user_id,
         v_existing_receipt_id,
         v_existing_product_id,
         v_existing_quantity_num,
         v_existing_quantity_den,
         v_existing_unit_id,
         v_existing_provenance,
         v_existing_outcome_code,
         v_existing_result_id
    from fridge.household_receipt_item_intent_create_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_receipt_id is distinct from p_receipt_id
       or v_existing_product_id is distinct from p_product_id
       or v_existing_quantity_num is distinct from p_quantity_num
       or v_existing_quantity_den is distinct from p_quantity_den
       or v_existing_unit_id is distinct from p_measurement_unit_id
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid;
      return;
    end if;

    if v_existing_outcome_code = 'CREATED' and v_existing_result_id is not null then
      perform fridge_internal.register_household_procurement_command_intent(
        p_household_id,
        p_command_id,
        'CREATE_RECEIPT_ITEM_INTENT'
      );
      return query select 'CREATED'::text, v_existing_result_id;
      return;
    end if;

    raise exception 'unexpected pending Household ReceiptItem intent create command';
  end if;

  -- Canonical dependency lock order: Receipt parent, Product, MeasurementUnit.
  select r.receipt_id
    into v_receipt_locked
    from fridge.receipt r
   where r.household_id = p_household_id
     and r.receipt_id = p_receipt_id
   for key share;
  if v_receipt_locked is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  select p.product_id
    into v_product_locked
    from fridge.product p
   where p.product_id = p_product_id
     and p.lifecycle_status = 'ACTIVE'
     and (
       p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope and p.owner_household_id = p_household_id)
     )
   for key share;
  if v_product_locked is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  select u.measurement_unit_id
    into v_unit_locked
    from fridge.measurement_unit u
   where u.measurement_unit_id = p_measurement_unit_id
     and u.lifecycle_status = 'ACTIVE'
   for share;
  if v_unit_locked is null then
    return query select 'NOT_FOUND'::text, null::uuid;
    return;
  end if;

  v_recorded_at := clock_timestamp();

  insert into fridge.household_receipt_item_intent_create_command (
    household_id, command_id, actor_user_id, receipt_id, product_id,
    quantity_num, quantity_den, measurement_unit_id, provenance,
    candidate_receipt_item_intent_id, result_receipt_item_intent_id,
    outcome_code, recorded_at
  ) values (
    p_household_id, p_command_id, p_actor_user_id, p_receipt_id, p_product_id,
    p_quantity_num, p_quantity_den, p_measurement_unit_id, v_provenance,
    p_candidate_receipt_item_intent_id, null, 'PENDING', v_recorded_at
  );

  insert into fridge.receipt_item_intent (
    receipt_item_intent_id, household_id, receipt_id, product_id,
    intended_quantity_num, intended_quantity_den, intended_unit_id,
    provenance, recorded_at
  ) values (
    p_candidate_receipt_item_intent_id, p_household_id, p_receipt_id, p_product_id,
    p_quantity_num, p_quantity_den, p_measurement_unit_id,
    v_provenance, v_recorded_at
  );

  update fridge.household_receipt_item_intent_create_command
     set result_receipt_item_intent_id = p_candidate_receipt_item_intent_id,
         outcome_code = 'CREATED'
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'CREATE_RECEIPT_ITEM_INTENT'
  );

  return query select 'CREATED'::text, p_candidate_receipt_item_intent_id;
end;
$$;

comment on function fridge_internal.create_household_receipt_item_intent(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,text) is
  'BE-06 governed ReceiptItem intent creation. Commits immutable operational intent only; it does not create ReceiptItem, consume Purchase receiving allowance or create inventory effects.';

revoke all on table fridge.receipt_item_intent
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on table fridge.household_receipt_item_intent_create_command
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.create_household_receipt_item_intent(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,text)
  from public, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.create_household_receipt_item_intent(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,uuid,text)
  to fridge_app;

commit;
