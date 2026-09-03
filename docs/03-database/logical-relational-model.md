# FridgeScanner — Logical Relational Model

## Status and notation

This document is the DB-01 logical persistence model derived from accepted DB-00 contracts. Names are logical relation names, not final SQL identifiers.

Notation:

- `PK` — logical primary identity.
- `FK` — logical foreign-key relationship.
- `UQ` — candidate/unique key.
- `REQ` — mandatory.
- `OPT` — optional.
- `IMM` — immutable after commit except governed correction metadata.
- `XOR` — exactly one alternative must be selected.

All Household-owned relations below include `household_id` directly unless explicitly described as globally scoped reference data.

## 1. Identity and Household boundary

### `user_profile`

Purpose: platform-domain profile independent from authentication credentials.

Core logical attributes:

- `user_id` PK;
- profile/display metadata;
- lifecycle status.

No global Household role exists here.

### `household`

- `household_id` PK;
- canonical display/name metadata;
- lifecycle status;
- governed timezone/configuration version reference where required by temporal rules.

### `household_membership`

- `membership_id` PK;
- `household_id` FK REQ;
- `user_id` FK REQ;
- household-scoped role/authority class;
- membership lifecycle/effective interval.

Candidate key: active membership uniqueness for `(household_id, user_id)` under the governed lifecycle policy.

## 2. Storage topology

### `storage_location`

- `storage_location_id` PK;
- `household_id` FK REQ;
- logical kind/type;
- name/metadata;
- lifecycle status.

### `compartment`

- `compartment_id` PK;
- `household_id` FK REQ;
- `storage_location_id` FK REQ;
- name/kind/ordering metadata.

Integrity: parent `storage_location.household_id` must equal `compartment.household_id`.

## 3. Catalog governance

Catalog-governed relations use logical fields:

- `catalog_scope ∈ {GLOBAL, HOUSEHOLD}`;
- `owner_household_id` nullable.

Invariant: `GLOBAL XOR HOUSEHOLD owner`: GLOBAL requires no owner; HOUSEHOLD requires exactly one owner.

### `ingredient_concept`

- `ingredient_concept_id` PK;
- catalog scope/owner;
- semantic name and governed classification metadata;
- lifecycle/versioning metadata as needed.

### `product`

- `product_id` PK;
- catalog scope/owner;
- canonical product name/identity metadata;
- optional `brand_id`;
- optional `manufacturer_id`;
- optional `product_category_id`;
- lifecycle state.

### `brand`

Global reference identity for brand metadata unless a future governed requirement introduces scoped brands.

### `manufacturer`

Distinct global reference identity for manufacturer metadata.

### `product_category`

- `product_category_id` PK;
- optional parent category FK;
- governed category metadata.

A category hierarchy must remain acyclic.

### `product_identifier_normalization_rule`

- `normalization_rule_id` PK;
- identifier scheme;
- issuer/namespace applicability;
- rule version;
- effective interval/status;
- exact normalization semantics metadata.

Candidate key: governed uniqueness of active rule version within its scheme/namespace policy.

### `product_identifier`

- `product_identifier_id` PK;
- `product_id` FK REQ;
- scheme REQ;
- issuer/namespace when required;
- exact source value REQ;
- normalized value REQ;
- `normalization_rule_id` FK REQ;
- lifecycle/status/provenance.

Candidate key follows DB-00: `(scheme, issuer_or_namespace, active_normalization_rule_version, normalized_value)`, omitting issuer only for schemes defined as one global namespace.

Integrity: globally namespaced canonical identifiers may reference only GLOBAL Products.

### `staged_identifier_claim`

Purpose: Household-scoped evidence for an unresolved globally namespaced identifier without consuming the canonical global key.

- `staged_identifier_claim_id` PK;
- `household_id` FK REQ;
- optional private `product_id` candidate constrained to same Household;
- scheme/source/normalized evidence;
- normalization rule/version evidence;
- provenance/status/resolution reference.

This relation is excluded from canonical `product_identifier` uniqueness/resolution until governed promotion/resolution.

### `product_ingredient_compatibility`

Versioned governed mapping between Product and IngredientConcept.

- `compatibility_mapping_id` PK;
- catalog scope/owner;
- `product_id` FK REQ;
- `ingredient_concept_id` FK REQ;
- mapping version/effective interval;
- constraints/policy metadata;
- lifecycle status.

