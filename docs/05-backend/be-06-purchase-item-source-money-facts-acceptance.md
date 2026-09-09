# BE-06 — PurchaseItem Source Money Facts Acceptance

## Status

Acceptance candidate for the first executable BE-06 commercial-money slice after accepted `CreatePurchase` and Household Purchase/PurchaseItem observational reads.

This slice implements **source monetary evidence in the Purchase transaction currency**. It does not execute pricing-basis extension, governed rounding, discrepancy resolution, cross-currency normalization or Receipt/Receiving.

## Accepted intent

The provider-neutral retriable mutation intent is:

`COMMIT_PURCHASE_ITEM_SOURCE_MONEY_FACTS`

It consumes the accepted `HOUSEHOLD_PROCUREMENT_ADMINISTER` authority boundary and the shared BE-06 Household-scoped CommandId registry.

## Canonical source roles in this command

This command accepts at most one fact for each of:

- `LINE_GROSS` — source pre-discount, pre-tax/charge line gross;
- `LINE_DISCOUNT` — source line discount total;
- `LINE_TAX` — source line tax total;
- `LINE_CHARGE` — source governed non-tax line charge total;
- `LINE_NET` — source final line net.

The underlying fact table remains extensible for later governed roles. This command does not globally reinterpret every historical `semantic_role` string as one closed enum.

## Exact money and sign semantics

Amounts cross the application boundary as exact decimal strings. No JavaScript number/binary floating point participates in authoritative money.

The application canonicalizes equivalent decimal spellings for command identity, for example `19.9900` and `19.99` become the same semantic amount. PostgreSQL persists the exact numeric value.

For this intent, all five accepted source roles require **nonnegative amounts**. Zero is valid evidence. No accepted BE-06 contract currently defines negative PurchaseItem source gross, discount, tax, charge or net as refund/credit semantics, so this command must fail closed rather than inventing that meaning. A future refund, credit memo or reversing-commercial-fact workflow requires an explicit governed role/intent and may not be smuggled through a negative ordinary source amount.

The nonnegative rule is enforced twice:

- application validation rejects negative decimal strings before opening a transaction;
- the least-privileged SQL wrapper rejects a negative amount with provider-neutral `INVALID_INPUT` before delegating to the private persistence implementation.

Facts committed by this slice:

- use the existing Purchase `transaction_currency_code`;
- have `is_source_fact = true`;
- have no `money_rounding_policy_id` because no platform rounding/computation is asserted;
- require nonblank source provenance.

Cross-currency source evidence remains outside this slice because the current `purchase_item_money_fact` relation is transaction-currency constrained and BE-06 forbids silent currency conversion.

## Authority and nondisclosure

Every first execution:

1. requires the exact authoritative Household context;
2. reacquires current Household membership, current role and `HOUSEHOLD_PROCUREMENT_ADMINISTER` through the accepted procurement authority kernel;
3. resolves committed replay before current target checks;
4. reserves the shared BE-06 CommandId intent;
5. locks the Purchase before the PurchaseItem;
6. collapses missing/foreign Purchase/PurchaseItem identity to `NOT_FOUND`.

Observation authority does not imply this mutation authority.

## Historical-reference behavior

This mutation adds evidence to an already committed PurchaseItem. It therefore does **not** revalidate current Product or MeasurementUnit lifecycle state.

A Product or unit that was valid when the PurchaseItem committed may later be retired without making the historical commercial line or later-arriving source invoice evidence invalid.

The mutation must never create, repair or mutate catalog/unit truth.

## Append-only and correction semantics

A source semantic role may be committed at most once for one PurchaseItem. A second CommandId attempting to redeclare the same source role receives provider-neutral `CONFLICT`.

Committed `purchase_item_money_fact` rows are physically immutable through a database trigger. Corrections do not update/delete the original source fact and do not create a second ordinary source role. Later BE-06 pricing discrepancy/correction workflows must preserve the original source value and add explicit resolution evidence.

## Idempotency and concurrency

The semantic fingerprint binds:

- Household scope;
- actor;
- PurchaseId;
- PurchaseItemId;
- ordered canonical source facts: semantic role, exact amount and provenance.

Server-generated `PurchaseItemMoneyFactId` candidates are not semantic identity.

Committed replay returns the original fact IDs and does not insert again. Same CommandId + different semantics is `IDEMPOTENCY_CONFLICT`. Cross-intent reuse is also an idempotency conflict through the shared BE-06 registry.

Concurrent first use of the same CommandId converges on exactly one physical source-fact result set. Same-intent first use is serialized by the dedicated command row; cross-intent use is serialized by the shared BE-06 registry. PurchaseItem mutation follows the canonical `Purchase → PurchaseItem` lock order.

## Least privilege

- no direct INSERT/UPDATE/DELETE is granted to `fridge_app` for PurchaseItem money facts;
- command ledger tables remain inaccessible to ordinary runtime roles;
- only `fridge_app` receives EXECUTE on the public `commit_purchase_item_source_money_facts(...)` wrapper;
- the full `commit_purchase_item_source_money_facts_impl(...)` implementation is private from `fridge_app`, worker and readonly roles;
- worker and readonly do not receive the wrapper capability;
- the immutability trigger helper is not directly executable by runtime roles.

## Explicit non-goals

This slice does **not** implement:

- `PRICING_BASIS` commitment;
- pricing-basis quantity/unit mutation;
- MeasurementConversionEvidence selection/creation;
- basis-price extension into line gross;
- MoneyRoundingPolicy execution;
- source-vs-computed discrepancy;
- line equation reconciliation;
- Purchase-level discounts/taxes/fees/charges;
- refund/credit/reversal semantics through negative ordinary source roles;
- cross-currency normalization;
- Receipt/ReceiptItem;
- receiving allocations or inventory ingress;
- HTTP/frontend delivery.

## Exit proof for this slice

Acceptance requires one exact candidate HEAD where:

- DB-02 passes PostgreSQL 17 and 18;
- BE-00 passes Runtime/TypeScript/Unit, Container and PostgreSQL/RLS integration;
- application proof rejects negative ordinary source amounts before opening a transaction;
- persistence proof bypasses the use case and still receives provider-neutral `INVALID_INPUT` for a negative source amount with zero fact persisted;
- integration proves authorized commit, deterministic replay, same-CommandId first-use convergence, cross-intent conflict with zero money fact, idempotency conflict, duplicate-role conflict, authority denial, foreign/missing nondisclosure, historical Product/unit retirement tolerance and physical fact immutability;
- panoramic/adversarial review has zero unresolved material findings;
- squash merge is performed only after explicit owner authorization and the source branch remains preserved.
