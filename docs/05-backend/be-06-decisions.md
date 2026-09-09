# FridgeScanner — BE-06 Procurement & Receiving Decisions

## Status

Normative decision set for BE-06. These decisions refine, but do not override, accepted DB-00/DB-01/DB-02 and BE-00 through BE-05 authority.

The accepted upstream canonical main at phase start is `4e98cf551cc14568cdca80a38b711152cb3e045d`.

## B6-001 — Household is the procurement/receiving authority scope

Every Purchase, Receipt and related operational fact belongs to exactly one Household. Household scope is explicit durable truth, never inferred from provider claims, Product ownership, storage placement or request routing alone.

## B6-002 — Dedicated procurement mutation capability

BE-06 introduces provider-neutral `HOUSEHOLD_PROCUREMENT_ADMINISTER` for Purchase/Receipt mutation. Membership, storage administration and catalog administration do not imply this capability.

No concrete production role mapping is guessed by code. Capability assignment remains governed reference/policy data.

## B6-003 — Current authority is revalidated at execution time

Mutation requires current Household membership, current role and current procurement capability after the required Household serialization anchor is acquired. Cached/UI/provider authority is not sufficient.

## B6-004 — Purchase and Receipt are distinct aggregates

Purchase records commercial acquisition truth. Receipt records physical intake. A simple UX may perform both in one interaction, but persistence/domain contracts must retain the distinction.

## B6-005 — Receipt may exist without Purchase

A legitimate acquisition with no prior commercial order may create Receipt/ReceiptItem without inventing a fake Purchase. Such receipt provenance must explicitly identify its source/workflow.

## B6-006 — Product references consume BE-05 visibility

New PurchaseItem and ReceiptItem references may use only current GLOBAL Products or current same-Household private Products visible under BE-05. Foreign private/missing/non-current Product references collapse through nondisclosure-safe outcomes.

Historical committed facts continue referencing their Product after later Product retirement.

## B6-007 — Procurement does not mutate catalog truth

No Purchase/Receipt command may create, rename, retire, promote or otherwise mutate Product/catalog identity as a side effect. Unknown products require an explicit catalog workflow first.

## B6-008 — Quantities are exact and dimensioned

Authoritative PurchaseItem/ReceiptItem quantities are finite exact rationals with explicit MeasurementUnit. Binary floating point, display rounding and unitless quantities are invalid authoritative semantics.

## B6-009 — Dimension-safe conversion only

Quantity comparison/reconciliation requires compatible dimensions unless an explicitly governed contextual/package conversion is accepted. Cross-dimension conversion is never guessed.

## B6-010 — Contextual conversion pins immutable evidence

Whenever reconciliation correctness depends on a contextual conversion, the committed fact must retain or immutably reference the exact `MeasurementConversionEvidence` used, including rule/profile identity/version, exact factor/formula inputs, source/target quantities/units and evaluation context.

Later conversion-rule changes do not reinterpret history.

## B6-011 — Partial receiving is valid

A PurchaseItem may be fulfilled by multiple ReceiptItems across time. Being partially received is an ordinary state, not an exception.

## B6-012 — One physical receiving pool per PurchaseItem

Ordinary same-Product allocations plus substitution allocations consume one shared physical receiving allowance derived from the purchased quantity after exact conversion into a declared comparison unit.

Substitution does not create a second allowance.

## B6-013 — Ordinary allocation requires same Product

A ReceiptItem may ordinary-allocate against a PurchaseItem only when both reference the same Product and quantity conversion is valid.

## B6-014 — Substitution is explicit governed evidence

When received Product differs from purchased Product, the relationship must be represented as a substitution allocation preserving requested Product, received Product, exact quantity/unit, conversion evidence where required, reason, approval when policy requires, and provenance.

It may never masquerade as an ordinary same-Product allocation.

## B6-015 — Over-receipt is explicit

If ordinary + substitution allocations would exceed purchased quantity, the excess is an over-receipt discrepancy/exception. It may proceed only through an explicit governed acceptance/correction workflow.

The system must not round, truncate, silently enlarge purchased quantity or create hidden residuals to make the equation pass.

## B6-016 — Shopping attribution is a separate semantic pool

`ShoppingListFulfillment` allocation is not physical receiving availability. A purchased unit may participate once in the receiving pool and once in the independent shopping-intent pool because those answer different business questions.

BE-06 must not make shopping attribution consume or replenish receiving allowance.

## B6-017 — Money is role-typed

