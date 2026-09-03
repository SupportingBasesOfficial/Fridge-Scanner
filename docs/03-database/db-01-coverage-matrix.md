# FridgeScanner — DB-00 → DB-01 Coverage Matrix

## Purpose

This matrix is a coverage gate, not a substitute for the normative documents. It verifies that accepted durable DB-00 concepts and critical invariant areas have an explicit DB-01 logical home and integrity path.

Legend: **AUTH** authoritative/history-bearing; **CURR** mutable current-state; **DERIVED** recomputable/materializable; **EVIDENCE** immutable decision/provenance; **REF** governed reference/catalog data.

## 1. Identity and tenancy

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| User profile | `user_profile` | no global Household role |
| Household | `household` | primary operational boundary |
| HouseholdMembership / authority | `household_membership` | C-001; never global User role |
| Historical Household timezone | `household_timezone_version` AUTH/REF | C-006; exact version reused historically |

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
| ProductCategory | `product_category` REF | acyclic hierarchy; not universal shelf taxonomy |
| Brand / Manufacturer | `brand`, `manufacturer` REF | explicitly distinct |
| ProductIdentifier | `product_identifier` REF | C-011, C-012 |
| Scheme-specific normalization | `product_identifier_normalization_rule` REF | C-012, C-014 |
| Private observation of unresolved global key | `staged_identifier_claim` | C-013 |
| Product↔IngredientConcept compatibility | `product_ingredient_compatibility` REF | C-002, C-003 |
| Historical compatibility decision | `compatibility_decision_evidence` EVIDENCE | C-055, C-059, C-069 |

## 4. Measurement and money

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| MeasurementUnit | `measurement_unit` REF | C-016 |
| Contextual conversion rule/profile | `measurement_conversion_rule` REF | C-017 |
| Historical conversion decision | `measurement_conversion_evidence` EVIDENCE | C-015–C-017 |
| Exact rational quantity semantics | measurable authoritative relations | C-015–C-017 |
| Money/Currency roles | `purchase_money_fact`, `purchase_item_money_fact` AUTH | C-020, C-021 |
| Pricing discrepancy | `purchase_item_pricing_discrepancy` AUTH | C-021 |

## 5. Procurement and receiving

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Purchase / PurchaseItem | `purchase`, `purchase_item` AUTH | C-016, C-020–C-021 |
| Receipt / ReceiptItem | `receipt`, `receipt_item` AUTH | C-022, C-025, C-027 |
| Ordinary line allocation | `purchase_item_receipt_allocation` AUTH | C-023, C-025, C-026 |
| Substitution allocation | `purchase_item_substitution_allocation` AUTH | C-024–C-026 |
| Over-receipt/discrepancy | `purchase_receiving_exception` AUTH | C-026 |
| Received line → ledger effects | `receipt_item_inventory_effect` AUTH | C-027, C-028 |
| Separate physical receiving pool | ordinary + substitution allocations | C-025, C-026, C-029 |
| Separate shopping attribution pool | `shopping_list_fulfillment` | C-029, C-070 |

## 6. Inventory and lineage

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Batch | `batch` provenance | C-010 |
| StockItem | `stock_item` CURR | C-004, C-007, C-008, C-010 |
| Printed/source expiration without Batch | `source_expiration_fact` AUTH | C-006, shelf-life contracts |
| InventoryMovement | `inventory_movement` AUTH | C-018, C-019, C-030, C-031 |
| Current balance | ledger-derived StockItem/read projection DERIVED | C-031 |
| InventoryTransfer / paired effects | `inventory_transfer`, `inventory_transfer_effect` AUTH | C-032, C-033 |
| Same-Product split/merge/redistribution | `inventory_quantity_lineage` AUTH | C-034–C-037 |
| Shelf-life inheritance across lineage | `quantity_lineage_shelf_life_fact` EVIDENCE | C-038 |

## 7. Waste and disposal

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Waste reason/classification | `waste_record` AUTH | C-039 |
| Waste stock reduction | `waste_record_movement` + `inventory_movement` AUTH | C-039–C-041 |
| Expiration ≠ disposal | no automatic WasteRecord from time passage | shelf-life/waste separation |

## 8. Inventory count and reconciliation

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| InventoryCount | `inventory_count` | C-043 |
| Historical ledger basis | `inventory_ledger_basis` AUTH | C-042, C-043 |
| InventoryCountItem | `inventory_count_item` AUTH | C-042–C-044 |
| Deterministic allocation | `inventory_count_allocation` EVIDENCE | C-045 |
| Reconciliation outcome / adjustment | `inventory_reconciliation_outcome` + `inventory_movement` | C-046–C-049 |
| Late/offline ordering / equal-time ambiguity | movement/count causal-order evidence | C-046, C-047 |
| Late pre-observation correction | explicit reconciliation/compensation | C-049 |

