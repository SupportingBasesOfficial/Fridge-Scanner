# FridgeScanner — Logical Relational Model

## Status and notation

This document is the DB-01 logical persistence model derived from accepted DB-00 contracts. Names are logical relation names, not final SQL identifiers.

Notation:

- `PK` — logical primary identity.
- `FK` — logical foreign-key relationship.
- `UQ` — candidate/unique key.
- `REQ` — mandatory.
- `OPT` — optional.
- `IMM` — immutable after commit except governed correction/status metadata.
- `XOR` — exactly one alternative must be selected.

Every Household-owned operational relation below includes `household_id` directly unless explicitly described as globally scoped reference data. When a child and parent both carry Household scope, equality is part of the relational contract.

## 1. Identity and Household boundary

### `user_profile`

- `user_id` PK;
- profile/display metadata;
- lifecycle status.

Authentication credentials are outside this food-management domain. No global Household role exists on User.

### `household`

- `household_id` PK;
- canonical display/name metadata;
- lifecycle status;
- optional current `household_timezone_version_id` pointer for operational reads.

The current timezone pointer is convenience/current state only. Historical interpretation resolves through immutable versioned timezone facts.

### `household_membership`

- `membership_id` PK;
- `household_id` FK REQ;
- `user_id` FK REQ;
- household-scoped authority/role;
- membership lifecycle/effective interval.

Candidate key: active membership uniqueness for `(household_id, user_id)` under the governed lifecycle policy.

### `household_timezone_version`

IMM once superseded or referenced by committed history.

- `household_timezone_version_id` PK;
- `household_id` FK REQ;
- governed IANA timezone/context;
- version identity;
- effective-from domain instant REQ;
- optional effective-to domain instant;
- provenance/actor/reason.

Effective intervals for one Household cannot overlap ambiguously. Historical evidence references the exact version selected at its preserved domain anchor when Household timezone semantics participate.

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

Parent StorageLocation and Compartment must share Household.

## 3. Catalog governance

Product, IngredientConcept, Recipe, ShelfLifeRule and governed compatibility mappings use:

- `catalog_scope ∈ {GLOBAL, HOUSEHOLD}`;
- conditional `owner_household_id`.

GLOBAL requires no owner; HOUSEHOLD requires exactly one owner.

### `ingredient_concept`

- `ingredient_concept_id` PK;
- catalog scope/owner;
- semantic name/classification metadata;
- lifecycle metadata.

### `product`

- `product_id` PK;
- catalog scope/owner;
- canonical identity/name metadata;
- optional `brand_id`;
- optional `manufacturer_id`;
- optional `product_category_id`;
- lifecycle state.

### `brand`

Global reference identity for brand metadata unless future governance explicitly introduces scoped brands.

### `manufacturer`

Distinct global reference identity for manufacturer metadata.

### `product_category`

- `product_category_id` PK;
- optional parent category FK;
- governed category metadata.

The hierarchy must remain acyclic. ProductCategory is not implicitly the universal future ShelfLifeRule classification taxonomy.

### `product_identifier_normalization_rule`

- `normalization_rule_id` PK;
- identifier scheme;
- issuer/namespace applicability;
- rule version;
- effective interval/status;
- exact normalization semantics.

### `product_identifier`

- `product_identifier_id` PK;
- `product_id` FK REQ;
- scheme REQ;
- issuer/namespace when required;
- exact source value REQ;
- normalized value REQ;
- `normalization_rule_id` FK REQ;
- lifecycle/status/provenance.

Candidate uniqueness follows `(scheme, issuer_or_namespace, normalization_rule_version, normalized_value)`, omitting issuer only for a scheme with one governed global namespace. A globally namespaced canonical identifier may reference only a GLOBAL Product.

### `staged_identifier_claim`

Household-scoped unresolved evidence that does not consume canonical identifier uniqueness.

- `staged_identifier_claim_id` PK;
- `household_id` FK REQ;
- optional same-Household private `product_id` candidate;
- scheme/source/normalized evidence;
- normalization rule/version evidence;
- provenance/status;
- optional governed resolution/promotion reference.

