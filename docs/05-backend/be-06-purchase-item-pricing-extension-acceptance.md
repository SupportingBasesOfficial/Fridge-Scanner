# FridgeScanner — BE-06 PurchaseItem Pricing Extension Acceptance

## Status

Candidate acceptance contract for BE-06 commercial pricing slice 5B, immediately after accepted PurchaseItem pricing-basis commitment.

Upstream canonical base: `main @ d19454030008443671c5ecf1806462d66b56ec68`.

## Purpose

This slice implements B6-019 exact pricing extension and the B6-020 source-versus-system `LINE_GROSS` reconciliation seam.

It converts immutable pricing-basis evidence into one platform-computed `LINE_GROSS`, executes exactly one explicit/versioned monetary rounding boundary, and preserves any conflicting source `LINE_GROSS` as discrepancy evidence instead of overwriting either truth.

## Authority

Mutation requires current Household membership and `HOUSEHOLD_PROCUREMENT_ADMINISTER` through the accepted BE-06 procurement administration transaction.

Provider identity, storage visibility, Product visibility or prior source-fact ownership do not imply procurement administration authority.

## Required upstream truth

The target PurchaseItem must already have:

- exact purchased quantity/unit;
- a committed immutable pricing-basis quantity/unit from slice 5A;
- exactly one source `PRICING_BASIS` money fact;
- cross-unit conversion evidence whenever purchased and pricing-basis units differ.

The corrected 5A physical invariant guarantees that cross-unit evidence binds the exact purchased source quantity/unit and requested pricing target unit. The evidence target quantity is the purchased quantity converted into that target unit; it is intentionally independent from `pricing_basis_quantity`.

A missing pricing basis or missing source `PRICING_BASIS` is a conflict with workflow state; this slice does not synthesize either fact.

## Exact extension

The platform computes the unrounded gross from exact source evidence as:

```text
LINE_GROSS_exact
  = PRICING_BASIS_amount
    × quantity_in_pricing_basis_unit
    ÷ pricing_basis_quantity
```

For same-unit pricing, `quantity_in_pricing_basis_unit` is the exact purchased quantity.

For cross-unit pricing, it is the exact target quantity from the bound immutable `MeasurementConversionEvidence`.

`quantity_in_pricing_basis_unit` and `pricing_basis_quantity` are distinct business facts. For example:

```text
purchased quantity              = 1 kg
converted purchased quantity    = 1000 g
pricing basis                   = 100 g
PRICING_BASIS amount            = 2.00
LINE_GROSS_exact                = 2.00 × 1000 / 100 = 20.00
```

The implementation converts the exact decimal basis amount to an integer coefficient and performs quantity extension as rational integer arithmetic. It does not round the pricing basis, converted quantity, intermediate ratio or intermediate monetary value.

## Monetary rounding boundary

The caller must provide an explicit `MoneyRoundingPolicyId`. The platform never selects, guesses or defaults a policy.

The selected policy must:

- exist;
- use the Purchase transaction currency;
- be effective at `Purchase.occurred_at` (`effective_from <= occurred_at < effective_to`, with null `effective_to` open-ended);
- identify an algorithm/version explicitly implemented by the platform.

The policy lifecycle status at command execution time is not used as historical validity. A policy that was effective for the Purchase remains usable for deterministic historical computation even if it was later retired.

### Supported executable algorithm contract

This slice supports exactly:

```text
rounding_algorithm_code    = DECIMAL_HALF_AWAY_FROM_ZERO
rounding_algorithm_version = 1
```

The implementation does not dynamically execute database text. Adding another algorithm/version requires a reviewed code path and new acceptance evidence.

For the supported contract, the exact rational gross is scaled to the policy decimal scale and rounded with integer quotient/remainder comparison. Ties are rounded away from zero. `LINE_GROSS` is nonnegative in this contract, so the implementation never requires sign-dependent source-money inference.

Rounding occurs exactly once: when producing the computed `LINE_GROSS` monetary fact.

After that governed rounding decision, persisted computed pricing money is canonicalized with PostgreSQL `trim_scale`. The referenced `MoneyRoundingPolicy` remains the authoritative evidence of the decimal scale and algorithm that were executed; insignificant trailing zeros are presentation, not a second monetary value. Thus a scale-2 result mathematically equal to `20.00` is persisted canonically as numeric `20`, while presentation may render `20.00` according to currency/UI rules. PricingDiscrepancy source/computed amounts use the same canonical persistence rule.

## Computed LINE_GROSS

A PurchaseItem may have at most one platform-computed `LINE_GROSS` fact.

The computed fact must carry:

- `semantic_role = 'LINE_GROSS'`;
- `is_source_fact = false`;
- Purchase transaction currency;
- the exact `MoneyRoundingPolicyId` executed;
- nonblank normalized provenance;
- the rounded, canonically persisted platform result.

The existing append-only PurchaseItem money-fact guard makes the committed result immutable.

## Source-versus-computed reconciliation

