# BE-06 — CreatePurchase Acceptance Contract

## Status

Candidate executable slice for BE-06 Procurement & Receiving. Acceptance requires one immutable final HEAD with DB-02 PostgreSQL 17/18 SUCCESS, BE-00 SUCCESS, independent panoramic/adversarial CLEAN, zero unresolved material findings and explicit owner-authorized squash merge.

This slice consumes the accepted BE-06 normative baseline and the accepted `HOUSEHOLD_PROCUREMENT_ADMINISTER` authority kernel. It does not reopen DB-00/DB-01/DB-02 or BE-00 through BE-05.

## Intent

`CreatePurchase` creates one Household-scoped commercial Purchase and one or more exact PurchaseItems atomically.

This is the first real BE-06 business mutation. It deliberately stops before Receipt, inventory ingress, pricing-basis computation, money facts, substitutions, over-receipt or historical/source-time import.

## Authority

- caller supplies platform `PrincipalId`, HouseholdId and stable CommandId;
- current `HOUSEHOLD_PROCUREMENT_ADMINISTER` is reacquired through the accepted procurement authority kernel;
- Household remains the first serialization anchor;
- provider/JWT roles, catalog authority, storage authority and observed entity IDs do not imply procurement authority;
- only `fridge_app` may execute the intent-specific database boundary;
- worker/readonly have no CreatePurchase execution grant;
- runtime roles receive no direct Purchase/PurchaseItem DML.

## Input contract

`CreatePurchase` requires:

- stable `CommandId`;
- actor `PrincipalId`;
- HouseholdId;
- exact uppercase three-letter transaction currency code;
- at least one ordered item;
- for each item:
  - ProductId;
  - positive already-normalized `ExactRational` quantity;
  - MeasurementUnitId.

The item array order is part of the CreatePurchase command fingerprint solely so generated PurchaseItem identities can be deterministically replayed even when semantically duplicate lines exist. It does not establish an accounting ordering invariant on persisted PurchaseItem.

Malformed runtime JSON is rejected by the narrow public SECURITY DEFINER wrapper before any implementation cast or DML. The full mutation implementation remains private to runtime roles.

## Current reference requirements

At first commitment:

- transaction currency must exist and be ACTIVE;
- every MeasurementUnit must exist and be ACTIVE;
- every Product must be ACTIVE and visible to the Household as either GLOBAL or same-Household private;
- foreign private, retired or missing Product references collapse to provider-neutral NotFound;
- retired/missing unit or currency references collapse to provider-neutral NotFound.

CreatePurchase performs deterministic preliminary Product reference locking before commitment. In addition, every `PurchaseItem` insert or Household/Product reference change passes through a database current-reference trigger that revalidates ACTIVE GLOBAL-or-same-Household visibility and acquires `FOR SHARE` on the Product row.

The `FOR SHARE` lock is held through transaction end. Therefore a concurrent Product lifecycle update using PostgreSQL's ordinary `FOR NO KEY UPDATE` class, and the accepted Household Product retirement writer using `FOR UPDATE`, cannot commit between current-Product validation and PurchaseItem commitment.

This is a creation-time invariant only. A Product may retire after a PurchaseItem has committed; the historical PurchaseItem remains valid and is not rewritten or cascaded.

## Time semantics

This first slice represents a live Purchase occurrence.

`occurred_at` and `recorded_at` are set to the same fresh database `clock_timestamp()` sampled only after Household authority and current reference lock waits.

Client-supplied/backdated occurrence time is intentionally excluded. A future provenance-governed source/import workflow must define validation and provenance before historical occurrence timestamps are accepted.

## Quantity semantics

- authoritative quantity uses exact normalized numerator + positive denominator;
- binary floating point is never used;
- application validates positive canonical `ExactRational` before authority acquisition;
- database revalidates normalized positive rational pairs before persistence;
- quantity and MeasurementUnit are committed together.

## Money/pricing boundary

This slice establishes `transaction_currency_code` only.

It intentionally does **not** create:

- Purchase money facts;
- PurchaseItem money facts;
- pricing basis quantity/unit;
- pricing conversion evidence;
- rounding-policy references;
- pricing discrepancy evidence.

Those fields remain NULL. B6-017 through B6-022 require a separate typed money/pricing slice rather than an ambiguous `price` shortcut.

## Idempotency

BE-06 establishes a Household procurement CommandId registry beginning with `CREATE_PURCHASE`.