### `product_ingredient_compatibility`

Versioned governed Product↔IngredientConcept mapping.

- `compatibility_mapping_id` PK identifying the exact versioned mapping;
- catalog scope/owner;
- `product_id` FK REQ;
- `ingredient_concept_id` FK REQ;
- version/effective interval;
- constraints/policy metadata;
- lifecycle status.

GLOBAL mapping references only GLOBAL entities. HOUSEHOLD mapping may reference GLOBAL or same-Household entities, never another Household's private catalog data.

### `compatibility_decision_evidence`

IMM committed decision evidence.

- `compatibility_evidence_id` PK;
- Product and IngredientConcept identities;
- exact mapping identity/version;
- evaluation/effective anchor;
- constraints/provenance/approval evidence.

## 4. Measurement and money

### `measurement_unit`

- `measurement_unit_id` PK;
- dimension/class;
- symbol/name;
- governed metadata.

### `measurement_conversion_rule`

Versioned conversion/profile definition for permitted contextual/package/cross-dimension conversion.

### `measurement_conversion_evidence`

IMM:

- `measurement_conversion_evidence_id` PK;
- source exact rational quantity/unit;
- target exact rational quantity/unit;
- exact rational factor/formula inputs;
- conversion rule/profile identity/version;
- evaluation/effective context;
- provenance.

All authoritative conserved/reconciled quantities use lossless rational semantics plus MeasurementUnit. DB-02 chooses the physical encoding; binary floating point or rounded display values cannot decide conservation equality.

### `purchase_money_fact`

- `purchase_money_fact_id` PK;
- `household_id` FK REQ;
- `purchase_id` FK REQ;
- exact monetary amount;
- currency;
- semantic role such as discount/tax/fee/charge;
- source-versus-derived provenance;
- governed rounding/allocation metadata where relevant.

### `purchase_item_money_fact`

- `purchase_item_money_fact_id` PK;
- `household_id` FK REQ;
- `purchase_item_id` FK REQ;
- semantic role REQ;
- exact monetary amount;
- currency;
- source-versus-derived provenance;
- governed rounding policy/context.

Pricing basis, line gross, discount, tax/charge and line net are distinct semantic facts, never an unlabeled generic price.

## 5. Procurement and receiving

### `purchase`

- `purchase_id` PK;
- `household_id` FK REQ;
- transaction/source identity;
- transaction currency/context;
- occurrence/recording times;
- merchant/provider provenance.

### `purchase_item`

- `purchase_item_id` PK;
- `household_id` FK REQ;
- `purchase_id` FK REQ;
- `product_id` FK REQ and visible to Household;
- purchased exact rational quantity/unit;
- optional pricing-basis exact rational quantity/unit;
- pricing/conversion provenance.

### `purchase_item_pricing_discrepancy`

- discrepancy PK;
- `household_id`;
- `purchase_item_id`;
- source/computed money evidence;
- quantity/conversion evidence;
- rounding policy/context;
- reason/status/resolution provenance.

### `receipt`

- `receipt_id` PK;
- `household_id` FK REQ;
- optional `purchase_id` when the whole receiving operation belongs to one known Purchase;
- authoritative receiving occurrence time;
- recording/source provenance.

If Receipt has Purchase provenance, allocations under it target only PurchaseItems of that Purchase. Receipt without Purchase remains valid.

### `receipt_item`

Represents what physically arrived; it does not directly consume a PurchaseItem allowance.

- `receipt_item_id` PK;
- `household_id` FK REQ;
- `receipt_id` FK REQ;
- `product_id` FK REQ;
- exact rational received quantity/unit;
- source/provenance.

### `purchase_item_receipt_allocation`

Ordinary same-Product receiving allocation.

- `purchase_item_receipt_allocation_id` PK;
- `household_id` FK REQ;
- `purchase_item_id` FK REQ;
- `receipt_item_id` FK REQ;
- exact allocated rational quantity/unit;
- conversion evidence when required;
- provenance.