A source `LINE_GROSS` may independently exist because source monetary evidence is preserved rather than replaced by computation.

B6-020 is arrival-order independent:

- if source `LINE_GROSS` exists before pricing extension, the governed extension compares it while committing the computed fact;
- if source `LINE_GROSS` arrives after the computed fact, an AFTER INSERT reconciliation trigger compares it atomically;
- if source and computed gross are equal, both facts remain preserved and no discrepancy is created;
- if they differ, both facts remain preserved and one OPEN discrepancy is created.

When the source arrives after computation, its immutable money-fact identity deterministically becomes the late-discrepancy identity. No hidden UUID generator or heuristic matching is introduced.

A mismatch discrepancy records:

- source amount;
- computed amount;
- Purchase currency;
- executed rounding policy;
- pricing conversion evidence identity when cross-unit pricing was involved;
- `reason = 'SOURCE_LINE_GROSS_MISMATCH'`;
- `resolution_status = 'OPEN'`;
- null initial resolution provenance.

Neither amount is silently selected as “the winner.”

## Discrepancy history semantics

Pricing discrepancy evidence is history-bearing.

The following fields are physically protected against rewrite:

- Household/Purchase/PurchaseItem identity;
- source amount;
- computed amount;
- currency;
- MoneyRoundingPolicy identity;
- quantity conversion evidence identity;
- reason;
- recorded timestamp.

`DELETE` is physically rejected.

`resolution_status` and `resolution_provenance` are intentionally not frozen by that evidence guard because a future governed discrepancy-resolution boundary may advance resolution state. This slice grants no direct runtime DML path for such resolution.

## Idempotency and serialization

The shared BE-06 command registry gains intent `COMMIT_PURCHASE_ITEM_PRICING_EXTENSION`.

Semantic command identity binds:

- Household;
- actor;
- Purchase/PurchaseItem;
- explicit MoneyRoundingPolicy identity;
- normalized provenance.

Generated `PurchaseItemMoneyFactId` and `PurchaseItemPricingDiscrepancyId` are result-only and excluded from semantic equality.

Canonical lock direction is:

```text
Household authority
  -> Purchase
  -> PurchaseItem
  -> immutable source money facts / MoneyRoundingPolicy / conversion evidence
```

Committed same-command replay returns the original result identities without recomputing or re-reading mutable current lifecycle status.

A different CommandId cannot create a second platform-computed `LINE_GROSS` for the same PurchaseItem.

Invalid, missing or workflow-conflicting targets do not become successful command reservations.

Cross-intent reuse remains governed by the shared BE-06 command registry.

## Least privilege

`fridge_app` receives only EXECUTE on `fridge_internal.commit_purchase_item_pricing_extension(...)`.

It receives no direct command-ledger DML and no direct EXECUTE on discrepancy-history, late-source reconciliation or numeric-canonicalization trigger helpers.

Worker and readonly roles receive no pricing-extension mutation capability.

The adapter normalizes SQL outcomes into application-level provider-neutral errors; unsupported algorithm/version is exposed as invalid input rather than dynamically executed.

## Required proof

Acceptance requires exact-head evidence proving at minimum:

- PostgreSQL 17 and 18 migration/integrity success;
- Runtime/TypeScript/unit success;
- least-privileged PostgreSQL integration success;
- exact nonterminating extension followed by one final rounding boundary (for example `1 / 6 -> 0.17` at scale 2);
- canonical persistence strips insignificant numeric scale while retaining the executed policy identity;
- cross-unit extension where converted purchased quantity differs from pricing-basis quantity (for example `1 kg -> 1000 g`, priced per `100 g`, computes a factor of 10);
- explicit historically effective policy remains usable after lifecycle retirement;
- future/not-effective policy is rejected;
- policy from another currency is rejected;
- unsupported algorithm/version is rejected without execution;
- computed `LINE_GROSS` has `is_source_fact = false` and explicit policy identity;
- one computed gross per PurchaseItem is physically enforced;
- matching source/computed gross produces no discrepancy regardless of arrival order;
- mismatching source/computed gross preserves both facts and creates OPEN discrepancy regardless of arrival order;
- discrepancy evidence fields cannot be rewritten or deleted;
- same-command replay returns original result identities;
- second-command recomputation conflicts;
- missing pricing basis conflicts;
- missing procurement capability is unauthorized;
- zero unresolved material review findings;
- independent panoramic/adversarial review is CLEAN.

## Explicit non-goals

This slice does not implement:

- source monetary-fact ingestion itself;
- pricing-basis commitment itself;
- additional rounding algorithms or implicit algorithm fallback;
- Purchase-level money allocation/reconciliation;
- discount/tax/charge/net equation reconciliation;
- discrepancy resolution workflow;
- cross-currency conversion;
- Receipt/ReceiptItem;
- receiving allocation or over-receipt policy;
- inventory ingress;
- HTTP/API routes;
- frontend or deployment behavior.

The next BE-06 slice must remain downstream of this accepted computed-gross/discrepancy evidence and must not reinterpret or overwrite its history.