A generic unlabeled `price` is not accepted canonical truth. Monetary facts use explicit semantic roles such as pricing basis, line gross, line discount, line tax/charge and line net.

## B6-018 — Money is exact and currency-qualified

Every authoritative monetary fact carries exact amount and explicit currency. Binary floating point and implicit currency are forbidden.

## B6-019 — Basis-price extension is deterministic

When basis pricing exists, line gross is derived from exact basis amount, exact pricing-basis quantity/unit and exact purchased quantity conversion; governed currency rounding is applied once at the line-gross boundary.

## B6-020 — Source-vs-computed mismatch becomes discrepancy evidence

A source monetary amount that does not reconcile under the governed policy cannot silently become ordinary computed truth. It must preserve source/computed values and become explicit pricing discrepancy/exception evidence with resolution status.

## B6-021 — Purchase-level charges remain distinct unless explicitly allocated

Discounts, taxes, fees or charges supplied only at Purchase level remain Purchase-level facts. They are not silently folded into PurchaseItem unit cost or line amounts.

Any later analytical/accounting allocation must preserve method, basis, rounding and provenance as derived facts.

## B6-022 — Cross-currency normalization is explicit

If source and transaction currencies differ, source amount/currency and normalized amount must preserve the explicit exchange rate/source and conversion time/context. Numerically equal amounts in different currencies are never treated as equivalent.

## B6-023 — Committed ReceiptItem requires physical inventory effects

A ReceiptItem cannot reach committed physical-receipt truth unless linked inventory entry effects materialize its received quantity.

The sum of linked committed effects, after exact valid conversion, must equal exactly the committed ReceiptItem quantity.

## B6-024 — Atomic receipt inventory ingress

ReceiptItem commitment and its required inventory entry effects are one atomic business transaction. A crash cannot leave a committed ReceiptItem with missing inventory effects or inventory ingress with no committed ReceiptItem provenance.

## B6-025 — Inventory ingress is an intent-specific seam, not generic inventory authority

BE-06 may establish the minimum StockItem/Batch/InventoryMovement effects required for receipt ingress, but the runtime surface is intent-specific to receiving. It does not grant arbitrary transfer, adjustment, consumption, waste, count or reconciliation authority.

## B6-026 — Receipt effect Product must match ReceiptItem Product

Every linked receipt inventory effect must represent exactly the ReceiptItem Product. Product transformation is not receiving and requires a different domain workflow.

## B6-027 — Receipt split conserves exact quantity

A ReceiptItem may generate multiple inventory entry effects when batch, placement or another identity-affecting state requires splitting. Exact converted quantities across those effects must sum to the ReceiptItem quantity with no creation/destruction/rounded residual.

## B6-028 — Placement consumes BE-04 current topology

Receipt inventory ingress may target only current same-Household topology accepted by BE-04. Current placement uses the accepted topology serialization guards; retired/foreign topology may not be bypassed.

## B6-029 — Unplaced receiving requires explicit canonical state

If BE-06 supports receipt into an unplaced StockItem, it must use the canonical explicit unplaced lifecycle/state. Missing placement fields alone are not sufficient semantics. The exact policy must be accepted before executable support.

## B6-030 — Batch is optional provenance

Receiving must not fabricate Batch identity when manufacturer/commercial batch is unknown. When Batch is supplied/created, it belongs to exactly one Product and must match the received Product.

## B6-031 — Source expiration is not forced into Batch

A printed/source expiration observed during receiving is `SourceExpirationFact`-style provenance and must not require synthetic Batch creation. Any executable capture must preserve source precision, occurrence anchor and provenance under the later lifecycle contract.

## B6-032 — Occurrence time and commit time are distinct

Purchase/Receipt domain occurrence time may differ from recording/commit time. Source occurrence times may be accepted only under explicit provenance/validation contracts; request arrival time does not silently replace them.

Execution-time current-state decisions use fresh database time after serialization locks.

## B6-033 — Committed procurement/receiving facts are history-bearing

Committed Purchase/Receipt quantities, money, allocations, substitutions, exceptions and inventory-effect links are not destructively rewritten. Corrections are explicit governed correction/exception/compensation facts.

## B6-034 — Draft must not weaken committed invariants

If draft lifecycle is introduced, draft state and transition-to-commit are explicit. Draft records may be incomplete only according to their accepted draft contract; commit must atomically satisfy every committed invariant.

## B6-035 — Stable CommandId for retriable mutations

