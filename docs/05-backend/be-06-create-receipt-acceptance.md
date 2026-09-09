# FridgeScanner — BE-06 CreateReceipt Acceptance

## Status

Candidate executable slice **6A — governed CreateReceipt**, refined from BE-06 overview step 6.

Canonical base: `main @ 3389ae1032e8b53a6edef654773a1e490f60374d`.

This slice deliberately creates **Receipt history only**. It does not create `ReceiptItem`, receiving allocation or inventory ingress.

## Why step 6 is split

BE-06 B6-023 and B6-024 require a committed `ReceiptItem` and its physical inventory entry effects to be one atomic business transaction. Inserting an authoritative `fridge.receipt_item` row before the inventory-ingress seam exists would manufacture committed physical-receipt truth with no matching inventory effect.

Therefore the overview sequence is refined as:

- **6A — Governed CreateReceipt**: accepted Receipt aggregate/occurrence history only;
- **6B — ReceiptItem intent**: an explicit pre-commit intent contract that must not masquerade as committed physical quantity;
- later receiving allocation and inventory-ingress slices consume that intent and only then atomically establish committed `ReceiptItem` physical truth.

This refinement uses the overview's explicit allowance to refine ordering while preserving the rule that ReceiptItem commit cannot precede executable atomic inventory ingress.

## Application contract

`CreateReceiptUseCase` requires:

- stable caller-supplied `CommandId`;
- authenticated `PrincipalId`;
- authoritative `HouseholdId`;
- optional `PurchaseId`;
- mandatory nonblank provenance.

The application canonicalizes provenance by trimming surrounding whitespace before authority acquisition/persistence.

A server-generated candidate `ReceiptId` is result identity only and is excluded from semantic retry equality.

## Receipt without Purchase

B6-005 is preserved.

A Receipt may be created without a Purchase. Such a command still requires explicit nonblank provenance identifying the receiving workflow/source context. The system does not fabricate a Purchase merely to satisfy a relational shape.

When `PurchaseId` is supplied:

- it must belong to the authoritative Household;
- it is locked after authority/replay resolution;
- foreign or missing Purchase collapses to nondisclosure-safe `NotFound`;
- no Purchase fields are mutated.

## Temporal semantics

This first executable Receipt creation intent represents a **live receiving occurrence**.

`occurred_at` and `recorded_at` are captured from one database `clock_timestamp()` inside the governed transaction. Caller-supplied/backdated/imported occurrence time is intentionally excluded until a dedicated provenance/validation contract is accepted under B6-032.

## History

A created Receipt is authoritative receiving-occurrence history and is append-only.

`UPDATE` and `DELETE` against `fridge.receipt` are physically rejected. Later correction semantics must use explicit governed correction/compensation facts rather than destructive rewriting.

This does not imply that a Receipt by itself proves any physical quantity was committed. Quantity truth remains owned by future committed ReceiptItem + inventory effects.

## Idempotency

The shared Household procurement CommandId registry adds intent `CREATE_RECEIPT` without removing previously accepted BE-06 intents.

The durable CreateReceipt semantic fingerprint binds:

- authoritative Household scope via command key;
- actor user identity;
- optional Purchase identity;
- canonical provenance.

It deliberately excludes the generated candidate/result Receipt identity.

Committed replay:

- first requires current procurement authority;
- resolves the durable command before current optional-Purchase validation;
- returns the original Receipt identity;
- does not recreate/restore the Receipt;
- conflicts if the same CommandId is reused with changed actor, Purchase or provenance;
- conflicts on cross-intent reuse through SQLSTATE `P6I01` normalized to `IdempotencyConflictError`.

## Authority and lock order

Mutation requires current `HOUSEHOLD_PROCUREMENT_ADMINISTER` through the existing BE-06 procurement-administration transaction boundary.

Canonical order:

1. authoritative Household context;
2. current membership/role/procurement capability serialization through `acquire_household_procurement_admin_authority`;
3. shared BE-06 CommandId intent check;
4. committed replay / command identity lock;
5. optional same-Household Purchase `FOR KEY SHARE`;
6. Receipt + command result persistence;
7. shared CommandId registration.

No provider role/group/Household claim becomes business authority.

## Persistence and least privilege

`fridge_internal.create_household_receipt(...)` is the only new runtime mutation surface.

- `fridge_app`: EXECUTE only;
- `fridge_worker`: no EXECUTE;
- `fridge_readonly`: no EXECUTE;
- runtime roles receive no direct DML over the CreateReceipt command ledger;
- the SECURITY DEFINER boundary uses fixed `search_path = pg_catalog`;
- raw database failures remain normalized at the adapter boundary.

## Explicit non-goals

This slice does **not** implement:

- `ReceiptItem` creation/commit;
- Product or MeasurementUnit validation for received lines;
- ordinary PurchaseItem↔ReceiptItem allocation;
- partial receiving-pool consumption;
- substitution;
- over-receipt exceptions;
- placement;
- StockItem/Batch/InventoryMovement creation;
- `receipt_item_inventory_effect`;
- source expiration;
- caller-supplied occurrence time;
- Receipt reads or HTTP delivery;
- generic inventory mutation authority.

## Required proof

Acceptance requires, on one exact PR HEAD:

- application build/unit proof;
- DB-02 replay on PostgreSQL 17/18;
- BE-00 backend/runtime/integration proof;
- successful linked Receipt with same-Household Purchase;
- successful direct Receipt with no Purchase and explicit provenance;
- no `ReceiptItem` created as a side effect;
- committed replay returning original Receipt identity;
- semantic retry divergence -> idempotency conflict;
- cross-intent CommandId reuse -> idempotency conflict;
- foreign/missing Purchase -> nondisclosure-safe NotFound and no persistence;
- missing procurement capability -> unauthorized;
- Receipt UPDATE/DELETE physically rejected;
- least privilege verified;
- panoramic/adversarial review with zero unresolved material findings.

Any new commit invalidates prior exact-HEAD evidence. Squash merge requires explicit owner authorization and source branch preservation.

## Immediate follow-up

After 6A is accepted, **6B must define explicit ReceiptItem intent semantics without inserting committed `fridge.receipt_item` physical truth**. That contract must be designed to converge into the later atomic ReceiptItem + inventory-ingress transaction rather than creating a draft loophole around B6-023/B6-024/B6-034.
