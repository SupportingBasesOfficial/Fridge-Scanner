# FridgeScanner — DB-02 PostgreSQL Enforcement Map

## Purpose

Maps the accepted DB-01 relational integrity contract to concrete PostgreSQL enforcement classes. Exact object names may be refined in the SQL baseline, but the enforcement strength may not be weakened without a reviewed DB-02 decision.

## Enforcement classes

- **DDL** — PK/FK/UNIQUE/CHECK/NOT NULL/exclusion/generated constraint.
- **IDX** — supporting/partial/functional unique index.
- **RLS** — row-level security policy, defense in depth.
- **PRIV** — GRANT/REVOKE/role boundary.
- **TXFN** — transaction-safe database function/procedure used as mutation boundary.
- **DTRG** — deferred constraint trigger / transaction-end validation.
- **IMM** — update/delete denial + immutable-row guard.
- **TEST** — adversarial database test required to prove the contract.

## 1. Household and catalog scope

| DB-01 area | PostgreSQL enforcement |
| --- | --- |
| Parent/child Household equality | DDL composite candidate keys `(household_id,id)` + composite FKs; TEST cross-tenant FK rejection |
| Global XOR Household ownership | DDL CHECK on `catalog_scope` / `owner_household_id`; IDX conditional uniqueness where needed |
| Household-visible Product/Concept/Recipe references | TXFN for cross-scope visibility checks + DDL where same-Household composite FK is representable |
| Household-private data access | RLS fail-closed + PRIV normal roles cannot bypass RLS |
| Global catalog mutation authority | PRIV separate catalog-governance role; ordinary Household role read-only for global rows |

## 2. Storage and placement

| Contract | Enforcement |
| --- | --- |
| StockItem StorageLocation XOR Compartment XOR unplaced | DDL CHECK exact-one state |
| Compartment belongs to selected Household/location | composite FK paths |
| Historical placement never inferred from mutable current placement | IMM ledger effect placement columns + TEST reconstruction case |
| Preferred storage policy is not placement truth | separate typed preference table; no FK from stock history to preference rows |

## 3. Product identifiers

| Contract | Enforcement |
| --- | --- |
| Global identifiers only on global Product | DDL/TXFN scope check; partial unique indexes for global namespace |
| Non-global uniqueness includes issuer namespace | IDX scoped unique index |
| Rule-versioned normalization | DDL FK to normalization rule version + persisted source/normalized values |
| Staged private claim does not reserve canonical key | physically separate staged table; no canonical unique-index participation |
| Rule-version migration collision safety | TXFN governance workflow; ordinary updates to canonical identifier evidence restricted |

## 4. Exact quantities and conversion

| Contract | Enforcement |
| --- | --- |
| Denominator positive/integral | DDL CHECK |
| Numerator/denominator exact | `numeric` integer semantics; no float columns |
| Canonical gcd normalization | TXFN normalization helper; PRIV restrict bypass on authoritative rows |
| Dimension-safe unit conversion | TXFN validates unit dimensions/rule evidence |
| Historical conversion evidence pinned | IMM evidence FK from committed allocation/effect |
| Equality/conservation before rounding | TXFN/DTRG exact cross-multiplied rational comparison; TEST 1/3 splits |

## 5. Purchase and receiving

| Contract | Enforcement |
| --- | --- |
| PurchaseItem belongs to Purchase Household | composite FK |
| Ordinary receipt same Product | TXFN + DTRG/trigger verification across allocation endpoints |
| Substitution explicit | separate substitution table, required requested/received identities |
| ReceiptItem inventory effects sum exactly | TXFN commit routine + DTRG exact rational sum |
| Purchase receiving pool not over-allocated | aggregate lock + TXFN/DTRG |
| Over-receipt only via explicit exception | TXFN requires accepted exception for excess |
| Shopping fulfillment separate pool | physically separate table/aggregate; no shared availability row |

## 6. Inventory ledger and transfer

| Contract | Enforcement |
| --- | --- |
| InventoryMovement append-only | IMM + PRIV |
| Current balance not authoritative | projection has no ordinary authoritative write path |
| Movement Product matches StockItem | composite/typed FK where representable + TXFN |
| Transfer has paired effects | TXFN atomically creates transfer + source/destination effects |
| Transfer Product/quantity conservation | TXFN/DTRG exact rational equality |
| Source/destination placement snapshots immutable | IMM movement/transfer effects |
| Same-Product lineage exact | DTRG/TXFN source outgoing = declared redistributed quantity; Product equality |
| Product transformation excluded from ordinary lineage | TXFN rejects differing Product IDs in lineage; Preparation uses separate relations |
| Shelf-life lineage evidence preserved | TXFN split/transfer routine copies exact evidence links before commit |

## 7. Waste

| Contract | Enforcement |
| --- | --- |
| WasteRecord does not itself alter stock | stock delta only through linked InventoryMovement |
| Waste movement is stock-reducing and same Household/Product | TXFN/DTRG |
| Movement cannot be reused across unrelated waste records | UNIQUE/IDX on waste-movement semantic role |
| Expiration does not auto-create disposal | no trigger from expiration projection to WasteRecord |

