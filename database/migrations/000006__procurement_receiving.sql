-- FridgeScanner DB-02
-- 000006__procurement_receiving.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create table fridge.purchase (
  purchase_id uuid primary key,
  household_id uuid not null,
  transaction_currency_code text not null,
  source_identity text,
  occurred_at timestamptz not null,
  merchant_provenance text,
  source_provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint purchase_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint purchase_currency_fk
    foreign key (transaction_currency_code)
    references fridge.currency (currency_code)
    on update restrict on delete restrict,
  constraint purchase_source_identity_nonblank
    check (source_identity is null or btrim(source_identity) <> ''),
  constraint purchase_household_identity_uq
    unique (household_id, purchase_id),
  constraint purchase_household_currency_identity_uq
    unique (household_id, purchase_id, transaction_currency_code)
);

comment on table fridge.purchase is
  'Household-scoped procurement transaction. transaction_currency_code is the canonical transaction currency for purchase and line money facts; source identities/provenance are evidence, not authority boundaries.';

create index purchase_household_occurred_idx
  on fridge.purchase (household_id, occurred_at desc, purchase_id);

create table fridge.purchase_item (
  purchase_item_id uuid primary key,
  household_id uuid not null,
  purchase_id uuid not null,
  product_id uuid not null,
  purchased_quantity_num numeric not null,
  purchased_quantity_den numeric not null,
  purchased_unit_id uuid not null,
  pricing_basis_quantity_num numeric,
  pricing_basis_quantity_den numeric,
  pricing_basis_unit_id uuid,
  pricing_conversion_evidence_id uuid,
  source_identity text,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint purchase_item_purchase_same_household_fk
    foreign key (household_id, purchase_id)
    references fridge.purchase (household_id, purchase_id)
    on update restrict on delete restrict,
  constraint purchase_item_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint purchase_item_unit_fk
    foreign key (purchased_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint purchase_item_pricing_basis_unit_fk
    foreign key (pricing_basis_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint purchase_item_pricing_conversion_fk
    foreign key (pricing_conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint purchase_item_quantity_positive_normalized
    check (
      purchased_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        purchased_quantity_num,
        purchased_quantity_den
      )
    ),
  constraint purchase_item_pricing_basis_all_or_none
    check (
      (
        pricing_basis_quantity_num is null
        and pricing_basis_quantity_den is null
        and pricing_basis_unit_id is null
      )
      or
      (
        pricing_basis_quantity_num is not null
        and pricing_basis_quantity_den is not null
        and pricing_basis_unit_id is not null
        and pricing_basis_quantity_num > 0
        and fridge_internal.assert_normalized_rational(
          pricing_basis_quantity_num,
          pricing_basis_quantity_den
        )
      )
    ),
  constraint purchase_item_source_identity_nonblank
    check (source_identity is null or btrim(source_identity) <> ''),
  constraint purchase_item_household_identity_uq
    unique (household_id, purchase_item_id),
  constraint purchase_item_household_purchase_identity_uq
    unique (household_id, purchase_id, purchase_item_id),
  constraint purchase_item_household_product_identity_uq
    unique (household_id, purchase_item_id, product_id)
);

comment on table fridge.purchase_item is
  'Exact purchased Product quantity. Product visibility to the Household and contextual pricing-conversion semantics are validated by the governed procurement mutation boundary before application roles receive write access.';

create index purchase_item_purchase_idx
  on fridge.purchase_item (household_id, purchase_id, purchase_item_id);

create table fridge.purchase_money_fact (
  purchase_money_fact_id uuid primary key,
  household_id uuid not null,
  purchase_id uuid not null,
  semantic_role text not null,
  amount numeric not null,
  currency_code text not null,
  is_source_fact boolean not null,
  money_rounding_policy_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint purchase_money_fact_purchase_currency_fk
    foreign key (household_id, purchase_id, currency_code)
    references fridge.purchase (
      household_id,
      purchase_id,
      transaction_currency_code
    )
    on update restrict on delete restrict,
  constraint purchase_money_fact_rounding_policy_fk
    foreign key (money_rounding_policy_id)
    references fridge.money_rounding_policy (money_rounding_policy_id)
    on update restrict on delete restrict,
  constraint purchase_money_fact_role_nonblank
    check (btrim(semantic_role) <> ''),
  constraint purchase_money_fact_household_identity_uq
    unique (household_id, purchase_money_fact_id)
);

comment on table fridge.purchase_money_fact is
  'Exact purchase-level monetary fact with explicit semantic role and transaction currency. numeric remains exact; sign semantics and governed monetary reconciliation belong to the typed commit boundary, not display rounding.';

create index purchase_money_fact_purchase_idx
  on fridge.purchase_money_fact (household_id, purchase_id, semantic_role, purchase_money_fact_id);

create table fridge.purchase_item_money_fact (
  purchase_item_money_fact_id uuid primary key,
  household_id uuid not null,
  purchase_id uuid not null,
  purchase_item_id uuid not null,
  semantic_role text not null,
  amount numeric not null,
  currency_code text not null,
  is_source_fact boolean not null,
  money_rounding_policy_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint purchase_item_money_fact_item_same_household_fk
    foreign key (household_id, purchase_id, purchase_item_id)
    references fridge.purchase_item (
      household_id,
      purchase_id,
      purchase_item_id
    )
    on update restrict on delete restrict,
  constraint purchase_item_money_fact_purchase_currency_fk
    foreign key (household_id, purchase_id, currency_code)
    references fridge.purchase (
      household_id,
      purchase_id,
      transaction_currency_code
    )
    on update restrict on delete restrict,
  constraint purchase_item_money_fact_rounding_policy_fk
    foreign key (money_rounding_policy_id)
    references fridge.money_rounding_policy (money_rounding_policy_id)
    on update restrict on delete restrict,
  constraint purchase_item_money_fact_role_nonblank
    check (btrim(semantic_role) <> ''),
  constraint purchase_item_money_fact_household_identity_uq
    unique (household_id, purchase_item_money_fact_id)
);

comment on table fridge.purchase_item_money_fact is
  'Exact line-level monetary fact. Pricing basis, gross, discount, tax/charge and net remain distinct governed semantic roles rather than one ambiguous price column.';

create index purchase_item_money_fact_item_idx
  on fridge.purchase_item_money_fact (
    household_id,
    purchase_item_id,
    semantic_role,
    purchase_item_money_fact_id
  );

create table fridge.purchase_item_pricing_discrepancy (
  purchase_item_pricing_discrepancy_id uuid primary key,
  household_id uuid not null,
  purchase_id uuid not null,
  purchase_item_id uuid not null,
  source_amount numeric not null,
  computed_amount numeric not null,
  currency_code text not null,
  money_rounding_policy_id uuid,
  quantity_conversion_evidence_id uuid,
  reason text not null,
  resolution_status text not null,
  resolution_provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint pricing_discrepancy_item_same_household_fk
    foreign key (household_id, purchase_id, purchase_item_id)
    references fridge.purchase_item (
      household_id,
      purchase_id,
      purchase_item_id
    )
    on update restrict on delete restrict,
  constraint pricing_discrepancy_purchase_currency_fk
    foreign key (household_id, purchase_id, currency_code)
    references fridge.purchase (
      household_id,
      purchase_id,
      transaction_currency_code
    )
    on update restrict on delete restrict,
  constraint pricing_discrepancy_rounding_policy_fk
    foreign key (money_rounding_policy_id)
    references fridge.money_rounding_policy (money_rounding_policy_id)
    on update restrict on delete restrict,
  constraint pricing_discrepancy_conversion_evidence_fk
    foreign key (quantity_conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint pricing_discrepancy_reason_nonblank check (btrim(reason) <> ''),
  constraint pricing_discrepancy_status_nonblank check (btrim(resolution_status) <> ''),
  constraint pricing_discrepancy_household_identity_uq
    unique (household_id, purchase_item_pricing_discrepancy_id)
);

comment on table fridge.purchase_item_pricing_discrepancy is
  'Explicit source-versus-computed pricing evidence. A discrepancy is preserved rather than silently replacing source money with recomputed money.';

create table fridge.receipt (
  receipt_id uuid primary key,
  household_id uuid not null,
  purchase_id uuid,
  source_identity text,
  occurred_at timestamptz not null,
  source_provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receipt_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint receipt_purchase_same_household_fk
    foreign key (household_id, purchase_id)
    references fridge.purchase (household_id, purchase_id)
    on update restrict on delete restrict,
  constraint receipt_source_identity_nonblank
    check (source_identity is null or btrim(source_identity) <> ''),
  constraint receipt_household_identity_uq
    unique (household_id, receipt_id),
  constraint receipt_household_purchase_identity_uq
    unique nulls not distinct (household_id, receipt_id, purchase_id)
);

comment on table fridge.receipt is
  'Authoritative receiving occurrence. purchase_id is optional; when present, governed allocation writes may target only PurchaseItems of that Purchase. A Receipt without Purchase provenance remains valid.';

create index receipt_household_occurred_idx
  on fridge.receipt (household_id, occurred_at desc, receipt_id);

create table fridge.receipt_item (
  receipt_item_id uuid primary key,
  household_id uuid not null,
  receipt_id uuid not null,
  product_id uuid not null,
  received_quantity_num numeric not null,
  received_quantity_den numeric not null,
  received_unit_id uuid not null,
  source_identity text,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receipt_item_receipt_same_household_fk
    foreign key (household_id, receipt_id)
    references fridge.receipt (household_id, receipt_id)
    on update restrict on delete restrict,
  constraint receipt_item_product_fk
    foreign key (product_id)
    references fridge.product (product_id)
    on update restrict on delete restrict,
  constraint receipt_item_unit_fk
    foreign key (received_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint receipt_item_quantity_positive_normalized
    check (
      received_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        received_quantity_num,
        received_quantity_den
      )
    ),
  constraint receipt_item_source_identity_nonblank
    check (source_identity is null or btrim(source_identity) <> ''),
  constraint receipt_item_household_identity_uq
    unique (household_id, receipt_item_id),
  constraint receipt_item_household_receipt_identity_uq
    unique (household_id, receipt_id, receipt_item_id),
  constraint receipt_item_household_product_identity_uq
    unique (household_id, receipt_item_id, product_id)
);

comment on table fridge.receipt_item is
  'Physical Product quantity that arrived. It does not itself consume a PurchaseItem allowance; ordinary and substitution attribution are explicit child relations.';

create index receipt_item_receipt_idx
  on fridge.receipt_item (household_id, receipt_id, receipt_item_id);

create table fridge.purchase_item_receipt_allocation (
  purchase_item_receipt_allocation_id uuid primary key,
  household_id uuid not null,
  purchase_item_id uuid not null,
  receipt_item_id uuid not null,
  product_id uuid not null,
  allocated_quantity_num numeric not null,
  allocated_quantity_den numeric not null,
  allocation_unit_id uuid not null,
  conversion_evidence_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint ordinary_allocation_purchase_product_fk
    foreign key (household_id, purchase_item_id, product_id)
    references fridge.purchase_item (
      household_id,
      purchase_item_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint ordinary_allocation_receipt_product_fk
    foreign key (household_id, receipt_item_id, product_id)
    references fridge.receipt_item (
      household_id,
      receipt_item_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint ordinary_allocation_unit_fk
    foreign key (allocation_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint ordinary_allocation_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint ordinary_allocation_quantity_positive_normalized
    check (
      allocated_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        allocated_quantity_num,
        allocated_quantity_den
      )
    ),
  constraint ordinary_allocation_pair_uq
    unique (purchase_item_id, receipt_item_id),
  constraint ordinary_allocation_household_identity_uq
    unique (household_id, purchase_item_receipt_allocation_id)
);

comment on table fridge.purchase_item_receipt_allocation is
  'Ordinary same-Product receiving attribution. Product equality is structural. Cross-row purchased/received allowance conservation is committed only through the governed transaction-safe receiving mutation boundary.';

create index ordinary_allocation_purchase_idx
  on fridge.purchase_item_receipt_allocation (household_id, purchase_item_id);
create index ordinary_allocation_receipt_idx
  on fridge.purchase_item_receipt_allocation (household_id, receipt_item_id);

create table fridge.purchase_item_substitution_allocation (
  purchase_item_substitution_allocation_id uuid primary key,
  household_id uuid not null,
  purchase_item_id uuid not null,
  receipt_item_id uuid not null,
  requested_product_id uuid not null,
  received_product_id uuid not null,
  substituted_quantity_num numeric not null,
  substituted_quantity_den numeric not null,
  allocation_unit_id uuid not null,
  conversion_evidence_id uuid,
  reason text not null,
  approved_by_user_id uuid,
  provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint substitution_allocation_purchase_product_fk
    foreign key (household_id, purchase_item_id, requested_product_id)
    references fridge.purchase_item (
      household_id,
      purchase_item_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint substitution_allocation_receipt_product_fk
    foreign key (household_id, receipt_item_id, received_product_id)
    references fridge.receipt_item (
      household_id,
      receipt_item_id,
      product_id
    )
    on update restrict on delete restrict,
  constraint substitution_allocation_unit_fk
    foreign key (allocation_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint substitution_allocation_conversion_fk
    foreign key (conversion_evidence_id)
    references fridge.measurement_conversion_evidence (measurement_conversion_evidence_id)
    on update restrict on delete restrict,
  constraint substitution_allocation_approver_fk
    foreign key (approved_by_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint substitution_allocation_products_different
    check (requested_product_id <> received_product_id),
  constraint substitution_allocation_quantity_positive_normalized
    check (
      substituted_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        substituted_quantity_num,
        substituted_quantity_den
      )
    ),
  constraint substitution_allocation_reason_nonblank
    check (btrim(reason) <> ''),
  constraint substitution_allocation_pair_uq
    unique (purchase_item_id, receipt_item_id),
  constraint substitution_allocation_household_identity_uq
    unique (household_id, purchase_item_substitution_allocation_id)
);

comment on table fridge.purchase_item_substitution_allocation is
  'Explicit different-Product receiving exception. Same-Product attribution belongs in purchase_item_receipt_allocation; receiving and substitution pools remain semantically distinct.';

create index substitution_allocation_purchase_idx
  on fridge.purchase_item_substitution_allocation (household_id, purchase_item_id);
create index substitution_allocation_receipt_idx
  on fridge.purchase_item_substitution_allocation (household_id, receipt_item_id);

create table fridge.purchase_receiving_exception (
  purchase_receiving_exception_id uuid primary key,
  household_id uuid not null,
  purchase_item_id uuid,
  receipt_item_id uuid,
  ordinary_allocation_id uuid,
  substitution_allocation_id uuid,
  discrepant_quantity_num numeric not null,
  discrepant_quantity_den numeric not null,
  discrepant_unit_id uuid not null,
  exception_kind text not null,
  resolution_status text not null,
  reason text not null,
  approved_by_user_id uuid,
  correction_provenance text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint receiving_exception_household_fk
    foreign key (household_id)
    references fridge.household (household_id)
    on update restrict on delete restrict,
  constraint receiving_exception_purchase_item_fk
    foreign key (household_id, purchase_item_id)
    references fridge.purchase_item (household_id, purchase_item_id)
    on update restrict on delete restrict,
  constraint receiving_exception_receipt_item_fk
    foreign key (household_id, receipt_item_id)
    references fridge.receipt_item (household_id, receipt_item_id)
    on update restrict on delete restrict,
  constraint receiving_exception_ordinary_allocation_fk
    foreign key (household_id, ordinary_allocation_id)
    references fridge.purchase_item_receipt_allocation (
      household_id,
      purchase_item_receipt_allocation_id
    )
    on update restrict on delete restrict,
  constraint receiving_exception_substitution_allocation_fk
    foreign key (household_id, substitution_allocation_id)
    references fridge.purchase_item_substitution_allocation (
      household_id,
      purchase_item_substitution_allocation_id
    )
    on update restrict on delete restrict,
  constraint receiving_exception_unit_fk
    foreign key (discrepant_unit_id)
    references fridge.measurement_unit (measurement_unit_id)
    on update restrict on delete restrict,
  constraint receiving_exception_approver_fk
    foreign key (approved_by_user_id)
    references fridge.user_profile (user_id)
    on update restrict on delete restrict,
  constraint receiving_exception_context_present
    check (
      purchase_item_id is not null
      or receipt_item_id is not null
      or ordinary_allocation_id is not null
      or substitution_allocation_id is not null
    ),
  constraint receiving_exception_allocation_kind_xor
    check (not (ordinary_allocation_id is not null and substitution_allocation_id is not null)),
  constraint receiving_exception_quantity_positive_normalized
    check (
      discrepant_quantity_num > 0
      and fridge_internal.assert_normalized_rational(
        discrepant_quantity_num,
        discrepant_quantity_den
      )
    ),
  constraint receiving_exception_kind_nonblank check (btrim(exception_kind) <> ''),
  constraint receiving_exception_status_nonblank check (btrim(resolution_status) <> ''),
  constraint receiving_exception_reason_nonblank check (btrim(reason) <> ''),
  constraint receiving_exception_household_identity_uq
    unique (household_id, purchase_receiving_exception_id)
);

comment on table fridge.purchase_receiving_exception is
  'Explicit receiving discrepancy/over-receipt evidence. Ordinary fulfillment never silently absorbs over-receipt; cross-row allowance decisions are made atomically by the governed receiving mutation boundary.';

create index receiving_exception_purchase_item_idx
  on fridge.purchase_receiving_exception (household_id, purchase_item_id)
  where purchase_item_id is not null;
create index receiving_exception_receipt_item_idx
  on fridge.purchase_receiving_exception (household_id, receipt_item_id)
  where receipt_item_id is not null;

commit;
