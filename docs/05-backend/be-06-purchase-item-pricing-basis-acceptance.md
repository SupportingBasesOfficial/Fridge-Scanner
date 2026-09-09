# FridgeScanner — BE-06 PurchaseItem Pricing Basis Acceptance

## Status

Candidate acceptance contract for the BE-06 pricing-basis sub-slice immediately after accepted PurchaseItem source money facts.

Upstream canonical base: `main @ e73ebb43ebddd73a1252f94cfcfcce1ddd9028f3`.

## Purpose

This slice commits the immutable source pricing basis needed by later B6-019 pricing extension and B6-020 reconciliation. It deliberately does **not** compute line gross and does not execute a `MoneyRoundingPolicy`.

The committed atomic truth is:

- exact positive `pricing_basis_quantity`;
- explicit `pricing_basis_unit_id`;
- immutable `pricing_conversion_evidence_id` when the purchased unit and pricing-basis unit differ;
- one exact nonnegative source money fact with semantic role `PRICING_BASIS`;
- Purchase transaction currency;
- nonblank provenance;
- stable CommandId/replay evidence.

## Authority

Mutation requires current Household membership and `HOUSEHOLD_PROCUREMENT_ADMINISTER` through the accepted BE-06 procurement administration transaction.

Catalog/storage/provider claims do not imply this authority.

## Exact quantity semantics

`pricing_basis_quantity` is a positive canonical `ExactRational` and is persisted as normalized numerator/denominator.

The basis unit is an explicit `MeasurementUnit` identity. Pricing evidence is historical source evidence, so a later source document may still commit against a MeasurementUnit that has since been retired; existence and exact historical identity are required, not current lifecycle status.

## Conversion evidence

If `pricing_basis_unit_id == purchased_unit_id`, `pricing_conversion_evidence_id` must be absent.

If the units differ, conversion evidence is mandatory. The referenced immutable `MeasurementConversionEvidence` must:

- be GLOBAL (`household_id is null`) or belong to the same Household;
- use the PurchaseItem `purchased_unit_id` as source unit;
- bind exactly the committed purchased quantity as its source quantity;
- use the requested pricing-basis unit as target unit;
- bind exactly the requested `pricing_basis_quantity` as its target quantity.

The source and target quantity/unit tuple is physically revalidated at the PurchaseItem persistence boundary. Evidence that is missing, foreign, endpoint-incompatible or quantity-incompatible is rejected nondisclosure-safely; the database uses a private SQLSTATE that the PostgreSQL adapter normalizes to provider-neutral `NotFoundError`.

The command never guesses a factor, selects a conversion rule heuristically, or fabricates evidence.

## Money semantics

The source pricing-basis amount:

- is a canonical nonnegative exact-decimal string (`0`, `19`, `19.99`, etc.); alternate PostgreSQL-numeric spellings such as `01.00`, exponent notation, signs and special numeric values are rejected;
- is validated before the application transaction and revalidated by the least-privileged SQL runtime wrapper, so bypassing the use case cannot change semantic identity through PostgreSQL numeric lexical normalization;
- is stored in the Purchase transaction currency;
- is persisted as `purchase_item_money_fact.semantic_role = 'PRICING_BASIS'`;
- has `is_source_fact = true`;
- has no `money_rounding_policy_id`, because this slice performs no platform computation/rounding;
- requires nonblank source provenance.

Refund/credit semantics require a future explicit role/intent contract and are not inferred through negative amounts.

## Immutability

A PurchaseItem may acquire pricing basis only once.

After `pricing_basis_quantity_num` becomes non-null, the four basis fields are physically guarded against destructive rewrite:

- `pricing_basis_quantity_num`;
- `pricing_basis_quantity_den`;
- `pricing_basis_unit_id`;
- `pricing_conversion_evidence_id`.

A second physical guard also prevents partial pricing-basis state, same-unit evidence attachment, cross-unit commitment without evidence, and any mismatch between the committed PurchaseItem source/target quantity-unit tuple and the referenced immutable conversion evidence.

The source `PRICING_BASIS` money fact is already covered by the accepted immutable PurchaseItem money-fact guard.

Corrections must use future governed correction/discrepancy evidence rather than rewriting history.

## Idempotency and serialization

The shared BE-06 registry gains intent `COMMIT_PURCHASE_ITEM_PRICING_BASIS`.

The fingerprint binds:

- Household scope;
- actor;
- Purchase/PurchaseItem;
- exact pricing-basis quantity;
- pricing-basis unit;
- conversion evidence identity;
- exact source amount;
- provenance.

Server-generated `PurchaseItemMoneyFactId` is result-only and excluded from semantic equality.

Canonical lock direction is:

```text
Household authority
  -> Purchase
  -> PurchaseItem
  -> MeasurementUnit / MeasurementConversionEvidence references
```

Committed replay returns the original money-fact identity without reapplying current target state.

Two different CommandIds attempting to define pricing basis on one PurchaseItem serialize at the PurchaseItem and the loser receives provider-neutral `CONFLICT`.

A conflict/not-found/invalid target does not reserve the CommandId as a successful intent.

## Least privilege

`fridge_app` receives only EXECUTE on the public `fridge_internal.commit_purchase_item_pricing_basis(...)` wrapper.

The governed implementation behind that wrapper is not directly executable by `fridge_app`, worker or readonly roles. The wrapper enforces canonical exact-decimal lexical syntax before delegating.

`fridge_app` receives no direct command-ledger DML and no direct EXECUTE on either pricing-basis trigger helper. Worker/readonly roles receive no pricing-basis mutation capability.

## Required proof

Acceptance requires exact-head evidence that proves at minimum:

- PostgreSQL 17 and 18 migration/integrity success;
- Runtime/TypeScript/unit success;
- least-privileged PostgreSQL integration success;
- same-unit commitment without conversion evidence;
- cross-unit commitment with exact accepted evidence;
- missing/foreign evidence is rejected nondisclosure-safely;
- conversion evidence whose target quantity does not equal the requested pricing-basis quantity is physically rejected with provider-neutral nondisclosure normalization;
- committed replay returns the original fact identity;
- second-command redefinition conflicts;
- concurrent same-CommandId first use produces one physical `PRICING_BASIS` fact;
- cross-intent CommandId reuse conflicts;
- missing procurement capability is unauthorized;
- late source pricing evidence remains committable after historical unit retirement;
- destructive basis rewrite is physically rejected;
- persistence-boundary bypass with a noncanonical amount spelling returns `INVALID_INPUT`, persists no basis/fact and reserves no CommandId;
- panoramic/adversarial review is CLEAN with zero unresolved material findings.

## Explicit non-goals

This slice does not implement:

- computed `LINE_GROSS`;
- `MoneyRoundingPolicy` execution;
- algorithm selection/defaulting;
- source-vs-computed pricing discrepancy;
- line equation reconciliation;
- Purchase-level money allocation;
- cross-currency normalization;
- Receipt/ReceiptItem;
- receiving-pool allocation;
- inventory ingress;
- HTTP/frontend/deployment.

The immediate follow-up is the 5B pricing extension/reconciliation boundary, which must execute only explicitly supported/versioned rounding algorithms and preserve discrepancy evidence when source and computed values differ.
