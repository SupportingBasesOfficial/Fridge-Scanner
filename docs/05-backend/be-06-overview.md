# FridgeScanner — BE-06 Procurement & Receiving

## Status

BE-06 normative baseline candidate. This phase begins only after formal BE-05 closure on canonical `main @ 4e98cf551cc14568cdca80a38b711152cb3e045d`.

Accepted upstream authority:

- DB-00 — Domain Discovery & Invariants;
- DB-01 — Logical / Relational Database Model;
- DB-02 — PostgreSQL Physical Schema & Enforcement;
- BE-00 — Backend Foundation & Runtime Contracts;
- BE-01 — Application Contracts & Domain Kernel;
- BE-02 — Identity Boundary;
- BE-03 — Household Access Management;
- BE-04 — Storage Topology Management;
- BE-05 — Product Catalog Governance.

BE-06 may consume those contracts. It may not reinterpret identity, Household tenancy, catalog visibility, Product identity, topology ownership, exact quantity semantics, idempotency, RLS, provider-neutral failures or accepted least-privilege rules for procurement convenience.

## Purpose

BE-06 establishes executable application, persistence and delivery contracts for **Purchase and physical Receiving** before broader inventory operations are opened.

Its primary domain objects are:

- `Purchase`;
- `PurchaseItem`;
- `Receipt`;
- `ReceiptItem`;
- `purchase_item_receipt_allocation`;
- `purchase_item_substitution_allocation`;
- `purchase_receiving_exception`;
- `purchase_money_fact` / `purchase_item_money_fact`;
- `purchase_item_pricing_discrepancy`;
- `MeasurementConversionEvidence` when quantity reconciliation depends on contextual conversion;
- `receipt_item_inventory_effect` linking committed received quantity to the inventory entry effects that physically materialize it.

## Domain boundary

Purchase and Receipt are separate concepts.

- Purchase records commercial acquisition truth.
- Receipt records physical intake into a Household.
- a Purchase may be received partially or across multiple Receipts;
- a Receipt may exist without a prior Purchase when the acquisition workflow legitimately has no commercial order;
- purchased quantity and received quantity are never assumed equal merely because a simple UI combines the operations.

BE-06 must not collapse these concepts into one generic “add stock” command.

## Household authority

Procurement and receiving are Household-owned operational truth.

Every BE-06 observation or mutation must execute in one authoritative Household context after platform identity resolution and current Household authorization.

Mutation authority must be explicit and provider-neutral. BE-06 must not derive procurement authority from:

- provider role claims;
- client-supplied Household claims;
- catalog administration capability;
- storage administration capability;
- possession of a Product identifier;
- prior Purchase/Receipt ownership by inference.

The normative decision set defines a dedicated `HOUSEHOLD_PROCUREMENT_ADMINISTER` capability for Purchase/Receipt mutation. Current Household membership may be sufficient for selected observational reads only when explicitly accepted by each read contract.

## Catalog dependency

Every PurchaseItem and ReceiptItem Product must be visible under the accepted BE-05 rules at the decision point:

- current GLOBAL Product; or
- current Product owned by the same Household.

Another Household's private Product is never a valid reference.

A Purchase/Receipt does not gain authority to mutate Product truth. Product retirement, identifiers and compatibility remain BE-05-owned concerns.

Historical Purchase/Receipt facts retain their Product identity even if the Product is later retired.

## Quantity semantics

All authoritative quantities are dimensioned and exact.

BE-06 must preserve DB-00/DB-01 rules:

- quantity is never unitless;
- binary floating point is never authoritative;
- conservation/reconciliation uses exact rational arithmetic;
- dimension-incompatible units cannot be reconciled without an explicitly governed conversion contract;
- contextual/package/cross-dimension conversion requires immutable `MeasurementConversionEvidence`;
- rounding is not allowed to create or erase physical quantity.

