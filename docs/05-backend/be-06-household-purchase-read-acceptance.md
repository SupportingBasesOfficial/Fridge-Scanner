# FridgeScanner — BE-06 Household Purchase observational reads acceptance

## Scope

This slice adds provider-neutral observational reads for committed Household `Purchase` / `PurchaseItem` commercial history after accepted `CreatePurchase`.

It does not add Purchase mutation, money facts, Receipt/ReceiptItem, allocation, inventory ingress or HTTP delivery.

## Accepted contract

- observation requires current exact Household membership through the accepted Household transaction boundary;
- `HOUSEHOLD_PROCUREMENT_ADMINISTER` is not required for read-only observation;
- list scope is exactly one Household;
- lookup of a foreign-Household or missing Purchase collapses to `NOT_FOUND`;
- list uses bounded keyset pagination ordered by `occurred_at DESC, purchase_id DESC`;
- cursor identity is exactly the last included `(occurredAt, purchaseId)` pair and no total-count metadata is exposed;
- application `pageSize` is bounded to 1..100 and the persistence reader fetches at most one lookahead row;
- malformed, partial or non-canonical cursors fail as `InvalidInputError` before a database transaction is opened;
- Purchase observation preserves `transaction_currency_code`, `occurred_at`, `recorded_at` and page-local item cardinality;
- PurchaseItem observation preserves exact normalized rational quantity, `ProductId`, `MeasurementUnitId` and `recorded_at`;
- committed Purchase history is not reinterpreted through later Product or MeasurementUnit lifecycle changes;
- current membership is revalidated inside the PostgreSQL read boundary, not trusted only from earlier request/context state;
- runtime reads cross intent-specific SECURITY DEFINER functions and return provider-neutral outcomes.

## Historical semantics

`Purchase` and `PurchaseItem` have no ACTIVE/RETIRED lifecycle in the accepted schema. “Current read” therefore means current authorization to observe historical committed facts, not filtering history to current catalog/reference state.

A Product or MeasurementUnit retirement after the Purchase does not erase or hide the original commercial fact.

## Pagination semantics

Purchase history is an unbounded operational stream, so an unbounded list is not accepted. The canonical sort key is:

```text
occurred_at DESC, purchase_id DESC
```

The next page selects strict tuples lower than the previous page's last included key. The UUID tie-breaker prevents duplicate/omitted rows when multiple Purchases share one occurrence timestamp. No `COUNT(*)`, global total or foreign-Household metadata is returned.

The application boundary parses both cursor components through the canonical domain parsers before opening a transaction. A malformed cursor cannot silently degrade to the first page.

## Non-goals

- Purchase/PurchaseItem money facts;
- pricing-basis and discrepancy reads;
- receipt or receiving-pool state;
- HTTP routes;
- mutation capability changes;
- generic inventory authority.

## Acceptance gate

Acceptance requires exact-final-HEAD DB-02 PostgreSQL 17/18 and BE-00 success, plus independent panoramic/adversarial review with zero unresolved material findings. Any new commit invalidates earlier gate evidence. Squash merge still requires explicit owner authorization and the source branch is preserved.