PurchaseItem Product equals ReceiptItem Product. ReceiptItem ordinary+substitution attribution cannot exceed what arrived. PurchaseItem ordinary+substitution allocation cannot exceed purchased quantity as normal fulfillment.

### `purchase_item_substitution_allocation`

Explicit different-Product exception allocation.

- `purchase_item_substitution_allocation_id` PK;
- `household_id` FK REQ;
- `purchase_item_id` FK REQ;
- `receipt_item_id` FK REQ;
- requested Product = PurchaseItem Product;
- received Product = ReceiptItem Product;
- exact substituted rational quantity/unit;
- conversion evidence when required;
- reason/approval/provenance.

### `receipt_item_inventory_effect`

Line-to-ledger materialization relation.

- `receipt_item_inventory_effect_id` PK;
- `household_id` FK REQ;
- `receipt_item_id` FK REQ;
- inventory-entry `inventory_movement_id` FK REQ UQ for this semantic role;
- exact rational quantity portion/unit;
- conversion evidence when applicable.

Each linked movement is a positive inventory-entry effect for the same Household/Product; the relation's quantity portion reconciles exactly to that movement effect after valid conversion. Across all links, portions sum exactly to ReceiptItem quantity.

### `purchase_receiving_exception`

- exception PK;
- `household_id`;
- relevant PurchaseItem/ReceiptItem/allocation references;
- exact discrepant quantity/unit;
- kind/status;
- reason/approval/correction provenance.

Over-receipt is explicit exception state, never ordinary fulfillment.

## 6. Inventory core and ledger

### `batch`

- `batch_id` PK;
- `product_id` FK REQ;
- manufacturer/commercial lot facts;
- optional batch-level production/expiration facts.

Batch is optional provenance, never stock placement and never required merely for Product or expiration identity.

### `stock_item`

- `stock_item_id` PK;
- `household_id` FK REQ;
- `product_id` FK REQ;
- optional `batch_id` FK;
- current lifecycle/status;
- current placement XOR: direct `storage_location_id`, `compartment_id`, or explicit governed unplaced state;
- optional current-state projection metadata.

Batch, if present, belongs to the same Product. Placement resolves to the same Household. Current quantity may be materialized only as a projection; committed InventoryMovement history is authoritative.

### `source_expiration_fact`

IMM:

- `source_expiration_fact_id` PK;
- `household_id` FK REQ;
- `stock_item_id` FK REQ;
- optional Batch/ReceiptItem provenance;
- exact source expiration with original precision/semantics;
- authoritative occurrence/source temporal anchor;
- optional source timezone/offset context;
- optional exact `household_timezone_version_id` when Household timezone semantics were used;
- provenance.

### `inventory_movement`

Authoritative IMM stock delta.

- `inventory_movement_id` PK;
- `household_id` FK REQ;
- movement kind;
- `product_id` FK REQ;
- exact signed rational quantity/unit;
- affected `stock_item_id` where a concrete holding exists;
- authoritative domain occurrence time;
- recording/commit time;
- optional trustworthy causal ordering discriminator + ordering-domain identity;
- immutable placement snapshot/effect anchor when placement-sensitive;
- provenance/causation;
- optional correction/compensation relationship.

When StockItem is present, Household/Product agree. Quantity is non-zero and sign agrees with movement class. Committed Product, quantity, occurrence ordering evidence and historical provenance are immutable.

### `inventory_transfer`

- `inventory_transfer_id` PK;
- `household_id` FK REQ;
- Product identity;
- exact transferred rational quantity/unit;
- authoritative occurrence/provenance;
- immutable source placement snapshot;
- immutable destination placement snapshot.

### `inventory_transfer_effect`

One row per transfer:

- `inventory_transfer_effect_id` PK;
- `household_id` FK REQ;
- `inventory_transfer_id` FK REQ UQ;
- source-decrement `inventory_movement_id` FK REQ UQ;
- destination-increment `inventory_movement_id` FK REQ UQ.

Both effects share Household/Product with transfer and conserve exactly the transfer quantity with correct signs.

