-- FridgeScanner BE-06 boundary hardening
-- 000069_03__purchase_item_pricing_basis_evidence_consistency.sql
-- Physically bind a committed PurchaseItem pricing basis to the exact conversion
-- evidence that proves both its purchased source quantity and pricing-basis target.

begin;

create or replace function fridge_internal.guard_purchase_item_pricing_basis_evidence_consistency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.pricing_basis_quantity_num is null then
    if new.pricing_basis_quantity_den is not null
       or new.pricing_basis_unit_id is not null
       or new.pricing_conversion_evidence_id is not null then
      raise exception using
        errcode = '23514',
        message = 'partial PurchaseItem pricing basis is not allowed';
    end if;
    return new;
  end if;

  if new.pricing_basis_quantity_den is null
     or new.pricing_basis_unit_id is null
     or new.pricing_basis_quantity_num <= 0
     or not fridge_internal.assert_normalized_rational(
       new.pricing_basis_quantity_num,
       new.pricing_basis_quantity_den
     ) then
    raise exception using
      errcode = '23514',
      message = 'PurchaseItem pricing basis must be complete, positive and canonical';
  end if;

  if new.pricing_basis_unit_id = new.purchased_unit_id then
    if new.pricing_conversion_evidence_id is not null then
      raise exception using
        errcode = '23514',
        message = 'same-unit PurchaseItem pricing basis must not carry conversion evidence';
    end if;
    return new;
  end if;

  if new.pricing_conversion_evidence_id is null then
    raise exception using
      errcode = '23514',
      message = 'cross-unit PurchaseItem pricing basis requires conversion evidence';
  end if;

  perform 1
    from fridge.measurement_conversion_evidence e
   where e.measurement_conversion_evidence_id = new.pricing_conversion_evidence_id
     and (e.household_id is null or e.household_id = new.household_id)
     and e.source_unit_id = new.purchased_unit_id
     and e.source_quantity_num = new.purchased_quantity_num
     and e.source_quantity_den = new.purchased_quantity_den
     and e.target_unit_id = new.pricing_basis_unit_id
     and e.target_quantity_num = new.pricing_basis_quantity_num
     and e.target_quantity_den = new.pricing_basis_quantity_den;

  if not found then
    raise exception using
      errcode = 'P6N01',
      message = 'PurchaseItem pricing basis conversion evidence is not eligible';
  end if;

  return new;
end;
$$;

comment on function fridge_internal.guard_purchase_item_pricing_basis_evidence_consistency() is
  'BE-06 physical invariant: same-unit pricing bases carry no conversion evidence; cross-unit pricing bases must reference exact visible evidence whose source and target quantities/units equal the committed PurchaseItem facts. Ineligible evidence raises private SQLSTATE P6N01 for provider-neutral nondisclosure normalization.';

revoke all on function fridge_internal.guard_purchase_item_pricing_basis_evidence_consistency()
  from public, fridge_app, fridge_worker, fridge_readonly;

drop trigger if exists purchase_item_pricing_basis_evidence_consistency on fridge.purchase_item;
create trigger purchase_item_pricing_basis_evidence_consistency
before insert or update on fridge.purchase_item
for each row execute function fridge_internal.guard_purchase_item_pricing_basis_evidence_consistency();

commit;
