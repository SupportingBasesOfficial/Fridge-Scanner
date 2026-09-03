# FridgeScanner — DB-00 → DB-01 Coverage Matrix

## Purpose

This matrix is a coverage gate, not a substitute for the normative documents. It verifies that accepted durable DB-00 concepts and critical invariant areas have an explicit DB-01 logical home and integrity path.

Legend:

- **AUTH** — authoritative/history-bearing relation.
- **CURR** — mutable current-state relation.
- **DERIVED** — recomputable/materializable projection.
- **EVIDENCE** — immutable decision/provenance evidence.
- **REF** — governed reference/catalog data.

## 1. Identity and tenancy

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| User profile | `user_profile` | no global Household role |
| Household | `household` | primary operational boundary |
| HouseholdMembership | `household_membership` | C-001; active membership candidate uniqueness |
| Household-scoped authority | `household_membership` | C-001; never global User role |
| Historical Household timezone | `household_timezone_version` AUTH/REF | C-006; exact version reused by historical temporal evidence |

## 2. Storage topology

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| StorageLocation | `storage_location` CURR | C-001, C-008 |
| Compartment | `compartment` CURR | C-008 |
| Stock placement XOR | `stock_item` current placement | C-007, C-008 |
| Historical placement | `inventory_movement`, `inventory_transfer` AUTH | C-009, C-033 |

## 3. Product and semantic catalog

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Product | `product` REF | C-002–C-004 |
| IngredientConcept | `ingredient_concept` REF | C-002, C-003 |
| ProductCategory | `product_category` REF | acyclic governed hierarchy; not universal rule taxonomy |
| Brand | `brand` REF | distinct from Manufacturer |
| Manufacturer | `manufacturer` REF | distinct from Brand |
| ProductIdentifier | `product_identifier` REF | C-011, C-012 |
| Scheme-specific normalization | `product_identifier_normalization_rule` REF | C-012, C-014 |
| Unresolved private observation of global key | `staged_identifier_claim` | C-013 |
| Product↔IngredientConcept compatibility | `product_ingredient_compatibility` REF | C-002, C-003 |
| Historical compatibility decision | `compatibility_decision_evidence` EVIDENCE | C-055, C-066 and equivalent concept-decision consumers |

## 4. Measurement and money

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| MeasurementUnit | `measurement_unit` REF | C-016 |
| Contextual conversion profile/rule | `measurement_conversion_rule` REF | C-017 |
| Historical conversion decision | `measurement_conversion_evidence` EVIDENCE | C-015–C-017 |
| Exact rational quantity semantics | all measurable authoritative relations | C-015–C-017 |
| Money/Currency roles | `purchase_money_fact`, `purchase_item_money_fact` AUTH | C-020, C-021 |
| Pricing discrepancy | `purchase_item_pricing_discrepancy` AUTH | C-021 |

## 5. Procurement and receiving

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Purchase | `purchase` AUTH | C-001, C-020/C-021 monetary rules |
| PurchaseItem | `purchase_item` AUTH | C-016, C-021, receiving/shopping pools |
| Receipt | `receipt` AUTH | C-022 |
| ReceiptItem | `receipt_item` AUTH | C-025, C-027 |
| Ordinary line allocation | `purchase_item_receipt_allocation` AUTH | C-023, C-025, C-026 |
| Substitution allocation | `purchase_item_substitution_allocation` AUTH | C-024–C-026 |
| Over-receipt/discrepancy | `purchase_receiving_exception` AUTH | C-026 |
| Received line → stock ledger effects | `receipt_item_inventory_effect` AUTH | C-027, C-028 |
| Physical receiving allocation pool | ordinary + substitution allocation relations | C-025, C-026 |
| Shopping attribution pool | `shopping_list_fulfillment` | C-029, C-067 |

## 6. Inventory and lineage

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Batch | `batch` REF/AUTH provenance | C-010 |
| StockItem | `stock_item` CURR | C-004, C-007, C-008, C-010 |
| Printed/source expiration independent of Batch | `source_expiration_fact` AUTH | C-006, shelf-life constraints |
| InventoryMovement | `inventory_movement` AUTH | C-018, C-019, C-030, C-031 |
| Current balance | StockItem projection/read model DERIVED | C-031 |
| InventoryTransfer | `inventory_transfer` AUTH | C-032, C-033 |
| Transfer paired effects | `inventory_transfer_effect` AUTH | C-032, C-033 |
| Same-Product split/merge/redistribution lineage | `inventory_quantity_lineage` AUTH | C-034–C-037 |
| Shelf-life inheritance across lineage | `quantity_lineage_shelf_life_fact` EVIDENCE | C-038 |

## 7. Waste and disposal

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| WasteRecord reason/classification | `waste_record` AUTH | C-039 |
| Waste stock reduction | `waste_record_movement` + `inventory_movement` AUTH | C-039–C-041 |
| Expiration ≠ disposal | no automatic WasteRecord from time passage | shelf-life/waste separation |