### `inventory_quantity_lineage`

IMM same-Product conserved edge for split/transfer/merge/redistribution.

- `inventory_quantity_lineage_id` PK;
- `household_id` FK REQ;
- source `inventory_movement_id` FK REQ;
- destination `inventory_movement_id` FK REQ;
- optional source/destination StockItem FKs;
- `product_id` FK REQ;
- exact rational lineage quantity/unit;
- conversion evidence where required;
- lineage operation/causation identity;
- provenance.

For any movement/effect declared as a lineage-redistribution source, outgoing lineage edges for that operation sum exactly to the redistributed source quantity; disappearance is not represented by an unlinked remainder. If part of a holding is genuinely consumed/wasted/transformed, that terminal/transformation effect is represented explicitly by its own InventoryMovement/domain operation rather than disguised as missing lineage.

For a lineage-derived destination effect, incoming edges sum exactly to the destination quantity. Same-Product lineage never transforms Product identity. Product-transforming Preparation uses its own input/output conservation model.

### `quantity_lineage_shelf_life_fact`

IMM relation attaching inherited SourceExpirationFact, FoodLifecycleEvent or ShelfLifeRuleActivation to an exact lineage edge/quantity portion, retaining original anchors/evidence. Every applicable source shelf-life fact propagates to the conserved destination portion.

## 7. Waste and disposal

### `waste_record`

Durable waste/disposal semantic record distinct from the quantity ledger effect.

- `waste_record_id` PK;
- `household_id` FK REQ;
- authoritative occurrence time;
- waste/disposal reason/classification;
- actor/source/provenance;
- optional explanatory metadata.

### `waste_record_movement`

Explicit link from WasteRecord to one or more authoritative stock-reducing InventoryMovements.

- `waste_record_movement_id` PK;
- `household_id` FK REQ;
- `waste_record_id` FK REQ;
- waste/disposal `inventory_movement_id` FK REQ UQ for this semantic role;
- exact rational quantity portion/unit;
- conversion evidence when applicable.

Each linked movement is a stock-reducing waste/disposal effect in the same Household. Its linked quantity portion reconciles exactly with that movement effect. Waste reason/classification never becomes a second quantity truth; InventoryMovement remains authoritative.

## 8. Inventory counting and reconciliation

### `inventory_count`

- `inventory_count_id` PK;
- `household_id` FK REQ;
- session metadata;
- optional atomic/frozen snapshot reference when genuinely authoritative for all lines;
- lifecycle/status.

### `inventory_ledger_basis`

IMM domain reconciliation basis, not necessarily a database/MVCC snapshot.

- `inventory_ledger_basis_id` PK;
- `household_id` FK REQ;
- basis scope sufficient to reconstruct the relevant ledger stream/subject;
- captured cutoff/watermark identity;
- authoritative cutoff/ordering context;
- optional trustworthy snapshot token;
- capture provenance.

One basis may be reused across count lines only when a genuinely atomic/frozen snapshot or equivalent authoritative token applies to all of them.

### `inventory_count_item`

- `inventory_count_item_id` PK;
- `household_id` FK REQ;
- `inventory_count_id` FK REQ;
- counted `product_id` FK REQ;
- exact observed rational quantity/unit;
- optional matched StockItem;
- placement anchor when relevant;
- authoritative per-line observation time;
- `inventory_ledger_basis_id` FK REQ;
- optional causal ordering discriminator + ordering domain for the observation;
- reconciliation status.

Unmatched discovered physical stock is valid without fabricating a prior StockItem.

### `inventory_count_allocation`

- `inventory_count_allocation_id` PK;
- `household_id`;
- count item FK;
- target StockItem FK;
- exact allocated rational quantity/unit;
- allocation decision evidence/provenance.

Only deterministic allocation is committable. Ambiguous aggregate counts remain staged/unresolved.

### `inventory_reconciliation_outcome`

IMM/append-only:

