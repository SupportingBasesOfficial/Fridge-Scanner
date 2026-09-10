# BE-06 — Authenticated Delivery and Phase Exit

Status: **CANDIDATE — not accepted until PR exact-HEAD gates and review are clean**

## 1. Purpose

This document defines the closing delivery contract for BE-06 Procurement & Receiving. It does not create a new business model. It exposes the already accepted BE-06 application boundaries through authenticated HTTP and proves that the production composition root reaches those boundaries using the least-privileged PostgreSQL runtime.

The phase may be marked CLOSED only when the candidate HEAD proves the complete chain:

```text
signed authentication evidence
  -> trusted external identity verification
  -> platform PrincipalId mapping
  -> current Household membership/context
  -> HOUSEHOLD_PROCUREMENT_ADMINISTER where mutation requires it
  -> governed procurement/receiving use case
  -> least-privileged fridge_app persistence boundary
  -> exact immutable business/physical facts
  -> durable CommandId replay semantics
  -> authenticated observation / nondisclosure proof
```

Provider-side role, Household or privilege claims are evidence neither of platform authority nor of tenancy.

## 2. HTTP delivery surface

### 2.1 Purchase observation

- `GET /households/:householdId/purchases`
- `GET /households/:householdId/purchases/:purchaseId`

These are current Household observations. They require authenticated platform identity and current Household authorization, but do not require procurement mutation capability merely to observe current permitted truth.

### 2.2 Purchase creation

- `POST /households/:householdId/purchases`

Body carries a caller CommandId, transaction currency and one or more Product/quantity/unit lines. Candidate Purchase/PurchaseItem identifiers are generated server-side. Quantities cross HTTP as exact rational decimal components:

```json
{ "numerator": "3", "denominator": "2" }
```

The transport never converts exact quantities to floating point.

### 2.3 PurchaseItem source money facts

- `POST /households/:householdId/purchases/:purchaseId/items/:purchaseItemId/source-money-facts`

Accepted source roles remain explicit:

- `LINE_GROSS`
- `LINE_DISCOUNT`
- `LINE_TAX`
- `LINE_CHARGE`
- `LINE_NET`

Amounts cross HTTP as exact decimal strings. The route does not parse them into JavaScript `number`; canonical money validation remains in the accepted application boundary.

### 2.4 PurchaseItem pricing basis

- `POST /households/:householdId/purchases/:purchaseId/items/:purchaseItemId/pricing-basis`

Carries exact pricing-basis quantity/unit, optional accepted measurement-conversion evidence, basis amount and provenance. It does not invent a generic unit-price field.

### 2.5 PurchaseItem pricing extension / reconciliation

- `POST /households/:householdId/purchases/:purchaseId/items/:purchaseItemId/pricing-extension`

Carries the accepted MoneyRoundingPolicy identity and provenance. Result preserves the committed PurchaseItemMoneyFact identity and optional immutable pricing discrepancy identity.

### 2.6 Receipt and operational intent

- `POST /households/:householdId/receipts`
- `POST /households/:householdId/receipts/:receiptId/item-intents`

Receipt remains the receiving occurrence/history envelope. ReceiptItemIntent remains an operational declaration only; creating it proves no physical inventory ingress.

### 2.7 Ordinary physical materialization

- `POST /households/:householdId/receipt-item-intents/:receiptItemIntentId/materialize-ordinary`

This route delegates to the accepted ordinary materialization kernel. A successful result atomically identifies:

- ReceiptItem
- PurchaseItemReceiptAllocation
- new placed StockItem
- positive `RECEIPT_INGRESS` InventoryMovement
- ReceiptItemInventoryEffect

The HTTP layer has no generic stock write capability.

### 2.8 Substitution physical materialization

- `POST /households/:householdId/receipt-item-intents/:receiptItemIntentId/materialize-substitution`

The route preserves mandatory substitution reason/provenance and delegates to the accepted different-Product substitution boundary. Substitution consumes the same serialized receiving allowance as ordinary allocation and cannot be used to smuggle an over-receipt.

### 2.9 Over-receipt detection

- `POST /households/:householdId/receipt-item-intents/:receiptItemIntentId/over-receipt-exceptions`

Detection is explicit and nonphysical. It records immutable discrepancy evidence and does not create ReceiptItem, StockItem or InventoryMovement.

### 2.10 Over-receipt physical acceptance

- `POST /households/:householdId/over-receipt-exceptions/:purchaseReceivingExceptionId/accept-ordinary`
- `POST /households/:householdId/over-receipt-exceptions/:purchaseReceivingExceptionId/accept-substitution`