## 8. Inventory count and reconciliation

| Contract | Enforcement |
| --- | --- |
| CountItem has exact ledger basis | NOT NULL FK |
| Shared basis only for authoritative frozen snapshot | TXFN session creation policy |
| Ambiguous aggregate allocation forbidden | TXFN requires deterministic evidence; unresolved status otherwise |
| Equal timestamp without causal order remains ambiguous | TXFN reconciliation classifier |
| Adjustment generated only from accepted outcome | TXFN atomic outcome + movement |
| Late pre-observation compensation avoids double count | TXFN locks count/outcome basis and evaluates immutable movement set |

## 9. Recipe and preparation

| Contract | Enforcement |
| --- | --- |
| Preparation references immutable RecipeVersion | FK + IMM published/referenced version |
| Input movement effects sum exactly to input | TXFN/DTRG |
| One movement cannot satisfy multiple input semantic uses | UNIQUE/IDX |
| Input allocations + deviations exhaust input | TXFN/DTRG |
| Ingredient target allocations reconcile to effective requirement | TXFN/DTRG with explicit deviation path |
| Concept compatibility evidence pinned | FK required when fulfillment is concept-based |
| Output effects sum exactly to output | TXFN/DTRG |
| Output movements unique in materialization role | UNIQUE/IDX |

## 10. Shelf life and expiration

| Contract | Enforcement |
| --- | --- |
| Rule target Product XOR IngredientConcept | DDL CHECK + typed FKs |
| Global/Household rule scope | DDL + TXFN visibility |
| Effective intervals non-overlapping where required | exclusion constraint or governance TXFN depending key |
| Calendar rule integral amount | CHECK |
| Household timezone version intervals non-overlapping | exclusion constraint on effective range per Household |
| Activation pins exact rule/timezone/compatibility context | FK/NOT NULL conditional CHECKs |
| EffectiveExpiration remains derived | separate projection table; authoritative inputs immutable |
| Candidate source XOR | CHECK + typed FKs |

## 11. Shopping and product policy

| Contract | Enforcement |
| --- | --- |
| Shopping subject Product XOR IngredientConcept | CHECK |
| Fulfillment Product compatibility | TXFN |
| Shopping PurchaseItem pool anti-double-count | aggregate lock + TXFN/DTRG |
| Product policy measurable thresholds have unit | CHECK/NOT NULL conditional |
| Preferred storage typed target XOR | CHECK + same-Household composite FKs |

## 12. Alerts

| Contract | Enforcement |
| --- | --- |
| AlertRule Household scope | direct household FK + RLS |
| AlertRule subject typed | subject-kind + typed FK alternative CHECK |
| Subject same Household/visible | TXFN/composite FK where possible |
| Alert retains trigger subject | TXFN commit requires at least one primary trigger subject |
| Alert/Rule/Delivery Household equality | composite FKs |
| Recipient/destination does not imply authority | RLS/TXFN authorization evidence; no FK from destination to Household authority |

## 13. Integrations/imports

| Contract | Enforcement |
| --- | --- |
| Inventory-affecting ImportRun exactly one Household | CHECK/NOT NULL conditional + RLS |
| ExternalReference namespace uniqueness | scoped IDX |
| ExternalReference no generic canonical target | schema simply has no target-type/id columns |
| Provider identity not Household authority | no authority FK/derivation; RLS/TXFN requires explicit binding |
| Secrets outside arbitrary domain JSON | schema stores secure secret reference only; PRIV |

## 14. Idempotency

| Contract | Enforcement |
| --- | --- |
| Scoped idempotency identity unique | UNIQUE/IDX on scope + principal + operation + key |
| Fingerprint mismatch conflicts | TXFN compare-or-create |
| One executor | row creation/locking state machine in TXFN |
| Result not disclosed before current authorization | DB record is not directly readable by client role; service re-authorizes before retrieval |

## 15. Audit/outbox

| Contract | Enforcement |
| --- | --- |
| Audit append-only | IMM + PRIV |
| Generic audit target is evidence only | no operational FK reuse |
| Mutation + outbox atomic | same TXFN/transaction |
| Outbox publication retries do not mutate business fact | separate publication-state columns; business identity immutable |
| Outbox duplicate publication identity governed | IDX contract/business-event identity where contract requires uniqueness |

## 16. Database test gate

DB-02 database tests must intentionally attempt and prove rejection of at least:

1. cross-Household child attachment;
2. private Product with global canonical identifier;
3. StockItem conflicting placement anchors;
4. rational denominator zero/non-integral and non-normalized authoritative write bypass;
5. over-allocation in receipt and shopping pools independently;
6. mutation/delete of committed InventoryMovement;
7. transfer quantity/Product mismatch;
8. same movement reused for two Preparation inputs/outputs;
9. count adjustment from equal-time ambiguous evidence;
10. concept fulfillment without pinned compatibility evidence;
11. historical date-only expiration recomputed with a newer Household timezone version;
12. generic ExternalReference canonical target attempt;
13. duplicate idempotency identity with different fingerprint;
14. client role direct access without trusted Household context;
15. unauthorized mutation of global catalog truth.