- `inventory_reconciliation_outcome_id` PK;
- `household_id`;
- count item FK;
- `inventory_ledger_basis_id` FK REQ;
- included movement/evidence-set identity;
- status such as NO_CHANGE/ADJUSTED/UNRESOLVED/BLOCKED/COMPENSATED;
- optional adjustment `inventory_movement_id` FK UQ for this reconciliation role;
- rationale/evidence;
- decision provenance.

Equal timestamps alone are not causal order. Without trustworthy same-ordering-domain evidence, the case remains ambiguous and cannot authorize guessed rebase/preservation/compensation.

## 9. Recipes and preparation

### `recipe`

- `recipe_id` PK;
- catalog scope/owner;
- canonical identity/metadata;
- lifecycle status.

### `recipe_version`

IMM once published or used by a committed Preparation.

- `recipe_version_id` PK;
- `recipe_id` FK REQ;
- inherited scope/owner;
- version identity;
- yield/scaling metadata;
- effective/published status.

### `recipe_ingredient`

Immutable RecipeVersion child:

- `recipe_ingredient_id` PK;
- `recipe_version_id` FK REQ;
- `ingredient_concept_id` FK REQ;
- exact required rational quantity/unit;
- optional exact Product constraint;
- optionality/tolerance/governed constraints;
- stable line identity/order.

Global versions reference only global catalog entities; Household versions may reference global or same-Household entities.

### `preparation`

- `preparation_id` PK;
- `household_id` FK REQ;
- optional `recipe_version_id` for recipe-based execution;
- authoritative occurrence/commit context;
- preserved scaling/yield inputs/context;
- status/provenance.

RecipeVersion must be GLOBAL or same-Household.

### `preparation_input`

- `preparation_input_id` PK;
- `household_id` FK REQ;
- `preparation_id` FK REQ;
- source `stock_item_id` FK REQ;
- `product_id` FK REQ;
- exact consumed rational quantity/unit.

### `preparation_input_movement`

- relation PK;
- `household_id`;
- PreparationInput FK;
- decrement `inventory_movement_id` FK REQ UQ for this semantic role;
- exact quantity portion/unit;
- conversion evidence when applicable.

Each linked movement belongs to the same Household/Product/source lineage and the relation portion reconciles exactly to that movement effect. Across all links, portions sum exactly to PreparationInput quantity. One decrement movement cannot be reused to satisfy multiple PreparationInputs.

### `preparation_input_allocation`

- allocation PK;
- `household_id`;
- PreparationInput FK;
- exact RecipeIngredient FK from immutable RecipeVersion;
- exact allocated rational quantity/unit;
- optional CompatibilityDecisionEvidence;
- policy/deviation reference when applicable.

Source-side allocations plus explicit deviations exhaust each input. Target-side allocations reconcile each scaled RecipeIngredient requirement under governed tolerance/deviation rules.

### `preparation_input_deviation`

Explicit source remainder/non-recipe addition/process loss/waste/other governed deviation with exact quantity/unit, classification, reason and provenance.

### `recipe_fulfillment_deviation`

Explicit underage/overage/tolerance/substitution decision against a RecipeIngredient effective requirement.

### `preparation_output`

- `preparation_output_id` PK;
- `household_id` FK REQ;
- `preparation_id` FK REQ;
- `product_id` FK REQ;
- exact produced rational quantity/unit.

### `preparation_output_movement`

- relation PK;
- `household_id`;
- PreparationOutput FK;
- increment `inventory_movement_id` FK REQ UQ for this semantic role;
- exact quantity portion/unit;
- conversion evidence when applicable.

Each linked movement belongs to same Household/Product, the relation portion reconciles exactly to that movement effect, and all linked portions sum exactly to PreparationOutput quantity. One increment movement cannot be reused to materialize multiple PreparationOutputs.

Preparation is the explicit Product-transformation boundary; it is not same-Product InventoryQuantityLineage.

## 10. Shelf life and lifecycle

### `food_lifecycle_event`

IMM:

- `food_lifecycle_event_id` PK;
- `household_id` FK REQ;
- originating `stock_item_id` FK REQ;
- event kind;
- authoritative occurrence time;
- provenance.