Every retriable BE-06 mutation requires a caller-supplied stable CommandId. The fingerprint binds Household scope, actor, operation intent and all semantic facts necessary to distinguish retry from a different command.

Server-generated candidate identities are excluded unless semantically required.

## B6-036 — Cross-intent CommandId reuse conflicts

One CommandId cannot acquire a second meaning inside a shared BE-06 command scope. Cross-intent reuse is a provider-neutral idempotency conflict.

## B6-037 — Committed replay is non-restoring

A retry of a committed command returns the original committed outcome before current-state validation where required. Replay does not recreate, reopen, restore or reapply later-changed state.

## B6-038 — Canonical serialization order is explicit per intent

Every mutation documents and proves its lock order before acceptance. The shared direction is Household authority first, then aggregate owner/parent, then line/allocation targets, then catalog/topology references as required, with receiving-pool serialization before availability decisions.

No implementation may acquire the same dependency classes in a conflicting reverse order.

## B6-039 — Concurrent receiving cannot double-consume availability

Two concurrent Receipt/allocations against the same PurchaseItem must serialize at one canonical availability decision point. At most the valid remaining purchased quantity may be ordinary/substitution allocated; the loser receives deterministic conflict/exception behavior rather than a uniqueness/internal error leak.

## B6-040 — Least privilege remains mandatory

`fridge_app`, worker and readonly roles do not receive broad procurement/stock/inventory DML for convenience. Intent-specific persistence and trigger guards preserve internal helper isolation and provider-neutral failures.

## B6-041 — Household observations are nondisclosure-safe

Selected current Purchase/Receipt reads may be available to current Household members, but foreign Household identity, hidden Product, foreign topology or absent target must not be distinguishable through status shape, totals, pagination metadata, timing-sensitive alternate lookup or raw database errors.

## B6-042 — Read authority never upgrades into mutation authority

Possession/observation of Purchase/Receipt, Product or topology identities does not imply `HOUSEHOLD_PROCUREMENT_ADMINISTER`.

## B6-043 — No provider claim becomes business authority

JWT/provider roles, groups, Household claims, scanner/device metadata or request headers remain authentication/context evidence only. Platform PrincipalId + current platform/Household capability is authoritative.

## B6-044 — No automatic catalog repair during receiving

Receiving an unknown barcode/Product cannot silently create or mutate canonical Product or identifier truth. The workflow may stage unresolved evidence through the accepted BE-05 boundary, but receipt commitment must reference an accepted visible Product.

## B6-045 — No automatic stock merge without coherent identity state

Receipt ingress may aggregate into an existing StockItem only if all identity-affecting state required by the accepted inventory model is coherent and the merge preserves provenance/lineage. Otherwise it creates/splits distinct holdings.

The exact aggregation policy must be executable and proved before use.

## B6-046 — Receipt ingress preserves provenance to inventory

Every inventory entry effect created by receiving must retain durable typed provenance back to the exact ReceiptItem through `receipt_item_inventory_effect` or its accepted equivalent. A generic polymorphic provenance ID is not sufficient.

## B6-047 — No orphan or duplicate receipt inventory effect

A receipt inventory effect must reference exactly one committed ReceiptItem and one compatible inventory entry effect. The same effect may not be linked twice to fabricate quantity reconciliation.

## B6-048 — Phase-exit requires end-to-end authenticated physical receiving proof

BE-06 is not closed by Purchase CRUD alone. Final acceptance requires a real authenticated flow crossing platform identity, current Household procurement capability, commercial/receiving truth, exact quantity semantics, serialized receiving availability, atomic inventory ingress, durable provenance and authenticated observation.

## B6-049 — GLOBAL catalog governance remains out of scope

BE-06 may consume visible GLOBAL Products. It gains no right to create/change/retire GLOBAL catalog truth and must not introduce a platform governance source merely to complete receiving.

## B6-050 — Later inventory phases consume receipt ingress history

The future broad inventory phase owns transfer, consumption, waste, counts, reconciliation and other inventory lifecycle operations. It consumes BE-06 receipt-origin movement/provenance as immutable upstream truth rather than rewriting receiving history.

## Acceptance discipline

No BE-06 executable slice is accepted merely because it compiles or its happy path works.

Each slice requires:

- exact-HEAD CI evidence appropriate to its delta;
- executable proof obligations for material invariants where feasible;
- panoramic/adversarial review as if no external automated reviewer existed;
- zero unresolved material findings;
- explicit owner authorization before squash merge;
- preserved source branch.

Any new commit invalidates prior exact-HEAD gate evidence.