GLOBAL mappings may reference only GLOBAL Product and GLOBAL IngredientConcept. HOUSEHOLD mappings may reference GLOBAL or same-Household entities, never another Household's private entity.

### `compatibility_decision_evidence`

IMM evidence captured by committed decisions.

- `compatibility_evidence_id` PK;
- Product and IngredientConcept identities;
- mapping identity/version;
- evaluation/effective anchor;
- constraints/provenance/approval evidence.

## 4. Measurement and money reference contracts

### `measurement_unit`

- `measurement_unit_id` PK;
- dimension/class;
- symbol/name;
- governed canonical metadata.

### `measurement_conversion_rule`

Versioned conversion/profile definition where contextual/package/cross-dimension conversion is permitted.

### `measurement_conversion_evidence`

IMM:

- `measurement_conversion_evidence_id` PK;
- source rational quantity + source unit;
- target rational quantity + target unit;
- exact rational factor/formula inputs;
- conversion rule/profile identity and version;
- evaluation/effective context;
- provenance.

### Logical rational values

Every authoritative quantity persists a lossless rational amount. DB-01 models this logically as numerator/denominator semantics or an equivalent exact representation plus `measurement_unit_id`; DB-02 chooses the physical encoding.

### Logical money values

Money-bearing relations preserve exact amount, currency, semantic role and provenance. DB-01 does not require a separate `money` table; it requires role-specific money attributes or child facts without ambiguity.

## 5. Procurement and receiving

### `purchase`

- `purchase_id` PK;
- `household_id` FK REQ;
- transaction/source identity;
- transaction currency/context;
- occurrence/recording times;
- merchant/provider provenance;
- optional purchase-level monetary facts.

### `purchase_item`

- `purchase_item_id` PK;
- `household_id` FK REQ;
- `purchase_id` FK REQ;
- `product_id` FK REQ and visible to Household;
- purchased exact rational quantity + `measurement_unit_id`;
- optional pricing-basis exact quantity/unit and price money;
- optional line gross/discount/tax/charge/net facts;
- pricing/conversion/discrepancy provenance.

Parent Household must match Purchase.

### `purchase_item_pricing_discrepancy`

Preserves any source/computed pricing mismatch instead of silently accepting inconsistent gross/unit-cost semantics.

### `receipt`

- `receipt_id` PK;
- `household_id` FK REQ;
- optional `purchase_id` provenance;
- authoritative receiving occurrence time;
- recording/source provenance.

### `receipt_item`

- `receipt_item_id` PK;
- `household_id` FK REQ;
- `receipt_id` FK REQ;
- `product_id` FK REQ;
- exact rational received quantity + unit;
- optional same-Product `purchase_item_id` provenance;
- source/provenance metadata.

When `purchase_item_id` is present as ordinary receiving provenance, Product identity must match exactly.

### `purchase_item_substitution_allocation`

Explicit exception path for different received Product.

- allocation PK;
- `household_id`;
- `purchase_item_id`;
- `receipt_item_id`;
- requested Product identity;
- received Product identity;
- exact substituted quantity/unit;
- reason/approval/provenance.

Ordinary receipt allocations and substitution allocations share one physical receiving availability pool per PurchaseItem.

### `purchase_receiving_exception`

Represents over-receipt or other governed receipt discrepancies with status/resolution rather than treating excess as normal fulfillment.

## 6. Inventory core

### `batch`

- `batch_id` PK;
- `product_id` FK REQ;
- manufacturer/commercial lot facts;
- optional production/source expiration metadata where genuinely batch-level.

Batch has no Household placement authority and is not required for StockItem identity.

### `stock_item`

- `stock_item_id` PK;
- `household_id` FK REQ;
- `product_id` FK REQ;
- optional `batch_id` FK;
- current lifecycle/status;
- current placement alternative:
  - optional `storage_location_id`,
  - optional `compartment_id`,
  - explicit `is_unplaced`/equivalent governed state;
- optional current-state projection metadata.

Placement integrity: exactly one of direct StorageLocation, Compartment, or explicit unplaced state. If Compartment is chosen, no competing direct StorageLocation value is stored as independent truth. Placement Household must match StockItem Household.

Batch, if present, must belong to the same Product.

Current quantity may be materialized only as a projection/cache; authoritative quantity is reconstructed from committed InventoryMovement.

### `source_expiration_fact`

IMM:

- `source_expiration_fact_id` PK;
- `household_id`;
- `stock_item_id` REQ;
- optional `batch_id` and/or `receipt_item_id` provenance;
- exact source expiration value with original precision/semantics;
- authoritative fact occurrence/source temporal anchor;
- source timezone/offset context when provided;
- provenance.

### `inventory_movement`

Authoritative IMM ledger fact.

- `inventory_movement_id` PK;
- `household_id` FK REQ;
- movement kind;
- `product_id` FK REQ;
- exact signed rational quantity + unit;
- affected/source `stock_item_id` when applicable;
- authoritative domain occurrence time;
- recording/commit time;
- optional trustworthy causal ordering discriminator and ordering-domain identity;
- immutable placement snapshot/effect anchor when placement-sensitive;
- provenance/causation identifiers;
- optional correction/compensation relationship to another movement.

Committed movement business meaning and quantity are immutable.

### `inventory_transfer`

- `inventory_transfer_id` PK;
- `household_id` FK REQ;
- Product identity;
- exact transferred rational quantity/unit;
- occurrence/provenance;
- source placement snapshot;
- destination placement snapshot.

### `inventory_transfer_effect`

Links exactly one transfer to its paired effects:

- transfer FK;
- source-decrement `inventory_movement_id` UQ;
- destination-increment `inventory_movement_id` UQ.

Both movements must share Household and Product and conserve exactly the transferred quantity after governed exact conversion.

### `inventory_quantity_lineage`

IMM relation connecting source and destination movement/StockItem quantity portions for split, transfer, merge or redistribution.

Carries exact rational allocated quantity/unit plus evidence necessary to prove no creation/destruction and to propagate shelf-life state.

### `quantity_lineage_shelf_life_fact`

Associates a lineage portion with inherited SourceExpirationFact, FoodLifecycleEvent, activated ShelfLifeRule evaluation/evidence and original anchors. Redistribution must not reset those facts.

## 7. Inventory counting and reconciliation

### `inventory_count`

- `inventory_count_id` PK;
- `household_id` FK REQ;
- session metadata;
- optional atomic/frozen snapshot token/cutoff only when genuinely authoritative for all lines;
- lifecycle/status.

### `inventory_count_item`

- `inventory_count_item_id` PK;
- `household_id`;
- `inventory_count_id`;
- counted `product_id`;
- exact observed rational quantity + unit;
- optional matched `stock_item_id`;
- placement anchor where relevant;
- authoritative per-line observation time;
- ledger as-of/cutoff identity/time;
- optional causal ordering discriminator + ordering-domain identity;
- reconciliation status.

Unmatched discovered stock is representable without inventing an earlier StockItem.

### `inventory_count_allocation`

Used only when a count line can deterministically allocate observed/discrepant quantity among multiple holdings.

- count item FK;
- target StockItem FK;
- exact rational allocated quantity/unit;
- allocation decision evidence/provenance.

Ambiguous aggregate counts remain staged/unresolved rather than receiving arbitrary allocations.

### `inventory_reconciliation_outcome`

IMM/append-only reconciliation decision:

- count item FK;
- historical basis/cutoff identity;
- included movement/evidence set reference;
- status (`NO_CHANGE`, `ADJUSTED`, `UNRESOLVED`, `BLOCKED`, `COMPENSATED`, equivalent);
- optional adjustment `inventory_movement_id`;
- rationale/evidence.

Equal-time movement/observation facts may be ordered only by trustworthy causal evidence from the same ordering domain; otherwise they remain ambiguous and cannot authorize guessed adjustment/rebase/compensation.

## 8. Recipes and preparation

### `recipe`

- `recipe_id` PK;
- catalog scope/owner;
- canonical recipe identity/metadata;
- lifecycle status.

### `recipe_version`

IMM once published/used by a committed Preparation:

- `recipe_version_id` PK;
- `recipe_id` FK REQ;
- inherited scope/owner;
- version identity;
- yield/scaling metadata;
- effective/published status.

A version cannot widen Recipe scope.

### `recipe_ingredient`

Immutable child of RecipeVersion:

- `recipe_ingredient_id` PK;
- `recipe_version_id` FK REQ;
- `ingredient_concept_id` FK REQ;
- exact required rational quantity + unit;
- optional exact `product_id` constraint;
- optionality/tolerance/governed constraints;
- stable line identity/order.

Global RecipeVersion may reference only global catalog entities. Household RecipeVersion may reference global or same-Household entities.