Later redistribution inherits the event through quantity-lineage evidence; the original subject is not rewritten.

### `shelf_life_rule`

Versioned governed rule:

- `shelf_life_rule_id` PK identifying exact rule version;
- catalog scope/owner;
- semantic trigger/deadline group;
- current DB-01 applicability target XOR: Product or IngredientConcept;
- trigger/storage predicates;
- priority/specificity metadata;
- version/effective interval;
- temporal duration amount/unit;
- temporal basis (`ELAPSED` or `LOCAL_CALENDAR`);
- endpoint semantics;
- governed timezone-selection semantics where required.

DB-00 permits “another governed classification introduced later.” That is an explicit future schema-evolution point, not a generic untyped target in DB-01. A classification target becomes valid only after its typed governed relation/version/reference contract is reviewed and added. ProductCategory is not silently assumed to be that universal taxonomy.

### `shelf_life_rule_activation`

IMM:

- `shelf_life_rule_activation_id` PK;
- `household_id` FK REQ;
- exact ShelfLifeRule FK;
- originating StockItem FK;
- authoritative activation anchor;
- optional exact HouseholdTimezoneVersion selected when Household timezone was used;
- optional more-specific source temporal context;
- optional CompatibilityDecisionEvidence for concept-targeted rules;
- preserved evaluation inputs/provenance.

Later redistribution inherits activation through lineage evidence.

### `effective_expiration`

Derived/materializable current projection:

- `effective_expiration_id` PK;
- `household_id` FK REQ;
- `stock_item_id` FK REQ;
- effective expiration value/precision;
- candidate-combination result;
- derivation version/status;
- recomputation provenance.

At most one active current projection exists per StockItem/derivation contract version.

### `effective_expiration_candidate`

- candidate PK;
- `household_id`;
- EffectiveExpiration FK;
- source XOR: SourceExpirationFact or ShelfLifeRuleActivation;
- candidate value/precision;
- comparison/timezone context;
- selected/rejected outcome/reason.

Candidate must be applicable to the same Household and StockItem lineage history. Earliest-applicable composition remains governed by DB-00.

## 11. Shopping and replenishment

### `household_product_policy`

- policy PK;
- `household_id` FK REQ;
- visible `product_id` FK REQ;
- optional exact desired/minimum quantity/unit;
- policy metadata.

### `shopping_list`

- `shopping_list_id` PK;
- `household_id` FK REQ;
- lifecycle metadata.

### `shopping_list_item`

- item PK;
- `household_id` FK REQ;
- ShoppingList FK REQ;
- subject XOR: Product or IngredientConcept;
- exact requested rational quantity/unit;
- unresolved free text as provenance only;
- status.

### `shopping_list_fulfillment`

- fulfillment PK;
- `household_id` FK REQ;
- ShoppingListItem FK;
- PurchaseItem FK;
- exact allocated rational quantity/unit;
- optional CompatibilityDecisionEvidence for concept target;
- conversion evidence when applicable;
- provenance.

All fulfillments from one PurchaseItem share the distinct shopping-intent pool and cannot exceed purchased quantity. This pool is independent from physical receiving.

## 12. Alerts and notifications

### `alert_rule`

- `alert_rule_id` PK;
- `household_id` FK REQ for Household-derived operational rules;
- governed subject/scope descriptor defined by rule type;
- condition/configuration;
- lifecycle/version metadata.

Referentially significant targets use typed FK/association relations, not unconstrained generic IDs.

### `alert`

- `alert_id` PK;
- `household_id` FK REQ;
- AlertRule FK REQ;
- triggering subject/context typed according to rule;
- detection occurrence/recording provenance;
- state.

### `notification_delivery`

- `notification_delivery_id` PK;
- `household_id` FK REQ;
- Alert FK REQ;
- recipient/destination/channel;
- attempt/delivery state;
- decision/attempt provenance.

Alert state and delivery state are independent. A future global user notification preference may influence delivery only; it cannot grant Household authority and is not required for this DB-01 baseline.

## 13. Integrations and imports

### `integration`