## 9. Recipes and preparations

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Recipe / immutable version / lines | `recipe`, `recipe_version`, `recipe_ingredient` | C-050, C-051, C-054 |
| Preparation | `preparation` AUTH | C-050, C-051 |
| Input / decrement effects | `preparation_input`, `preparation_input_movement` AUTH | C-052, C-053 |
| Recipe allocation / deviations | `preparation_input_allocation`, `preparation_input_deviation`, `recipe_fulfillment_deviation` | C-053–C-055 |
| Output / increment effects | `preparation_output`, `preparation_output_movement` AUTH | C-056 |
| Product transformation boundary | Preparation semantics, not same-Product lineage | C-037 |

## 10. Shelf life and lifecycle

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| FoodLifecycleEvent | `food_lifecycle_event` AUTH | C-038 plus activation history |
| ShelfLifeRule | `shelf_life_rule` REF | C-057–C-061 |
| Current target types | Product XOR IngredientConcept | C-058 |
| Future governed classification | reviewed typed extension only | C-058 |
| Rule activation | `shelf_life_rule_activation` AUTH/EVIDENCE | C-059–C-061 |
| Concept compatibility at activation | CompatibilityDecisionEvidence | C-059 |
| EffectiveExpiration / candidates | `effective_expiration`, `effective_expiration_candidate` | C-062, C-063 |
| Historical Household timezone | `household_timezone_version` + source/activation evidence | C-006, C-059, C-063 |

## 11. Planning, replenishment and shopping

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| HouseholdProductPolicy | `household_product_policy` | C-064 |
| Minimum desired stock | policy exact quantity/unit | C-064, C-016 |
| Preferred storage defaults | `household_product_storage_preference` | C-065, C-066 |
| Preference is not actual placement | policy preference vs `stock_item` placement | C-066 |
| ShoppingList / Item | `shopping_list`, `shopping_list_item` | C-067 |
| ShoppingListFulfillment | `shopping_list_fulfillment` AUTH | C-068–C-070 |
| Historical concept compatibility | CompatibilityDecisionEvidence | C-069 |

## 12. Alerts and notification delivery

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| AlertRule | `alert_rule` | C-071–C-072 |
| Explicit governed rule subject/scope | `alert_rule_subject` | C-071, C-072 |
| Alert | `alert` AUTH | C-073, C-074 |
| Concrete triggering subject/context | `alert_trigger_subject` EVIDENCE | C-073, C-074 |
| NotificationDelivery | `notification_delivery` AUTH | C-074 |
| Optional global user preference | deferred optional user-level feature | C-075; no Household authority |

## 13. Integrations and imports

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| Integration | `integration` | C-005, C-079 |
| Inventory-affecting Household binding | Integration scope + `import_run.household_id` | C-005, C-076 |
| ImportRun | `import_run` AUTH | C-076 |
| External provider identity/provenance | `external_reference` AUTH/EVIDENCE | C-076–C-078 |
| Durable link from canonical fact to external provenance | domain-specific typed FK/provenance relation when that import contract requires it | C-078; no universal polymorphic target |
| Secret separation | secure credential reference | C-079 |

## 14. Governance/platform records

| DB-00 concept / concern | DB-01 logical home | Integrity coverage |
| --- | --- | --- |
| AuditEvent | `audit_event` AUTH | C-084 |
| IdempotencyRecord | `idempotency_record` AUTH | C-080–C-082 |
| OutboxRecord | `outbox_record` AUTH | C-083 |
| Mutation + publication intent atomicity | mutation + OutboxRecord | C-083; transaction gate |

## 15. Explicit non-persistence / derived boundaries

Intentionally not independent competing authoritative facts:

- authentication credentials — outside food-management domain;
- global `User.role` — Household membership owns authority;
- mutable StockItem quantity as sole truth — ledger-derived;
- current placement as historical placement — movement/transfer history owns it;
- storage preference as actual placement — policy only;
- expiration as disposal — explicit WasteRecord/effect required;
- free-text ShoppingList subject as canonical fulfillment identity — provenance only;
- generic alert subject IDs — typed rule/trigger subjects required;
- generic ExternalReference canonical target — not part of DB-00; typed domain provenance links only when required;
- provider identity as Household authorization — explicit scope required;
- generic polymorphic business FK — typed associations required;
- future ShelfLifeRule classification before governed typed schema exists — invalid until extension.

## 16. Coverage gate result

At this review state, every accepted DB-00 concept identified as requiring durable persistence has a DB-01 logical home or an explicit optional/derived/non-domain boundary. The matrix is revalidated after every material finding; it does not override the exact-HEAD panoramic review requirement.