### `preparation`

- `preparation_id` PK;
- `household_id` FK REQ;
- optional `recipe_version_id` for recipe-based execution;
- authoritative occurrence/commit context;
- preserved scaling inputs/effective yield context;
- status/provenance.

RecipeVersion, if present, must be GLOBAL or owned by the same Household.

### `preparation_input`

- `preparation_input_id` PK;
- `household_id`;
- `preparation_id`;
- source `stock_item_id`;
- `product_id`;
- exact consumed rational quantity + unit.

### `preparation_input_movement`

Links each PreparationInput to one or more authoritative decrement InventoryMovements. Linked committed effects must preserve Product/StockItem lineage and sum exactly to the consumed input quantity.

### `preparation_input_allocation`

- allocation PK;
- PreparationInput FK;
- exact `recipe_ingredient_id` from immutable RecipeVersion snapshot;
- exact allocated rational quantity + unit;
- optional `compatibility_evidence_id` when IngredientConcept compatibility is used;
- deviation/policy references when applicable.

Source-side allocations plus explicit deviations must exhaust PreparationInput quantity. Target-side allocations must reconcile to each RecipeIngredient effective scaled requirement under governed tolerance/deviation policy.

### `preparation_input_deviation`

Explicit source remainder/non-recipe addition/process loss/waste/other governed deviation with exact quantity/unit, classification, reason and provenance.

### `recipe_fulfillment_deviation`

Explicit underage/overage/tolerance/substitution decision against a RecipeIngredient effective requirement.

### `preparation_output`

- `preparation_output_id` PK;
- `household_id`;
- `preparation_id`;
- `product_id`;
- exact produced rational quantity + unit.

### `preparation_output_movement`

Links outputs to authoritative increment InventoryMovement effects. Effects must represent the same Product and sum exactly to output quantity.

## 9. Shelf life and lifecycle

### `food_lifecycle_event`

IMM:

- `food_lifecycle_event_id` PK;
- `household_id`;
- `stock_item_id` or lineage subject;
- event kind such as opening/state change;
- authoritative occurrence time;
- provenance.

### `shelf_life_rule`

Versioned governed rule:

- `shelf_life_rule_id` PK;
- catalog scope/owner;
- rule family/semantic trigger group;
- applicability target alternative (Product, IngredientConcept, governed classification);
- trigger/storage predicates;
- priority/specificity metadata;
- version/effective interval;
- temporal duration amount/unit;
- temporal basis (`ELAPSED` or `LOCAL_CALENDAR`);
- endpoint/timezone/version semantics required by DB-00.

Calendar durations accept only the DB-00-governed integral semantics.

### `shelf_life_rule_activation`

IMM decision fact for a rule activated for a concrete stock lineage.

- activation PK;
- `household_id`;
- rule identity/version;
- StockItem/lineage subject;
- authoritative activation anchor;
- selected timezone/context version;
- optional CompatibilityDecisionEvidence for concept-targeted rules;
- preserved evaluation inputs/provenance.

### `effective_expiration`

Derived/materializable projection with reproducible provenance:

- projection identity;
- `household_id`;
- StockItem/lineage subject;
- effective expiration value/precision;
- candidate-combination result;
- derivation version/status.

### `effective_expiration_candidate`

Links one EffectiveExpiration calculation to source candidates from SourceExpirationFact and/or ShelfLifeRuleActivation, preserving candidate semantics and comparison result. Earliest applicable candidate semantics remain governed by DB-00.

## 10. Shopping and replenishment

### `household_product_policy`

- policy PK;
- `household_id`;
- `product_id` visible to Household;
- optional exact desired/minimum quantity + unit;
- policy metadata.

### `shopping_list`

- `shopping_list_id` PK;
- `household_id`;
- lifecycle metadata.

### `shopping_list_item`

- `shopping_list_item_id` PK;
- `household_id`;
- ShoppingList FK;
- subject XOR:
  - `product_id`, or
  - `ingredient_concept_id`;
- exact requested rational quantity + unit;
- unresolved source text only as provenance, never canonical fulfillment identity;
- status.

### `shopping_list_fulfillment`

- fulfillment PK;
- `household_id`;
- ShoppingListItem FK;
- PurchaseItem FK;
- exact allocated rational quantity + unit;
- optional CompatibilityDecisionEvidence for concept-targeted item;
- provenance.