The durable semantic fingerprint binds:

- Household scope through the registry/command key;
- actor PrincipalId;
- transaction currency;
- exact ordered semantic item payload: ProductId + normalized numerator/denominator + MeasurementUnitId.

Server-generated candidate PurchaseId/PurchaseItemIds are excluded from semantic equality.

Committed replay:

- is checked before current Currency/Product/Unit revalidation;
- returns the original PurchaseId and ordered PurchaseItemIds;
- does not insert Purchase/PurchaseItems again;
- does not restore or reinterpret later-retired references;
- conflicts when actor, currency, item order or any item semantic fact differs.

Cross-intent CommandId reuse is reserved to the shared registry and uses SQLSTATE `P6I01` / provider-neutral `IdempotencyConflictError`.

## Atomicity

Purchase header, all PurchaseItems, durable command result rows and command registry reservation commit in one transaction.

A crash cannot leave a committed CreatePurchase command with only part of its lines, or committed lines without their Purchase parent.

## Concurrency

First-use retries serialize through the Household authority anchor. Two simultaneous equivalent uses of one CommandId must converge to one physical Purchase and one set of PurchaseItems; the loser replays the committed result rather than leaking a unique-key/internal error.

Product lifecycle concurrency is separately serialized at the PurchaseItem boundary. A transaction that has inserted a current PurchaseItem holds Product `FOR SHARE` until commit; a lifecycle retirement/update must wait. If retirement wins first, a later PurchaseItem insert sees the Product as non-current and fails closed.

## Nondisclosure

Hidden/foreign/retired/missing Product and unavailable governed reference data use provider-neutral NotFound. No foreign ownership detail, catalog scope detail or raw PostgreSQL error is exposed through the application port.

## Deferred catalog visibility

The accepted deferred Household catalog visibility constraint trigger executes at COMMIT. Its trigger function is a narrow SECURITY DEFINER boundary so the underlying catalog assertion helpers remain private from runtime roles while deferred enforcement still succeeds after the intent-specific writer returns.

## Least privilege

- no direct Purchase/PurchaseItem INSERT/UPDATE/DELETE for `fridge_app`, worker or readonly;
- internal command tables remain non-public and non-runtime-readable;
- only the narrow SECURITY DEFINER `create_household_purchase(...)` wrapper receives `fridge_app` EXECUTE;
- the private `create_household_purchase_impl(...)` receives no runtime EXECUTE;
- PurchaseItem current-Product and deferred catalog trigger functions receive no direct runtime EXECUTE;
- no Receipt, StockItem or InventoryMovement permission is introduced.

## Explicit non-goals

- Purchase reads/HTTP delivery;
- Purchase correction/cancellation lifecycle;
- merchant/source identity capture;
- source/backdated occurrence time;
- pricing basis and conversion evidence;
- monetary semantic roles, rounding or discrepancy resolution;
- Receipt/ReceiptItem;
- ordinary/substitution allocation;
- over-receipt exception handling;
- receipt-to-inventory ingress;
- generic inventory authority;
- frontend/deployment.

## Required acceptance proof

The exact final HEAD must prove:

1. DB-02 succeeds on PostgreSQL 17 and 18;
2. BE-00 succeeds completely;
3. application validation preserves exact rational semantics;
4. GLOBAL + same-Household private Product success;
5. exact Purchase + PurchaseItems persisted atomically;
6. pricing/money fields remain outside the slice;
7. replay returns original Purchase/PurchaseItem identities;
8. ordered semantic divergence produces idempotency conflict;
9. foreign/retired Product and retired/missing unit/currency are nondisclosure-safe;
10. member without procurement capability is denied with no persistence;
11. simultaneous same-CommandId first use commits exactly one Purchase;
12. malformed JSON is rejected by the public wrapper before private implementation casts/DML;
13. direct DML and worker/readonly execution remain absent;
14. deferred Household catalog visibility executes successfully at COMMIT without exposing assertion helpers to runtime;
15. PurchaseItem current-Product trigger is SECURITY DEFINER, runtime-inaccessible, enforces ACTIVE GLOBAL-or-same-Household visibility and acquires `FOR SHARE`;
16. a concurrent Product lifecycle update remains blocked while a PurchaseItem transaction holds its current-reference lock;
17. after Product retirement commits, a new PurchaseItem reference fails closed while already-committed historical PurchaseItems remain intact;
18. independent panoramic/adversarial review is CLEAN with zero unresolved material findings.