Physical acceptance is a distinct governed decision. It does not enlarge or rewrite PurchaseItem purchased quantity. Accepted physical excess is committed with ReceiptItem and inventory ingress/effect in the same transaction.

### 2.11 Over-receipt nonphysical resolution

- `POST /households/:householdId/over-receipt-exceptions/:purchaseReceivingExceptionId/resolve-without-ingress`

Accepted outcomes:

- `REJECTED_NO_INGRESS`
- `SUPERSEDED_DETECTION`

Rejection is terminal for that detected intent and creates no inventory truth. Supersession is allowed only when the accepted-excess-aware current receiving calculation says zero incremental excess is required; it removes only the historical detection barrier and does not itself materialize inventory.

## 3. Trust and tenancy rules

Every delivered route resolves the authenticated PrincipalId from trusted authentication evidence before invoking application logic.

The following remain forbidden:

- trusting `x-principal-id` or equivalent caller identity headers;
- trusting provider JWT role claims as platform roles/capabilities;
- trusting provider Household claims as authoritative tenancy;
- returning a distinguishable forbidden-vs-absent response for cross-Household protected resources;
- granting direct runtime DML to procurement/receiving truth tables;
- accepting client-generated physical result identifiers as authoritative outcomes.

Mutation authority remains database-backed current authority through the accepted BE-06 Household procurement administration kernel.

## 4. Exactness rules at transport

- quantities are exact rational numerator/denominator strings;
- money amounts are exact decimal strings;
- MeasurementUnit, conversion-evidence and rounding-policy identities are explicit;
- optional fields are omitted rather than serialized as semantic `undefined` values;
- server-generated result identities remain result-only;
- provenance is carried explicitly to the accepted use case and canonicalized there.

## 5. Runtime composition

Production composition uses:

- authenticated principal resolver;
- `PgDatabase` with configured runtime capability role;
- `PgHouseholdProcurementAdministrationTransactionManager`;
- existing accepted Purchase/Receipt/pricing/receiving adapters;
- server-side UUID generation for candidate result identities.

The HTTP layer does not execute SQL and does not duplicate receiving, pricing, conservation, idempotency or tenancy rules.

## 6. Phase-exit executable proof

`apps/api/src/be06-procurement-receiving-delivery.integration.ts` proves the ordinary critical path against real PostgreSQL least privilege:

1. signed ES256 authentication evidence is verified;
2. trusted subject maps to platform PrincipalId;
3. deliberately privileged provider role/Household claims do not grant authority;
4. a current member lacking procurement capability cannot create a Purchase;
5. authorized administrator creates a Purchase with exact Product/quantity/unit truth;
6. lost-response Purchase retry returns the committed identities;
7. authorized administrator creates Receipt and ReceiptItemIntent;
8. ordinary materialization returns the five durable physical identities;
9. lost-response physical retry returns the same committed identities instead of restoring inventory;
10. authenticated Purchase observation sees the committed PurchaseItem exact quantity;
11. foreign Household context collapses to nondisclosing NOT_FOUND semantics.

`apps/api/src/procurement-pricing-routes.test.ts` separately proves transport-level preservation of exact decimal money text and exact-rational pricing-basis quantity before application canonicalization.

The deeper database integration suite remains authoritative for:

- exact physical ReceiptItem/allocation/movement/effect reconciliation;
- ordinary/substitution shared receiving pools;
- cross-unit exact conversion evidence;
- substitution Product semantics;
- over-receipt detection and all four resolution families;
- accepted-excess-aware conservation;
- RLS and least privilege;
- shared CommandId intent governance;
- concurrency serialization and replay behavior.

## 7. Exit gates

BE-06 may be changed from CANDIDATE to CLOSED only if all are true on one immutable PR HEAD:

1. Runtime / TypeScript / Unit — SUCCESS;
2. Container Smoke / Non-root / Health Semantics — SUCCESS;
3. PostgreSQL 17 Contract + Backend RLS Integration — SUCCESS;
4. all applicable DB-02 proofs remain green through BE-00 replay;
5. zero unresolved material review threads;
6. panoramic/adversarial review finds no material gap against accepted B6 invariants;
7. automated Codex review of the exact candidate HEAD reports no material issues, or every finding is dispositioned with evidence and the final exact HEAD is reviewed again;
8. branch is zero commits behind `main` at the final gate;
9. squash merge is separately and explicitly authorized by the owner.

Until those conditions are met, this document records the intended closing contract only and BE-06 remains ACTIVE.