All ShoppingListFulfillment allocations for one PurchaseItem share the shopping-intent attribution pool and cannot exceed purchased quantity after exact conversion. This pool is independent from physical receiving allocation.

## 11. Alerts and notifications

### `alert_rule`

- `alert_rule_id` PK;
- `household_id` FK REQ for Household-derived operational rules;
- governed subject/scope;
- condition/configuration;
- lifecycle/version metadata.

### `alert`

- `alert_id` PK;
- `household_id`;
- AlertRule FK;
- triggering subject/context;
- detection occurrence/recording provenance;
- state.

### `notification_delivery`

- `notification_delivery_id` PK;
- `household_id`;
- Alert FK REQ;
- recipient/destination/channel;
- attempt/delivery state;
- decision/attempt provenance.

Alert state and delivery state are independent.

## 12. Integrations and imports

### `integration`

- `integration_id` PK;
- explicit scope/binding type;
- optional `household_id` when Household-affecting;
- provider/account metadata;
- secure credential reference only, never arbitrary secret JSON;
- lifecycle state.

### `import_run`

- `import_run_id` PK;
- `household_id` FK REQ for inventory-affecting imports;
- Integration FK;
- source/run identity;
- timestamps/status/provenance.

### `external_reference`

- `external_reference_id` PK;
- `household_id` when reference participates in Household operational reconciliation;
- Integration/ImportRun provenance;
- provider namespace/type/value;
- canonical target reference where resolved;
- lifecycle/status.

Provider identifiers never grant Household authority.

## 13. Audit, idempotency and outbox

### `audit_event`

Append-only auditable action record distinct from inventory history, domain event streams and application logs.

- audit event PK;
- optional/direct Household context;
- actor/principal;
- action;
- target entity identity;
- occurrence/recording time;
- trace/provenance metadata.

### `idempotency_record`

- `idempotency_record_id` PK;
- target scope identity including `household_id` for Household operations;
- authenticated actor/trusted principal identity;
- command/operation identity and version;
- client idempotency key;
- canonical request fingerprint;
- execution state;
- committed response/result reference;
- retention/expiry state.

Candidate key: `(target_scope, principal, operation_or_command, client_key)`.

A key alone is never globally unique. Matching key identity with a different fingerprint/target/version is a conflict, not a new execution.

### `outbox_record`

Durable publication boundary associated with the database transaction that commits the business mutation.

- `outbox_record_id` PK;
- Household/context where applicable;
- event/message contract identity and version;
- aggregate/business fact identity;
- payload/reference;
- publication lifecycle timestamps/status.

Outbox publication state does not change whether the underlying business mutation committed.

## 14. Relational ownership summary

Direct Household scope is required at minimum on:

- HouseholdMembership;
- StorageLocation / Compartment;
- Household-private catalog entities and mappings;
- StagedIdentifierClaim;
- Purchase / PurchaseItem / Receipt / ReceiptItem and related allocations/exceptions;
- StockItem / SourceExpirationFact / InventoryMovement / InventoryTransfer / Count and reconciliation facts;
- Preparation and all input/output/allocation/deviation facts;
- Household shelf-life activations/effective projections;
- HouseholdProductPolicy / ShoppingList and fulfillment;
- AlertRule / Alert / NotificationDelivery;
- Household-affecting Integration / ImportRun / ExternalReference;
- Household-scoped AuditEvent / IdempotencyRecord / OutboxRecord.

A child relation carrying `household_id` must agree with every Household-owning parent it references. The database contract must make mismatched cross-Household composition impossible within one committed business fact.

## 15. Authoritative versus derived facts

Authoritative/history-bearing examples:

- Purchase/Receipt committed facts;
- InventoryMovement;
- InventoryTransfer identity/effects;
- Inventory reconciliation outcomes;
- RecipeVersion and its ingredient snapshot once committed/published for use;
- Preparation input/output facts and allocations;
- SourceExpirationFact / FoodLifecycleEvent / ShelfLifeRuleActivation;
- MeasurementConversionEvidence / CompatibilityDecisionEvidence;
- committed ShoppingListFulfillment;
- IdempotencyRecord outcome identity;
- AuditEvent and OutboxRecord.

Derived/materializable examples:

- current StockItem balance;
- current storage occupancy;
- EffectiveExpiration projection;
- alert/read models;
- analytical purchase unit cost allocations not present in source transaction.

A derived relation must be rebuildable from authoritative facts plus explicitly versioned rules/evidence.