Partial receiving is valid. The physical receiving pool for a PurchaseItem is consumed by ordinary ReceiptItem allocations plus governed substitution allocations, after exact valid conversion into one comparison unit.

## Money semantics

A generic unlabeled `price` is not canonical.

BE-06 must preserve explicit monetary roles such as:

- pricing-basis amount;
- line gross;
- line discount;
- line tax/governed line charge;
- line net;
- Purchase-level charges when the source does not allocate them to lines.

Money carries exact amount + explicit currency + semantic role + provenance.

When a basis price exists, its extension into line gross must use exact purchased quantity/conversion semantics and the governed currency rounding policy exactly once at the line-gross boundary.

A source amount that does not reconcile cannot silently replace computed ordinary truth. It becomes an explicit `purchase_item_pricing_discrepancy` or equivalent governed exception with preserved source/computed values and resolution state.

Cross-currency normalization requires explicit rate/source/time context. Silent currency conversion is forbidden.

## Receiving and substitution

When a ReceiptItem references a PurchaseItem, ordinary receiving requires the same Product.

A different received Product is a **substitution**, not an ordinary allocation. Substitution must preserve:

- requested Product;
- received Product;
- exact substituted quantity/unit;
- required conversion evidence;
- reason;
- approval when policy requires it;
- provenance.

Substitution shares the same physical receiving allowance as ordinary allocation. It does not create a second allowance.

## Over-receipt

Ordinary + substitution allocations may not silently exceed the PurchaseItem quantity after exact conversion.

Any excess requires an explicit `purchase_receiving_exception` / over-receipt workflow with governed acceptance or correction semantics. The system must not “fix” excess by rounding, truncating, increasing the PurchaseItem, or silently creating unrelated stock.

## Atomic inventory-ingress seam

A committed ReceiptItem is not complete until its physical inventory entry effects exist.

BE-06 therefore owns the receiving transaction and must coordinate an **atomic, intent-specific inventory-ingress seam** that materializes the received quantity into the accepted physical inventory model.

The seam may create the minimum inventory facts required for receipt ingress, including StockItem/Batch provenance where applicable and immutable InventoryMovement entry effects, but it must not open generic inventory mutation authority.

The atomic invariant is:

```text
committed ReceiptItem quantity
  == exact sum of linked committed receipt inventory entry effects
```

after valid dimension-safe exact conversion into one comparison unit.

If the received quantity must be split by batch, placement or another identity-affecting state, multiple entry effects may be produced, but the split may neither create nor destroy quantity.

BE-06 does **not** implement generic transfer, consumption, waste, count, reconciliation, preparation input/output or arbitrary adjustment. Those remain later inventory/lifecycle phases.

## Placement dependency

Inventory ingress may reference only accepted BE-04 topology:

- a current same-Household StorageLocation; or
- a current same-Household Compartment whose parent StorageLocation is current.

Placement must use the accepted topology serialization/guard model. A receipt cannot bypass a retired/foreign topology target because physical intake “needs somewhere to go”.

A future explicit unplaced receiving mode may be allowed only if it matches the canonical StockItem unplaced state and is normatively accepted before implementation.

## Temporal semantics

Purchase occurrence, Receipt occurrence and recording/commit time are distinct when the source domain makes them distinct.

BE-06 must not substitute request-arrival time for a source occurrence time without an explicit contract.

For state that depends on current serialized truth, fresh database time must be sampled after required locks. Historical/source occurrence times may be caller/import supplied only through a contract that proves their semantic role and provenance.

## Lifecycle and correction

Committed commercial/receiving history is not destructively rewritten.

Corrections must use governed correction/exception facts rather than silent mutation of committed quantities, money, substitutions or inventory effects.

A mutable draft concept may be introduced only if its lifecycle and transition-to-commit semantics are explicit. “Draft” must never be a loophole allowing committed invariants to be bypassed.

## Commands, idempotency and concurrency

Every retriable mutation uses a stable caller-supplied `CommandId`.