- `integration_id` PK;
- scope/binding type;
- optional `household_id` when Household-affecting;
- provider/account metadata;
- secure credential reference only;
- lifecycle state.

### `import_run`

- `import_run_id` PK;
- `household_id` FK REQ for inventory-affecting import;
- Integration FK;
- source/run identity;
- timestamps/status/provenance.

### `external_reference`

- `external_reference_id` PK;
- `household_id` when Household-operational;
- Integration/ImportRun provenance;
- provider namespace/type/value;
- typed canonical target where resolved;
- lifecycle/status.

Uniqueness/resolution is scoped by provider/integration namespace, type/value and Household when applicable. Provider identity never grants Household authority.

## 14. Audit, idempotency and outbox

### `audit_event`

Append-only auditable action evidence distinct from ledger/domain history.

- audit PK;
- optional/direct Household context;
- actor/principal;
- action;
- target type/stable identity as evidentiary metadata;
- occurrence/recording time;
- trace/provenance.

Generic audit target identity does not replace typed business FKs.

### `idempotency_record`

- idempotency PK;
- target scope class;
- `household_id` REQ for Household commands, absent only for explicitly governed non-Household commands;
- principal identity;
- command/operation identity/version;
- client key;
- canonical request fingerprint;
- execution state;
- committed result reference;
- retention/expiry state.

Candidate key: `(target_scope, household_or_global_scope_identity, principal, operation, client_key)`. Reuse with a different fingerprint/target/version is conflict, not execution.

### `outbox_record`

- outbox PK;
- Household/context where applicable;
- event/message contract identity/version;
- aggregate/business fact identity;
- payload or immutable payload reference;
- publication lifecycle/status/timestamps.

Outbox is committed in the same durable database transaction as the business mutation requiring publication.

## 15. Ownership summary

Direct Household scope is required at minimum on HouseholdMembership/TimezoneVersion, storage topology, Household-private catalog/evidence, procurement/receiving allocations/effects, inventory/ledger/lineage/waste/count/reconciliation, preparation facts, shelf-life activations/projections, shopping, alerts, Household integrations/imports/references, and Household-scoped audit/idempotency/outbox facts.

A child carrying Household scope must agree with every Household-owning parent it references.

## 16. Authoritative versus derived

Authoritative/history-bearing examples include HouseholdTimezoneVersion; Purchase/Receipt facts and allocations; InventoryMovement; Transfer effects and exact lineage; WasteRecord semantics linked to ledger effects; InventoryLedgerBasis and reconciliation outcomes; immutable RecipeVersion/ingredients; Preparation inputs/outputs/allocations/deviations; SourceExpirationFact, FoodLifecycleEvent and ShelfLifeRuleActivation; conversion/compatibility evidence; committed ShoppingListFulfillment; IdempotencyRecord; AuditEvent; OutboxRecord.

Derived/materializable examples include current StockItem balance, occupancy, EffectiveExpiration, alert/read models and analytical monetary allocations not present in source truth.

Every derived value must be rebuildable from authoritative facts plus preserved versioned decision evidence.

## 17. Explicit logical non-conflations

DB-01 preserves at least these separations:

- User profile vs Household authority;
- global catalog vs Household-private ownership;
- canonical identifier vs staged identifier evidence;
- Product vs Batch vs StockItem;
- ReceiptItem vs PurchaseItem allocation vs InventoryMovement effect;
- physical receiving pool vs shopping-intent pool;
- StockItem current placement vs historical placement effects;
- current balance projection vs InventoryMovement truth;
- InventoryTransfer identity vs paired ledger effects;
- same-Product lineage vs Product-transforming Preparation;
- WasteRecord reason/classification vs stock-reducing ledger effect;
- count observation vs InventoryLedgerBasis vs reconciliation outcome/adjustment;
- Recipe vs immutable RecipeVersion vs Preparation;
- shelf-life rule definition vs activation vs EffectiveExpiration projection;
- optional notification preference vs Household AlertRule authority;
- provider/external identity vs Household authorization;
- AuditEvent vs domain/inventory history.
