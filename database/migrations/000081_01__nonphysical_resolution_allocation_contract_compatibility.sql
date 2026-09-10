-- FridgeScanner BE-06
-- 000081_01__nonphysical_resolution_allocation_contract_compatibility.sql
-- Preserve the accepted allocation-kind constraint identity while extending
-- resolution truth to nonphysical outcomes.

begin;

alter table fridge.purchase_receiving_exception_resolution
  add constraint receiving_exception_resolution_allocation_kind_ck
    check (
      (resolution_kind = 'ACCEPTED_ORDINARY_EXCESS'
        and ordinary_allocation_id is not null
        and substitution_allocation_id is null)
      or
      (resolution_kind = 'ACCEPTED_SUBSTITUTION_EXCESS'
        and ordinary_allocation_id is null
        and substitution_allocation_id is not null)
      or
      (resolution_kind in ('REJECTED_NO_INGRESS', 'SUPERSEDED_DETECTION')
        and ordinary_allocation_id is null
        and substitution_allocation_id is null)
    );

comment on constraint receiving_exception_resolution_allocation_kind_ck
  on fridge.purchase_receiving_exception_resolution is
  'Compatibility-preserved BE-06 allocation-kind contract. Accepted ordinary/substitution resolutions bind exactly their matching allocation kind; nonphysical resolutions bind no allocation.';

commit;
