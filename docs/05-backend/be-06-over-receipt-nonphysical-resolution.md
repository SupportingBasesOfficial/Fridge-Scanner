# BE-06 — Nonphysical Over-receipt Resolution

## Status

Executable resolution contract for the final nonphysical portion of BE-06 step 8.

A previously `OVER_RECEIPT / DETECTED` exception may be resolved without creating inventory truth through exactly one of two append-only outcomes:

- `REJECTED_NO_INGRESS`;
- `SUPERSEDED_DETECTION`.

The original detected exception remains immutable in both cases.

## One resolution truth

`fridge.purchase_receiving_exception_resolution` remains the single resolution relation for over-receipt.

Physical acceptance kinds retain their exact allocation/effect semantics:

```text
ACCEPTED_ORDINARY_EXCESS
ACCEPTED_SUBSTITUTION_EXCESS
```

Nonphysical kinds contain no ReceiptItem, allocation, accepted-excess quantity/unit or inventory effect identity:

```text
REJECTED_NO_INGRESS
SUPERSEDED_DETECTION
```

Exactly one resolution may exist for a detected exception.

## REJECTED_NO_INGRESS

This outcome means the presented excess was refused or returned before inventory ingress.

It commits only resolution evidence:

- exact detected exception;
- exact detected ReceiptItemIntent;
- exact PurchaseItem;
- current authorized actor;
- canonical nonblank resolution reason;
- canonical nonblank provenance;
- immutable recorded time.

It creates no physical receiving truth.

The linked ReceiptItemIntent remains terminally blocked from ordinary or substitution materialization. A caller cannot bypass the rejection by presenting the same intent against another PurchaseItem that has available receiving allowance.

## SUPERSEDED_DETECTION

This outcome means the historical DETECTED fact is retained but no longer represents current receiving truth.

Supersession is not an administrative override. Before commit, the governed boundary serializes the PurchaseItem and invokes the accepted-excess-aware current receiving calculation for the exact detected intent and pinned conversion evidence.

`SUPERSEDED_DETECTION` is permitted only when:

```text
required incremental accepted excess = 0
```

If current truth still requires any positive over-receipt acceptance, supersession fails.

After a valid supersession, the historical detection barrier is removed for that intent. This does not materialize anything and does not grant receiving allowance. A later ordinary or substitution materializer must still pass its normal Product, Purchase, conversion, placement, conservation, idempotency and least-privilege rules.

## Historical truth

Neither nonphysical outcome updates or deletes:

- `purchase_receiving_exception`;
- `ReceiptItemIntent`;
- `PurchaseItem`;
- prior allocations;
- inventory history.

`purchase_receiving_exception.resolution_status` therefore remains the historical value `DETECTED`. Current resolution is represented only by the append-only resolution fact.

## Governed command

`ResolveOverReceiptWithoutIngress` requires:

- stable `CommandId`;
- current platform actor;
- Household;
- existing immutable detected exception bridge;
- one allowed nonphysical resolution kind;
- nonblank reason;
- nonblank provenance;
- `HOUSEHOLD_PROCUREMENT_ADMINISTER`.

The caller does not supply ReceiptItemIntentId, PurchaseItemId, conversion evidence, discrepancy, physical IDs or inventory quantities. Those are either derived from detection evidence or intentionally absent.

## Idempotency

Semantic equality binds:

- actor;
- detected exception;
- resolution kind;
- canonical reason;
- canonical provenance.

The generated resolution ID is result-only.

Committed replay returns the original resolution identity and kind. Reuse of the same CommandId with different semantic input is an idempotency conflict.

## Atomicity and physical absence

A successful nonphysical resolution transaction commits together:

1. command ledger PENDING evidence;
2. one append-only nonphysical resolution fact;
3. command ledger RESOLVED result;
4. shared procurement CommandId registration.

It does not insert:

- ReceiptItem;
- ordinary allocation;
- substitution allocation;
- StockItem;
- InventoryMovement;
- ReceiptItemInventoryEffect;
- physical materialization bridge.

Any failure rolls back the full transaction.

## DETECTED claim barrier

The shared physical claim interprets resolution as follows:

```text
unresolved DETECTED
  -> blocked except exact same-transaction acceptance authority

REJECTED_NO_INGRESS
  -> terminally blocked

SUPERSEDED_DETECTION
  -> historical barrier removed
  -> normal materializer rules still apply

ACCEPTED_*_EXCESS
  -> already physically resolved; no second materialization
```

## Least privilege

`fridge_app` receives EXECUTE only on the dedicated governed boundary.

No runtime role receives direct DML on the command ledger or resolution table. Private conservation and physical-claim helpers remain non-executable by runtime roles.

## Non-goals

This slice does not:

- return stock that was already ingressed;
- reverse an accepted physical receipt;
- mutate an existing accepted resolution;
- enlarge PurchaseItem purchased quantity;
- rewrite detection history;
- implement generic inventory correction;
- implement HTTP/frontend delivery.

A return after physical inventory ingress belongs to a separate inventory/correction workflow, not `REJECTED_NO_INGRESS`.

## Gate

Acceptance requires one exact PR HEAD with:

- DB-02 PostgreSQL 17 + 18 SUCCESS;
- BE-00 SUCCESS;
- rejection integration proving zero physical effects and terminal claim barrier;
- supersession integration proving revalidation and later normal materialization;
- stable replay/idempotency behavior;
- zero unresolved material review threads;
- panoramic/adversarial CLEAN;
- branch 0 behind canonical `main`.

Squash merge requires explicit owner authorization. Source branch is preserved.