## 8. Inventory count and reconciliation

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| InventoryCount | `inventory_count` AUTH/session | C-043 |
| Historical ledger cutoff/basis | `inventory_ledger_basis` AUTH | C-042, C-043 |
| InventoryCountItem | `inventory_count_item` AUTH | C-042–C-044 |
| Deterministic allocation to holdings | `inventory_count_allocation` EVIDENCE | C-045 |
| Reconciliation outcome | `inventory_reconciliation_outcome` AUTH | C-046–C-049 |
| Adjustment movement | `inventory_movement` linked from outcome | C-048 |
| Late/offline occurrence ordering | movement/count ordering evidence | C-046, C-047 |
| Equal-time ambiguity | ordering discriminator or unresolved state | C-047 |
| Late pre-observation correction | reconciliation outcome/compensation | C-049 |

## 9. Recipes and preparations

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Recipe | `recipe` REF | C-051 |
| Immutable RecipeVersion | `recipe_version` AUTH/REF | C-050, C-051 |
| RecipeIngredient snapshot | `recipe_ingredient` AUTH/REF | C-050, C-054 |
| Preparation | `preparation` AUTH | C-050, C-051 |
| PreparationInput | `preparation_input` AUTH | C-052, C-053 |
| Input decrement effects | `preparation_input_movement` AUTH | C-052 |
| RecipeIngredient allocation | `preparation_input_allocation` AUTH | C-053–C-055 |
| Explicit source-side deviation | `preparation_input_deviation` AUTH | C-053 |
| Explicit recipe fulfillment deviation | `recipe_fulfillment_deviation` AUTH | C-054 |
| PreparationOutput | `preparation_output` AUTH | C-056 |
| Output increment effects | `preparation_output_movement` AUTH | C-056 |
| Product transformation boundary | Preparation input/output semantics | C-037 |

## 10. Shelf life and lifecycle

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| FoodLifecycleEvent | `food_lifecycle_event` AUTH | C-038 via lineage; activation inputs |
| ShelfLifeRule | `shelf_life_rule` REF | C-057–C-061 |
| Current rule target types | Product XOR IngredientConcept | C-058 |
| Future governed classification | explicit future schema extension only | C-058 |
| Activation-time rule selection | `shelf_life_rule_activation` AUTH/EVIDENCE | C-059–C-061 |
| Concept compatibility at activation | CompatibilityDecisionEvidence referenced by activation | C-059 |
| EffectiveExpiration | `effective_expiration` DERIVED | C-063 |
| Candidate provenance/composition | `effective_expiration_candidate` EVIDENCE | C-062, C-063 |
| Date-only Household timezone version | `household_timezone_version` + SourceExpirationFact | C-006, C-059, C-063 |

## 11. Planning and shopping

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| HouseholdProductPolicy | `household_product_policy` | C-016 |
| ShoppingList | `shopping_list` | C-001 |
| ShoppingListItem Product XOR concept | `shopping_list_item` | C-064 |
| ShoppingListFulfillment | `shopping_list_fulfillment` AUTH | C-065–C-067 |
| Historical concept compatibility | CompatibilityDecisionEvidence | C-066 |

## 12. Alerts and notification delivery

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| AlertRule | `alert_rule` | C-068, C-069 |
| Alert | `alert` AUTH | C-068, C-069 |
| NotificationDelivery | `notification_delivery` AUTH | C-068 |
| Optional global user notification preference | deferred optional user-level feature | C-070; cannot grant Household authority |

## 13. Integrations and imports

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Integration | `integration` | C-005, C-073 |
| Inventory-affecting Household binding | Integration scope + `import_run.household_id` | C-005, C-071 |
| ImportRun | `import_run` AUTH | C-071 |
| ExternalReference | `external_reference` AUTH/EVIDENCE | C-071, C-072 |
| Secret separation | secure credential reference | C-073 |

## 14. Governance/platform records

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| AuditEvent | `audit_event` AUTH | C-078 |
| IdempotencyRecord | `idempotency_record` AUTH | C-074–C-076 |
| OutboxRecord | `outbox_record` AUTH | C-077 |
| Mutation + publication intent atomicity | business mutation + OutboxRecord | C-077; transaction-boundary section |

## 15. Explicit non-persistence / derived boundaries

The following are intentionally not modeled as independent competing authoritative facts:

- authentication credentials — outside food-management domain;
- global `User.role` — rejected by Household membership authority;
- StockItem mutable quantity as sole truth — current balance is derived from ledger;
- current placement as historical placement — history belongs to movement/transfer effects;
- expiration as disposal — WasteRecord requires explicit physical action/effect;
- free-text ShoppingList subject as canonical fulfillment identity — provenance only;
- provider credential/account identity as Household authorization — explicit scope required;
- generic polymorphic business FK — typed relations required;
- future ShelfLifeRule classification before governed typed schema exists — invalid until extension.

## 16. Coverage gate result

At the current DB-01 review state, every accepted DB-00 concept identified as requiring durable persistence has a DB-01 logical home or an explicit optional/derived/non-domain boundary. This matrix must be rechecked after every material DB-01 finding because a local correction can create a new system-level omission or conflation elsewhere.