Fingerprinting must bind the authoritative Household scope, actor, operation intent and all semantic facts necessary to distinguish a retry from a different command.

Server-generated identities must not become caller-controlled collision oracles.

Committed replay is non-restoring and returns the original committed outcome without reapplying later state.

Lock ordering must be defined before each mutation is accepted. At minimum, BE-06 must serialize:

- Household authority before Household-owned targets;
- Purchase before PurchaseItem operations;
- PurchaseItem before allocations against its receiving pool;
- Receipt before ReceiptItem operations;
- catalog Product references before lifecycle-sensitive commit decisions;
- topology references before current placement-sensitive inventory ingress;
- receiving-pool allocation before deciding ordinary/substitution/over-receipt outcomes.

Two concurrent Receipts may not both consume the same remaining PurchaseItem quantity.

## Least privilege

The ordinary runtime role must not receive broad direct DML over procurement, receiving, stock or inventory tables merely to implement BE-06.

Persistence must remain intent-specific and least-privileged. Any SECURITY DEFINER boundary must:

- use fixed safe search_path semantics;
- revalidate Household authority/current references after serialization locks;
- expose only the minimum required runtime EXECUTE;
- keep internal assertion/trigger helpers inaccessible to ordinary roles;
- normalize failures to provider-neutral application outcomes.

## Initial executable slices

The expected sequence is:

1. BE-06 authority kernel with `HOUSEHOLD_PROCUREMENT_ADMINISTER`;
2. current Purchase/PurchaseItem observational reads;
3. governed CreatePurchase;
4. governed PurchaseItem creation and commercial money/quantity facts;
5. pricing reconciliation/discrepancy boundary where basis pricing is used;
6. governed Receipt creation and ReceiptItem intent;
7. ordinary PurchaseItem↔ReceiptItem allocation with partial receiving;
8. substitution allocation and over-receipt exception workflows;
9. atomic receipt inventory-ingress kernel linking ReceiptItem to exact inventory entry effects;
10. authenticated HTTP delivery and BE-06 phase-exit proof.

This ordering may be refined by review, but Receipt commit may not be accepted before the atomic inventory-ingress invariant is executable.

## Explicit non-goals

BE-06 does not implement:

- generic InventoryTransfer;
- consumption/waste/disposal;
- arbitrary inventory adjustment;
- InventoryCount/Reconciliation;
- recipes/preparations;
- shelf-life evaluation;
- shopping-list fulfillment;
- global catalog governance;
- ProductIdentifier normalization/promotion;
- frontend/deployment.

## Phase-exit condition

BE-06 closes only after an authenticated runtime proof demonstrates at least one real governed receiving flow from authorized Household context through durable commercial/receiving truth into atomic inventory ingress and subsequent observation.

The final proving chain must include, at minimum:

```text
signed authenticated identity
  -> platform PrincipalId
  -> current Household authority
  -> HOUSEHOLD_PROCUREMENT_ADMINISTER
  -> governed Purchase/Receipt intent
  -> exact Product + quantity/money validation
  -> serialized receiving-pool decision
  -> atomic ReceiptItem + inventory ingress effects
  -> durable CommandId/provenance
  -> authenticated observation
```

Adversarial coverage must prove:

- provider claims cannot create procurement authority;
- catalog/storage authority cannot substitute for procurement authority;
- one Household cannot observe/mutate another Household's procurement truth;
- foreign/private Product and topology references do not leak existence;
- partial receiving cannot double-consume one PurchaseItem quantity;
- substitution uses the same physical receiving pool;
- over-receipt cannot silently pass as ordinary receiving;
- quantity conversion is exact and evidence-backed when required;
- money roles/currency are not conflated;
- ReceiptItem quantity exactly reconciles to linked inventory entry effects;
- lost-response retry is safe and non-restoring;
- cross-intent CommandId reuse conflicts;
- least privilege holds;
- exact-HEAD CI/review gates are green with zero unresolved material findings.
