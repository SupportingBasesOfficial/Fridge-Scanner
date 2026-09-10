-- FridgeScanner BE-06
-- 000074__substitution_receipt_materialization.sql
-- Atomically materialize one different-Product ReceiptItemIntent as governed substitution receiving.

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
      'CREATE_RECEIPT_ITEM_INTENT',
      'MATERIALIZE_ORDINARY_RECEIPT_ITEM',
      'MATERIALIZE_SUBSTITUTION_RECEIPT_ITEM'
    ));

-- Cross-kind physical uniqueness for one ReceiptItemIntent. Ordinary receiving
-- predates substitution support, so accepted ordinary rows are backfilled before
-- triggers begin claiming future materializations.
create table fridge.receipt_item_intent_physical_materialization (
  household_id uuid not null,
  receipt_item_intent_id uuid not null,
  materialization_kind text not null,
  receipt_item_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receipt_item_intent_physical_materialization_pk
    primary key (household_id, receipt_item_intent_id),
  constraint receipt_item_intent_physical_materialization_intent_fk
    foreign key (household_id, receipt_item_intent_id)
    references fridge.receipt_item_intent (household_id, receipt_item_intent_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_physical_materialization_receipt_fk
    foreign key (household_id, receipt_item_id)
    references fridge.receipt_item (household_id, receipt_item_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_physical_materialization_kind_ck
    check (materialization_kind in ('ORDINARY', 'SUBSTITUTION')),
  constraint receipt_item_intent_physical_materialization_receipt_uq
    unique (household_id, receipt_item_id)
);

comment on table fridge.receipt_item_intent_physical_materialization is
  'Cross-kind unique physical consumption registry for ReceiptItemIntent. One operational intent may become physical truth exactly once, regardless of ordinary or substitution path.';

insert into fridge.receipt_item_intent_physical_materialization (
  household_id, receipt_item_intent_id, materialization_kind, receipt_item_id, recorded_at
)
select household_id, receipt_item_intent_id, 'ORDINARY', receipt_item_id, recorded_at
from fridge.receipt_item_intent_materialization;

alter table fridge.receipt_item_intent_physical_materialization enable row level security;
create policy household_isolation on fridge.receipt_item_intent_physical_materialization
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

create trigger receipt_item_intent_physical_materialization_immutable
before update or delete on fridge.receipt_item_intent_physical_materialization
for each row execute function fridge_internal.reject_historical_mutation();

create table fridge.receipt_item_intent_substitution_materialization (
  household_id uuid not null,
  receipt_item_intent_id uuid not null,
  receipt_item_id uuid not null,
  purchase_item_substitution_allocation_id uuid not null,
  stock_item_id uuid not null,
  inventory_movement_id uuid not null,
  receipt_item_inventory_effect_id uuid not null,
  provenance text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receipt_item_intent_substitution_materialization_pk
    primary key (household_id, receipt_item_intent_id),
  constraint receipt_item_intent_substitution_materialization_intent_fk
    foreign key (household_id, receipt_item_intent_id)
    references fridge.receipt_item_intent (household_id, receipt_item_intent_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_substitution_materialization_receipt_item_fk
    foreign key (household_id, receipt_item_id)
    references fridge.receipt_item (household_id, receipt_item_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_substitution_materialization_allocation_fk
    foreign key (household_id, purchase_item_substitution_allocation_id)
    references fridge.purchase_item_substitution_allocation (
      household_id, purchase_item_substitution_allocation_id
    )
    on update restrict on delete restrict,
  constraint receipt_item_intent_substitution_materialization_stock_fk
    foreign key (household_id, stock_item_id)
    references fridge.stock_item (household_id, stock_item_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_substitution_materialization_movement_fk
    foreign key (household_id, inventory_movement_id)
    references fridge.inventory_movement (household_id, inventory_movement_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_substitution_materialization_effect_fk
    foreign key (household_id, receipt_item_inventory_effect_id)
    references fridge.receipt_item_inventory_effect (household_id, receipt_item_inventory_effect_id)
    on update restrict on delete restrict,
  constraint receipt_item_intent_substitution_materialization_receipt_uq unique (receipt_item_id),
  constraint receipt_item_intent_substitution_materialization_allocation_uq unique (purchase_item_substitution_allocation_id),
  constraint receipt_item_intent_substitution_materialization_stock_uq unique (stock_item_id),
  constraint receipt_item_intent_substitution_materialization_movement_uq unique (inventory_movement_id),
  constraint receipt_item_intent_substitution_materialization_effect_uq unique (receipt_item_inventory_effect_id),
  constraint receipt_item_intent_substitution_materialization_provenance_ck check (btrim(provenance) <> '')
);

comment on table fridge.receipt_item_intent_substitution_materialization is
  'Immutable BE-06 bridge from ReceiptItemIntent to committed different-Product substitution allocation and exact physical inventory ingress.';

alter table fridge.receipt_item_intent_substitution_materialization enable row level security;
create policy household_isolation on fridge.receipt_item_intent_substitution_materialization
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

create trigger receipt_item_intent_substitution_materialization_immutable
before update or delete on fridge.receipt_item_intent_substitution_materialization
for each row execute function fridge_internal.reject_historical_mutation();

create or replace function fridge_internal.claim_receipt_item_intent_physical_materialization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_kind text;
begin
  v_kind := case tg_table_name
    when 'receipt_item_intent_materialization' then 'ORDINARY'
    when 'receipt_item_intent_substitution_materialization' then 'SUBSTITUTION'
    else null
  end;

  if v_kind is null then
    raise exception 'unsupported ReceiptItemIntent materialization bridge';
  end if;

  begin
    insert into fridge.receipt_item_intent_physical_materialization (
      household_id, receipt_item_intent_id, materialization_kind, receipt_item_id, recorded_at
    ) values (
      new.household_id, new.receipt_item_intent_id, v_kind, new.receipt_item_id, new.recorded_at
    );
  exception
    when unique_violation then
      raise exception using
        errcode = 'P6R01',
        message = 'ReceiptItemIntent is already physically materialized';
  end;

  return new;
end;
$$;

revoke all on function fridge_internal.claim_receipt_item_intent_physical_materialization()
  from public, fridge_app, fridge_worker, fridge_readonly;

create trigger receipt_item_intent_materialization_claim_physical
before insert on fridge.receipt_item_intent_materialization
for each row execute function fridge_internal.claim_receipt_item_intent_physical_materialization();

create trigger receipt_item_intent_substitution_materialization_claim_physical
before insert on fridge.receipt_item_intent_substitution_materialization
for each row execute function fridge_internal.claim_receipt_item_intent_physical_materialization();

create table fridge.household_substitution_receipt_materialization_command (
  household_id uuid not null,
  command_id uuid not null,
  actor_user_id uuid not null,
  receipt_item_intent_id uuid not null,
  purchase_item_id uuid not null,
  allocation_conversion_evidence_id uuid,
  reason text not null,
  placement_kind fridge.inventory_placement_anchor_kind not null,
  storage_location_id uuid,
  compartment_id uuid,
  provenance text not null,
  candidate_receipt_item_id uuid not null,
  candidate_purchase_item_substitution_allocation_id uuid not null,
  candidate_stock_item_id uuid not null,
  candidate_inventory_movement_id uuid not null,
  candidate_receipt_item_inventory_effect_id uuid not null,
  result_receipt_item_id uuid,
  result_purchase_item_substitution_allocation_id uuid,
  result_stock_item_id uuid,
  result_inventory_movement_id uuid,
  result_receipt_item_inventory_effect_id uuid,
  outcome_code text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint household_substitution_receipt_materialization_command_pk
    primary key (household_id, command_id),
  constraint household_substitution_receipt_materialization_command_household_fk
    foreign key (household_id) references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_actor_fk
    foreign key (actor_user_id) references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_intent_fk
    foreign key (household_id, receipt_item_intent_id)
    references fridge.receipt_item_intent (household_id, receipt_item_intent_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_purchase_item_fk
    foreign key (household_id, purchase_item_id)
    references fridge.purchase_item (household_id, purchase_item_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_conversion_fk
    foreign key (allocation_conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_location_fk
    foreign key (household_id, storage_location_id)
    references fridge.storage_location (household_id, storage_location_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_compartment_fk
    foreign key (household_id, compartment_id)
    references fridge.compartment (household_id, compartment_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_result_receipt_fk
    foreign key (household_id, result_receipt_item_id)
    references fridge.receipt_item (household_id, receipt_item_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_result_allocation_fk
    foreign key (household_id, result_purchase_item_substitution_allocation_id)
    references fridge.purchase_item_substitution_allocation (
      household_id, purchase_item_substitution_allocation_id
    )
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_result_stock_fk
    foreign key (household_id, result_stock_item_id)
    references fridge.stock_item (household_id, stock_item_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_result_movement_fk
    foreign key (household_id, result_inventory_movement_id)
    references fridge.inventory_movement (household_id, inventory_movement_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_result_effect_fk
    foreign key (household_id, result_receipt_item_inventory_effect_id)
    references fridge.receipt_item_inventory_effect (household_id, receipt_item_inventory_effect_id)
    on update restrict on delete restrict,
  constraint household_substitution_receipt_materialization_command_reason_ck
    check (btrim(reason) <> ''),
  constraint household_substitution_receipt_materialization_command_provenance_ck
    check (btrim(provenance) <> ''),
  constraint household_substitution_receipt_materialization_command_placement_ck
    check (
      (placement_kind = 'LOCATION' and storage_location_id is not null and compartment_id is null)
      or (placement_kind = 'COMPARTMENT' and storage_location_id is null and compartment_id is not null)
    ),
  constraint household_substitution_receipt_materialization_command_outcome_ck
    check (outcome_code in ('PENDING', 'MATERIALIZED')),
  constraint household_substitution_receipt_materialization_command_result_ck
    check (
      (outcome_code = 'PENDING'
        and result_receipt_item_id is null
        and result_purchase_item_substitution_allocation_id is null
        and result_stock_item_id is null
        and result_inventory_movement_id is null
        and result_receipt_item_inventory_effect_id is null)
      or
      (outcome_code = 'MATERIALIZED'
        and result_receipt_item_id is not null
        and result_purchase_item_substitution_allocation_id is not null
        and result_stock_item_id is not null
        and result_inventory_movement_id is not null
        and result_receipt_item_inventory_effect_id is not null)
    )
);

comment on table fridge.household_substitution_receipt_materialization_command is
  'Durable CommandId state for atomic different-Product substitution receiving. Generated physical identities remain result-only.';

alter table fridge.household_substitution_receipt_materialization_command enable row level security;
create policy household_isolation on fridge.household_substitution_receipt_materialization_command
  using (household_id = fridge_internal.current_household_id())
  with check (household_id = fridge_internal.current_household_id());

create trigger household_substitution_receipt_materialization_command_immutable
before update or delete on fridge.household_substitution_receipt_materialization_command
for each row when (old.outcome_code = 'MATERIALIZED')
execute function fridge_internal.reject_historical_mutation();

create or replace function fridge_internal.materialize_substitution_receipt_item(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_command_id uuid,
  p_receipt_item_intent_id uuid,
  p_purchase_item_id uuid,
  p_allocation_conversion_evidence_id uuid,
  p_reason text,
  p_placement_kind text,
  p_storage_location_id uuid,
  p_compartment_id uuid,
  p_provenance text,
  p_candidate_receipt_item_id uuid,
  p_candidate_substitution_allocation_id uuid,
  p_candidate_stock_item_id uuid,
  p_candidate_inventory_movement_id uuid,
  p_candidate_receipt_inventory_effect_id uuid
)
returns table (
  outcome_code text,
  result_receipt_item_id uuid,
  result_purchase_item_substitution_allocation_id uuid,
  result_stock_item_id uuid,
  result_inventory_movement_id uuid,
  result_receipt_item_inventory_effect_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role_code text;
  v_reason text;
  v_provenance text;
  v_existing_actor_user_id uuid;
  v_existing_intent_id uuid;
  v_existing_purchase_item_id uuid;
  v_existing_conversion_id uuid;
  v_existing_reason text;
  v_existing_placement_kind fridge.inventory_placement_anchor_kind;
  v_existing_storage_location_id uuid;
  v_existing_compartment_id uuid;
  v_existing_provenance text;
  v_existing_outcome text;
  v_existing_receipt_item_id uuid;
  v_existing_allocation_id uuid;
  v_existing_stock_item_id uuid;
  v_existing_movement_id uuid;
  v_existing_effect_id uuid;
  v_discovered_receipt_id uuid;
  v_receipt fridge.receipt%rowtype;
  v_intent fridge.receipt_item_intent%rowtype;
  v_purchase_item fridge.purchase_item%rowtype;
  v_product_locked uuid;
  v_unit_locked uuid;
  v_parent_location_id uuid;
  v_location_locked uuid;
  v_compartment_locked uuid;
  v_materialized_intent uuid;
  v_can_allocate boolean;
  v_committed_at timestamptz;
begin
  if fridge_internal.current_household_id() is distinct from p_household_id then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  v_actor_role_code := fridge_internal.acquire_household_procurement_admin_authority(
    p_household_id,
    p_actor_user_id,
    p_actor_membership_id
  );
  if v_actor_role_code is null then
    return query select 'UNAUTHORIZED'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  perform fridge_internal.assert_household_procurement_command_intent(
    p_household_id,
    p_command_id,
    'MATERIALIZE_SUBSTITUTION_RECEIPT_ITEM'
  );

  if p_command_id is null
     or p_receipt_item_intent_id is null
     or p_purchase_item_id is null
     or p_candidate_receipt_item_id is null
     or p_candidate_substitution_allocation_id is null
     or p_candidate_stock_item_id is null
     or p_candidate_inventory_movement_id is null
     or p_candidate_receipt_inventory_effect_id is null
     or p_reason is null
     or btrim(p_reason) = ''
     or p_provenance is null
     or btrim(p_provenance) = ''
     or p_placement_kind not in ('LOCATION', 'COMPARTMENT')
     or (p_placement_kind = 'LOCATION' and (p_storage_location_id is null or p_compartment_id is not null))
     or (p_placement_kind = 'COMPARTMENT' and (p_storage_location_id is not null or p_compartment_id is null)) then
    return query select 'INVALID_INPUT'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  v_reason := btrim(p_reason);
  v_provenance := btrim(p_provenance);

  select c.actor_user_id,
         c.receipt_item_intent_id,
         c.purchase_item_id,
         c.allocation_conversion_evidence_id,
         c.reason,
         c.placement_kind,
         c.storage_location_id,
         c.compartment_id,
         c.provenance,
         c.outcome_code,
         c.result_receipt_item_id,
         c.result_purchase_item_substitution_allocation_id,
         c.result_stock_item_id,
         c.result_inventory_movement_id,
         c.result_receipt_item_inventory_effect_id
    into v_existing_actor_user_id,
         v_existing_intent_id,
         v_existing_purchase_item_id,
         v_existing_conversion_id,
         v_existing_reason,
         v_existing_placement_kind,
         v_existing_storage_location_id,
         v_existing_compartment_id,
         v_existing_provenance,
         v_existing_outcome,
         v_existing_receipt_item_id,
         v_existing_allocation_id,
         v_existing_stock_item_id,
         v_existing_movement_id,
         v_existing_effect_id
    from fridge.household_substitution_receipt_materialization_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_intent_id is distinct from p_receipt_item_intent_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_conversion_id is distinct from p_allocation_conversion_evidence_id
       or v_existing_reason is distinct from v_reason
       or v_existing_placement_kind::text is distinct from p_placement_kind
       or v_existing_storage_location_id is distinct from p_storage_location_id
       or v_existing_compartment_id is distinct from p_compartment_id
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
      return;
    end if;

    if v_existing_outcome = 'MATERIALIZED' then
      perform fridge_internal.register_household_procurement_command_intent(
        p_household_id, p_command_id, 'MATERIALIZE_SUBSTITUTION_RECEIPT_ITEM'
      );
      return query select 'MATERIALIZED'::text,
        v_existing_receipt_item_id,
        v_existing_allocation_id,
        v_existing_stock_item_id,
        v_existing_movement_id,
        v_existing_effect_id;
      return;
    end if;

    raise exception 'unexpected pending substitution ReceiptItem materialization command';
  end if;

  select i.receipt_id into v_discovered_receipt_id
    from fridge.receipt_item_intent i
   where i.household_id = p_household_id
     and i.receipt_item_intent_id = p_receipt_item_intent_id;
  if v_discovered_receipt_id is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  select * into v_receipt
    from fridge.receipt r
   where r.household_id = p_household_id
     and r.receipt_id = v_discovered_receipt_id
   for key share;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  select * into v_intent
    from fridge.receipt_item_intent i
   where i.household_id = p_household_id
     and i.receipt_item_intent_id = p_receipt_item_intent_id
     and i.receipt_id = v_receipt.receipt_id
   for update;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  select c.actor_user_id,
         c.receipt_item_intent_id,
         c.purchase_item_id,
         c.allocation_conversion_evidence_id,
         c.reason,
         c.placement_kind,
         c.storage_location_id,
         c.compartment_id,
         c.provenance,
         c.outcome_code,
         c.result_receipt_item_id,
         c.result_purchase_item_substitution_allocation_id,
         c.result_stock_item_id,
         c.result_inventory_movement_id,
         c.result_receipt_item_inventory_effect_id
    into v_existing_actor_user_id,
         v_existing_intent_id,
         v_existing_purchase_item_id,
         v_existing_conversion_id,
         v_existing_reason,
         v_existing_placement_kind,
         v_existing_storage_location_id,
         v_existing_compartment_id,
         v_existing_provenance,
         v_existing_outcome,
         v_existing_receipt_item_id,
         v_existing_allocation_id,
         v_existing_stock_item_id,
         v_existing_movement_id,
         v_existing_effect_id
    from fridge.household_substitution_receipt_materialization_command c
   where c.household_id = p_household_id
     and c.command_id = p_command_id
   for update;

  if found then
    if v_existing_actor_user_id is distinct from p_actor_user_id
       or v_existing_intent_id is distinct from p_receipt_item_intent_id
       or v_existing_purchase_item_id is distinct from p_purchase_item_id
       or v_existing_conversion_id is distinct from p_allocation_conversion_evidence_id
       or v_existing_reason is distinct from v_reason
       or v_existing_placement_kind::text is distinct from p_placement_kind
       or v_existing_storage_location_id is distinct from p_storage_location_id
       or v_existing_compartment_id is distinct from p_compartment_id
       or v_existing_provenance is distinct from v_provenance then
      return query select 'IDEMPOTENCY_CONFLICT'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
      return;
    end if;
    if v_existing_outcome = 'MATERIALIZED' then
      return query select 'MATERIALIZED'::text,
        v_existing_receipt_item_id,
        v_existing_allocation_id,
        v_existing_stock_item_id,
        v_existing_movement_id,
        v_existing_effect_id;
      return;
    end if;
  end if;

  select p.receipt_item_intent_id into v_materialized_intent
    from fridge.receipt_item_intent_physical_materialization p
   where p.household_id = p_household_id
     and p.receipt_item_intent_id = p_receipt_item_intent_id;
  if v_materialized_intent is not null then
    return query select 'CONFLICT'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if v_receipt.purchase_id is null then
    return query select 'CONFLICT'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  select * into v_purchase_item
    from fridge.purchase_item pi
   where pi.household_id = p_household_id
     and pi.purchase_item_id = p_purchase_item_id
     and pi.purchase_id = v_receipt.purchase_id
   for update;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if v_purchase_item.product_id = v_intent.product_id then
    return query select 'CONFLICT'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  select p.product_id into v_product_locked
    from fridge.product p
   where p.product_id = v_intent.product_id
     and p.lifecycle_status = 'ACTIVE'
     and (
       p.catalog_scope = 'GLOBAL'::fridge.catalog_scope
       or (p.catalog_scope = 'HOUSEHOLD'::fridge.catalog_scope and p.owner_household_id = p_household_id)
     )
   for key share;
  if v_product_locked is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  select u.measurement_unit_id into v_unit_locked
    from fridge.measurement_unit u
   where u.measurement_unit_id = v_intent.intended_unit_id
     and u.lifecycle_status = 'ACTIVE'
   for share;
  if v_unit_locked is null then
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  begin
    v_can_allocate := fridge_internal.receiving_pool_can_allocate(
      p_household_id,
      p_purchase_item_id,
      v_intent.intended_quantity_num,
      v_intent.intended_quantity_den,
      v_intent.intended_unit_id,
      p_allocation_conversion_evidence_id
    );
  exception
    when foreign_key_violation or check_violation or invalid_parameter_value or division_by_zero then
      return query select 'INVALID_INPUT'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
      return;
  end;
  if not v_can_allocate then
    return query select 'RECEIVING_CONFLICT'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if p_placement_kind = 'LOCATION' then
    select sl.storage_location_id into v_location_locked
      from fridge.storage_location sl
     where sl.household_id = p_household_id
       and sl.storage_location_id = p_storage_location_id
       and sl.lifecycle_status = 'ACTIVE'
       and sl.retired_at is null
     for key share;
    if v_location_locked is null then
      return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
      return;
    end if;
  else
    select c.storage_location_id into v_parent_location_id
      from fridge.compartment c
     where c.household_id = p_household_id
       and c.compartment_id = p_compartment_id;
    if v_parent_location_id is null then
      return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
      return;
    end if;

    select sl.storage_location_id into v_location_locked
      from fridge.storage_location sl
     where sl.household_id = p_household_id
       and sl.storage_location_id = v_parent_location_id
       and sl.lifecycle_status = 'ACTIVE'
       and sl.retired_at is null
     for key share;
    if v_location_locked is null then
      return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
      return;
    end if;

    select c.compartment_id into v_compartment_locked
      from fridge.compartment c
     where c.household_id = p_household_id
       and c.storage_location_id = v_parent_location_id
       and c.compartment_id = p_compartment_id
       and c.lifecycle_status = 'ACTIVE'
       and c.retired_at is null
     for key share;
    if v_compartment_locked is null then
      return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
      return;
    end if;
  end if;

  v_committed_at := clock_timestamp();

  insert into fridge.household_substitution_receipt_materialization_command (
    household_id, command_id, actor_user_id, receipt_item_intent_id, purchase_item_id,
    allocation_conversion_evidence_id, reason, placement_kind, storage_location_id,
    compartment_id, provenance, candidate_receipt_item_id,
    candidate_purchase_item_substitution_allocation_id, candidate_stock_item_id,
    candidate_inventory_movement_id, candidate_receipt_item_inventory_effect_id,
    outcome_code, recorded_at
  ) values (
    p_household_id, p_command_id, p_actor_user_id, p_receipt_item_intent_id, p_purchase_item_id,
    p_allocation_conversion_evidence_id, v_reason,
    p_placement_kind::fridge.inventory_placement_anchor_kind,
    p_storage_location_id, p_compartment_id, v_provenance,
    p_candidate_receipt_item_id, p_candidate_substitution_allocation_id,
    p_candidate_stock_item_id, p_candidate_inventory_movement_id,
    p_candidate_receipt_inventory_effect_id, 'PENDING', v_committed_at
  );

  insert into fridge.receipt_item (
    receipt_item_id, household_id, receipt_id, product_id,
    received_quantity_num, received_quantity_den, received_unit_id,
    source_identity, provenance, recorded_at
  ) values (
    p_candidate_receipt_item_id, p_household_id, v_receipt.receipt_id, v_intent.product_id,
    v_intent.intended_quantity_num, v_intent.intended_quantity_den, v_intent.intended_unit_id,
    null, v_intent.provenance, v_committed_at
  );

  insert into fridge.purchase_item_substitution_allocation (
    purchase_item_substitution_allocation_id, household_id, purchase_item_id, receipt_item_id,
    requested_product_id, received_product_id,
    substituted_quantity_num, substituted_quantity_den, allocation_unit_id,
    conversion_evidence_id, reason, approved_by_user_id, provenance, recorded_at
  ) values (
    p_candidate_substitution_allocation_id, p_household_id, p_purchase_item_id,
    p_candidate_receipt_item_id, v_purchase_item.product_id, v_intent.product_id,
    v_intent.intended_quantity_num, v_intent.intended_quantity_den, v_intent.intended_unit_id,
    p_allocation_conversion_evidence_id, v_reason, null, v_provenance, v_committed_at
  );

  insert into fridge.stock_item (
    stock_item_id, household_id, product_id, batch_id, lifecycle_status,
    placement_anchor_kind, storage_location_id, compartment_id,
    created_at, retired_at, provenance
  ) values (
    p_candidate_stock_item_id, p_household_id, v_intent.product_id, null, 'ACTIVE',
    p_placement_kind::fridge.inventory_placement_anchor_kind,
    p_storage_location_id, p_compartment_id,
    v_committed_at, null, v_provenance
  );

  insert into fridge.inventory_movement (
    inventory_movement_id, household_id, movement_kind, product_id, stock_item_id,
    quantity_num, quantity_den, measurement_unit_id, occurred_at,
    placement_anchor_kind, storage_location_id, compartment_id,
    causation_identity, correction_of_movement_id, provenance, recorded_at
  ) values (
    p_candidate_inventory_movement_id, p_household_id, 'RECEIPT_INGRESS',
    v_intent.product_id, p_candidate_stock_item_id,
    v_intent.intended_quantity_num, v_intent.intended_quantity_den, v_intent.intended_unit_id,
    v_receipt.occurred_at,
    p_placement_kind::fridge.inventory_placement_anchor_kind,
    p_storage_location_id, p_compartment_id,
    p_candidate_receipt_item_id::text, null, v_provenance, v_committed_at
  );

  insert into fridge.receipt_item_inventory_effect (
    receipt_item_inventory_effect_id, household_id, receipt_item_id, inventory_movement_id,
    product_id, quantity_num, quantity_den, measurement_unit_id,
    conversion_evidence_id, recorded_at
  ) values (
    p_candidate_receipt_inventory_effect_id, p_household_id, p_candidate_receipt_item_id,
    p_candidate_inventory_movement_id, v_intent.product_id,
    v_intent.intended_quantity_num, v_intent.intended_quantity_den, v_intent.intended_unit_id,
    null, v_committed_at
  );

  insert into fridge.receipt_item_intent_substitution_materialization (
    household_id, receipt_item_intent_id, receipt_item_id,
    purchase_item_substitution_allocation_id, stock_item_id, inventory_movement_id,
    receipt_item_inventory_effect_id, provenance, recorded_at
  ) values (
    p_household_id, p_receipt_item_intent_id, p_candidate_receipt_item_id,
    p_candidate_substitution_allocation_id, p_candidate_stock_item_id,
    p_candidate_inventory_movement_id, p_candidate_receipt_inventory_effect_id,
    v_provenance, v_committed_at
  );

  perform fridge_internal.assert_purchase_receiving_pool(p_household_id, p_purchase_item_id);
  perform fridge_internal.assert_receipt_item_allocation_pool(p_household_id, p_candidate_receipt_item_id);
  perform fridge_internal.assert_receipt_item_inventory_effects(p_household_id, p_candidate_receipt_item_id);

  update fridge.household_substitution_receipt_materialization_command
     set result_receipt_item_id = p_candidate_receipt_item_id,
         result_purchase_item_substitution_allocation_id = p_candidate_substitution_allocation_id,
         result_stock_item_id = p_candidate_stock_item_id,
         result_inventory_movement_id = p_candidate_inventory_movement_id,
         result_receipt_item_inventory_effect_id = p_candidate_receipt_inventory_effect_id,
         outcome_code = 'MATERIALIZED'
   where household_id = p_household_id
     and command_id = p_command_id;

  perform fridge_internal.register_household_procurement_command_intent(
    p_household_id, p_command_id, 'MATERIALIZE_SUBSTITUTION_RECEIPT_ITEM'
  );

  return query select 'MATERIALIZED'::text,
    p_candidate_receipt_item_id,
    p_candidate_substitution_allocation_id,
    p_candidate_stock_item_id,
    p_candidate_inventory_movement_id,
    p_candidate_receipt_inventory_effect_id;
end;
$$;

comment on function fridge_internal.materialize_substitution_receipt_item(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid
) is
  'BE-06 different-Product substitution receiving boundary. Atomically commits ReceiptItem + substitution allocation + new placed StockItem + positive inventory ingress + typed receipt effect while consuming the shared PurchaseItem receiving pool.';

revoke all on table fridge.receipt_item_intent_physical_materialization
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on table fridge.receipt_item_intent_substitution_materialization
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on table fridge.household_substitution_receipt_materialization_command
  from public, fridge_app, fridge_worker, fridge_readonly;
revoke all on function fridge_internal.materialize_substitution_receipt_item(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid
) from public, fridge_worker, fridge_readonly;
grant execute on function fridge_internal.materialize_substitution_receipt_item(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid
) to fridge_app;

commit;
