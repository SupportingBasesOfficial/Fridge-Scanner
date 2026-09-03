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

Every Household-owned operational relation below includes `household_id` directly unless explicitly described as globally scoped reference data. When a child and its parent both carry `household_id`, equality is part of the relational contract rather than a convention.

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
- optional pointer/reference to the current governed Household-timezone version for operational reads.

The current timezone pointer is convenience/current state only. Historical temporal interpretation resolves through versioned `household_timezone_version` facts.

### `household_membership`

- `membership_id` PK;
- `household_id` FK REQ;
- `user_id` FK REQ;
- household-scoped role/authority class;
- membership lifecycle/effective interval.

Candidate key: active membership uniqueness for `(household_id, user_id)` under the governed lifecycle policy.

### `household_timezone_version`

IMM once superseded or referenced by committed historical evidence.

Purpose: preserve the governed IANA timezone/context that was effective for a Household at a domain anchor so later Household configuration changes cannot reinterpret historical expiration decisions.

- `household_timezone_version_id` PK;
- `household_id` FK REQ;
- governed IANA timezone identifier/context;
- version identity;
- effective-from domain instant REQ;
- optional effective-to domain instant;
- provenance/actor/reason metadata.

Effective intervals for one Household must not overlap ambiguously. Historical evidence references the exact selected version when Household timezone semantics participate in a committed decision.

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
- lifecycle metadata.

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

Candidate key follows DB-00: `(scheme, issuer_or_namespace, active_normalization_rule_version, normalized_value)`, with issuer omitted only for schemes defined as one global namespace.

Integrity: globally namespaced canonical identifiers may reference only GLOBAL Products.

### `staged_identifier_claim`

Purpose: Household-scoped evidence for an unresolved globally namespaced identifier without consuming the canonical global key.

- `staged_identifier_claim_id` PK;
- `household_id` FK REQ;
- optional private `product_id` candidate constrained to the same Household;
- scheme/source/normalized evidence;
- normalization rule/version evidence;
- provenance/status;
- optional governed resolution/promotion reference.

This relation is excluded from canonical `product_identifier` uniqueness/resolution until governed promotion/resolution.

### `product_ingredient_compatibility`

Versioned governed mapping between Product and IngredientConcept.

- `compatibility_mapping_id` PK identifying the exact versioned mapping fact;
- catalog scope/owner;
- `product_id` FK REQ;
- `ingredient_concept_id` FK REQ;
- governed version/effective interval;
- constraints/policy metadata;
- lifecycle status.

GLOBAL mappings may reference only GLOBAL Product and GLOBAL IngredientConcept. HOUSEHOLD mappings may reference GLOBAL or same-Household entities, never another Household's private entity.

### `compatibility_decision_evidence`

IMM evidence captured by committed decisions.

- `compatibility_evidence_id` PK;
- Product and IngredientConcept identities;
- exact compatibility mapping identity/version;
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

### `purchase_money_fact`

Purpose: preserve Purchase-level monetary facts that the source transaction does not allocate to a line.

- `purchase_money_fact_id` PK;
- `household_id` FK REQ;
- `purchase_id` FK REQ;
- exact monetary amount;
- explicit currency;
- semantic role such as discount/tax/fee/charge;
- source-versus-derived provenance;
- governed rounding/allocation metadata where relevant.

### `purchase_item_money_fact`

Purpose: remove ambiguity between pricing basis, line gross, discount, tax/charge and line net.

- `purchase_item_money_fact_id` PK;
- `household_id` FK REQ;
- `purchase_item_id` FK REQ;
- semantic role REQ;
- exact monetary amount;
- explicit currency;
- source-versus-derived provenance;
- governed rounding policy identity/context.

For a pricing-basis fact, the associated pricing-basis quantity/unit is stored on `purchase_item` or on a dedicated role-specific basis record without ambiguity. Monetary facts are not interchangeable merely because their numeric values match.

## 5. Procurement and receiving

### `purchase`

- `purchase_id` PK;
- `household_id` FK REQ;
- transaction/source identity;
- transaction currency/context;
- occurrence/recording times;
- merchant/provider provenance.

Purchase-level money lives in `purchase_money_fact` where applicable.

### `purchase_item`

- `purchase_item_id` PK;
- `household_id` FK REQ;
- `purchase_id` FK REQ;
- `product_id` FK REQ and visible to Household;
- purchased exact rational quantity + `measurement_unit_id`;
- optional pricing-basis exact rational quantity + pricing-basis unit;
- pricing/conversion provenance.

Parent Household must match Purchase. Role-bearing line money lives in `purchase_item_money_fact`.

### `purchase_item_pricing_discrepancy`

Preserves any source/computed pricing mismatch instead of silently accepting inconsistent gross/unit-cost semantics.

- discrepancy PK;
- `household_id`;
- `purchase_item_id`;
- source and computed monetary facts/amounts;
- quantity/conversion evidence;
- rounding policy/context;
- reason/status/resolution provenance.

### `receipt`

- `receipt_id` PK;
- `household_id` FK REQ;
- optional `purchase_id` provenance when the whole receiving operation belongs to one known Purchase;
- authoritative receiving occurrence time;
- recording/source provenance.

If `receipt.purchase_id` is present, ordinary/substitution allocations under that Receipt must target PurchaseItems belonging to that Purchase. A Receipt with no prior Purchase remains valid and may contain unallocated ad-hoc ReceiptItems.

### `receipt_item`

Represents exactly what physically arrived on one received Product line. It does not itself consume a PurchaseItem allowance.

- `receipt_item_id` PK;
- `household_id` FK REQ;
- `receipt_id` FK REQ;
- `product_id` FK REQ;
- exact rational received quantity + unit;
- source/provenance metadata.

### `purchase_item_receipt_allocation`

Explicit ordinary same-Product receiving allocation.

- `purchase_item_receipt_allocation_id` PK;
- `household_id` FK REQ;
- `purchase_item_id` FK REQ;
- `receipt_item_id` FK REQ;
- exact allocated rational quantity + unit;
- required conversion evidence when contextual conversion is used;
- allocation provenance.

Constraints:

- PurchaseItem Product equals ReceiptItem Product;
- allocation cannot exceed unallocated quantity of the ReceiptItem;
- allocations from all ReceiptItems plus substitutions share the PurchaseItem physical-receiving pool;
- one ReceiptItem may be partially allocated across multiple compatible PurchaseItems when source provenance genuinely requires it, but its total ordinary + substitution attribution cannot exceed what physically arrived.

### `purchase_item_substitution_allocation`

Explicit exception path for a different received Product.

- `purchase_item_substitution_allocation_id` PK;
- `household_id` FK REQ;
- `purchase_item_id` FK REQ;
- `receipt_item_id` FK REQ;
- requested Product identity REQ and equal to PurchaseItem Product;
- received Product identity REQ and equal to ReceiptItem Product;
- exact substituted rational quantity + unit;
- required conversion evidence when applicable;
- reason/approval/provenance.

A substitution allocation is never ordinary same-Product provenance. Ordinary receipt allocations and substitution allocations share one physical receiving availability pool per PurchaseItem and together may consume at most the purchased quantity as normal fulfillment.

### `receipt_item_inventory_effect`

Explicit line-to-ledger materialization link.

- `receipt_item_inventory_effect_id` PK;
- `household_id` FK REQ;
- `receipt_item_id` FK REQ;
- inventory-entry `inventory_movement_id` FK REQ and UQ within this semantic role;
- exact rational quantity portion + unit represented by that effect;
- optional conversion evidence when units differ contextually.

For each committed ReceiptItem, linked entry-effect portions must represent the same Product and sum exactly to the ReceiptItem quantity. A ReceiptItem can produce multiple effects/StockItems when batch, placement or other identity-affecting state requires a split.

### `purchase_receiving_exception`

Represents over-receipt or other governed receipt discrepancies with status/resolution rather than treating excess as normal fulfillment.

- exception PK;
- `household_id`;
- relevant PurchaseItem/ReceiptItem/allocation references;
- exact discrepant quantity/unit;
- exception kind/status;
- reason/approval/correction provenance.

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
  - explicit governed unplaced state;
- optional current-state projection metadata.

Placement integrity: exactly one of direct StorageLocation, Compartment, or explicit unplaced state. If Compartment is chosen, no competing direct StorageLocation value is stored as independent truth. Placement Household must match StockItem Household.

Batch, if present, must belong to the same Product.

Current quantity may be materialized only as a projection/cache; authoritative quantity is reconstructed from committed InventoryMovement.

### `source_expiration_fact`

IMM:

- `source_expiration_fact_id` PK;
- `household_id` FK REQ;
- `stock_item_id` FK REQ;
- optional `batch_id` and/or `receipt_item_id` provenance;
- exact source expiration value with original precision/semantics;
- authoritative fact occurrence/source temporal anchor;
- optional source-provided timezone/offset context;
- optional exact `household_timezone_version_id` selected when Household timezone semantics were required;
- provenance.

Batch is not required merely to preserve a printed expiration.

### `inventory_movement`

Authoritative IMM ledger fact.

- `inventory_movement_id` PK;
- `household_id` FK REQ;
- movement kind;
- `product_id` FK REQ;
- exact signed rational quantity + unit;
- affected `stock_item_id` when a concrete holding exists;
- authoritative domain occurrence time;
- recording/commit time;
- optional trustworthy causal ordering discriminator and ordering-domain identity;
- immutable placement snapshot/effect anchor when placement-sensitive;
- provenance/causation identifiers;
- optional correction/compensation relationship to another movement.

When `stock_item_id` is present, StockItem Household and Product must equal the movement Household and Product. Movement kind determines the permitted sign semantics; zero-quantity committed ledger effects are invalid unless a future explicit non-quantity event class is introduced outside InventoryMovement.

Committed movement business meaning, Product, quantity, occurrence ordering evidence and historical placement/provenance are immutable.

### `inventory_transfer`

- `inventory_transfer_id` PK;
- `household_id` FK REQ;
- Product identity;
- exact transferred rational quantity/unit;
- authoritative occurrence/provenance;
- immutable source placement snapshot;
- immutable destination placement snapshot.

### `inventory_transfer_effect`

Links exactly one transfer to its paired effects:

- `inventory_transfer_effect_id` PK;
- `household_id` FK REQ;
- `inventory_transfer_id` FK REQ UQ;
- source-decrement `inventory_movement_id` FK REQ UQ;
- destination-increment `inventory_movement_id` FK REQ UQ.

Both movements must share Household and Product with the transfer and conserve exactly the transferred quantity after governed exact conversion. Source movement sign/kind is decrement; destination movement sign/kind is increment.

### `inventory_quantity_lineage`

IMM conserved edge connecting one source quantity portion to one destination quantity portion for split, transfer, merge or other lineage-preserving redistribution.

- `inventory_quantity_lineage_id` PK;
- `household_id` FK REQ;
- source `inventory_movement_id` FK REQ;
- destination `inventory_movement_id` FK REQ;
- optional source `stock_item_id` FK;
- optional destination `stock_item_id` FK;
- `product_id` FK REQ;
- exact rational lineage quantity + unit;
- required conversion evidence where contextual conversion participates;
- lineage operation/causation identity;
- provenance.

For each source effect, outgoing lineage portions cannot exceed the source conserved quantity. For each destination effect that is declared lineage-derived, incoming lineage portions must reconcile exactly to the destination quantity except where an explicitly modeled transformation operation (for example Preparation) creates a new Product identity through its own input/output conservation semantics rather than pretending to be a same-Product redistribution.

Same-Product split/transfer/merge lineage cannot transform Product identity.

### `quantity_lineage_shelf_life_fact`

IMM join associating an exact lineage portion with inherited shelf-life facts/evidence.

- join PK;
- `household_id`;
- `inventory_quantity_lineage_id` FK REQ;
- fact alternative identifying one inherited `source_expiration_fact`, `food_lifecycle_event` or `shelf_life_rule_activation`;
- original evaluation/occurrence anchor and evidence reference where needed.

Every applicable source shelf-life fact for the conserved source portion must propagate to the destination portion. Redistribution cannot reset/open-freshen expiry state.

## 7. Inventory counting and reconciliation

### `inventory_count`

- `inventory_count_id` PK;
- `household_id` FK REQ;
- session metadata;
- optional atomic/frozen snapshot reference only when genuinely authoritative for all lines;
- lifecycle/status.

### `inventory_ledger_basis`

IMM reference describing the historical ledger basis used by one or more count lines.

This is a domain reconciliation basis, not necessarily a database/MVCC snapshot.

- `inventory_ledger_basis_id` PK;
- `household_id` FK REQ;
- basis scope identity sufficient to reconstruct the relevant ledger stream/subject;
- captured ledger cutoff/watermark identity;
- authoritative cutoff/ordering context;
- optional snapshot token supplied by a trustworthy source;
- capture provenance.

A session may reuse one basis only when a genuinely atomic/frozen snapshot or equivalent authoritative token applies to all lines. Otherwise each line references its own basis.

### `inventory_count_item`

- `inventory_count_item_id` PK;
- `household_id` FK REQ;
- `inventory_count_id` FK REQ;
- counted `product_id` FK REQ;
- exact observed rational quantity + unit;
- optional matched `stock_item_id`;
- placement anchor where relevant;
- authoritative per-line observation time;
- `inventory_ledger_basis_id` FK REQ;
- optional causal ordering discriminator + ordering-domain identity tied to the observation when available;
- reconciliation status.

Unmatched discovered stock is representable without inventing an earlier StockItem.

### `inventory_count_allocation`

Used only when a count line can deterministically allocate observed/discrepant quantity among multiple holdings.

- `inventory_count_allocation_id` PK;
- `household_id`;
- count item FK;
- target StockItem FK;
- exact rational allocated quantity/unit;
- allocation decision evidence/provenance.

Ambiguous aggregate counts remain staged/unresolved rather than receiving arbitrary allocations.

### `inventory_reconciliation_outcome`

IMM/append-only reconciliation decision:

- `inventory_reconciliation_outcome_id` PK;
- `household_id`;
- count item FK;
- `inventory_ledger_basis_id` FK REQ;
- included movement/evidence-set identity/reference;
- status (`NO_CHANGE`, `ADJUSTED`, `UNRESOLVED`, `BLOCKED`, `COMPENSATED`, equivalent);
- optional adjustment `inventory_movement_id` FK;
- rationale/evidence;
- occurrence/decision provenance.

Equal-time movement/observation facts may be ordered only by trustworthy causal evidence from the same ordering domain; otherwise they remain ambiguous and cannot authorize guessed adjustment/rebase/compensation.

## 8. Recipes and preparation

### `recipe`

- `recipe_id` PK;
- catalog scope/owner;
- canonical recipe identity/metadata;
- lifecycle status.

### `recipe_version`

IMM once published or referenced by a committed Preparation:

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
- `household_id` FK REQ;
- `preparation_id` FK REQ;
- source `stock_item_id` FK REQ;
- `product_id` FK REQ;
- exact consumed rational quantity + unit.

### `preparation_input_movement`

Explicit join from PreparationInput to one or more authoritative decrement InventoryMovements.

- join PK;
- `household_id`;
- PreparationInput FK;
- InventoryMovement FK;
- exact quantity portion/unit represented by the effect;
- conversion evidence when applicable.

Linked committed effects must preserve Household/Product/StockItem lineage and sum exactly to the consumed input quantity.

### `preparation_input_allocation`

- `preparation_input_allocation_id` PK;
- `household_id`;
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
- `household_id` FK REQ;
- `preparation_id` FK REQ;
- `product_id` FK REQ;
- exact produced rational quantity + unit.

### `preparation_output_movement`

Explicit join from PreparationOutput to authoritative increment InventoryMovement effects.

- join PK;
- `household_id`;
- PreparationOutput FK;
- InventoryMovement FK;
- exact quantity portion/unit represented by the effect;
- conversion evidence when applicable.

Effects must represent the same Product and sum exactly to output quantity.

Preparation transforms input Products into output Product identity through explicit Preparation semantics; this is not modeled as same-Product `inventory_quantity_lineage` and therefore cannot accidentally bypass preparation conservation.

## 9. Shelf life and lifecycle

### `food_lifecycle_event`

IMM:

- `food_lifecycle_event_id` PK;
- `household_id` FK REQ;
- `stock_item_id` FK REQ for the concrete event subject at occurrence;
- event kind such as opening/state change;
- authoritative occurrence time;
- provenance.

Inheritance into later split/transfer destinations occurs through quantity lineage evidence, not by rewriting this original subject.

### `shelf_life_rule`

Versioned governed rule:

- `shelf_life_rule_id` PK identifying the exact rule version;
- catalog scope/owner;
- rule family/semantic trigger group;
- applicability target alternative: Product, IngredientConcept, or explicitly governed classification;
- trigger/storage predicates;
- priority/specificity metadata;
- version/effective interval;
- temporal duration amount/unit;
- temporal basis (`ELAPSED` or `LOCAL_CALENDAR`);
- endpoint semantics;
- governed timezone-selection semantics where calendar arithmetic requires them.

Calendar durations accept only DB-00-governed integral semantics and deterministic month/year/DST behavior.

### `shelf_life_rule_activation`

IMM decision fact for a rule activated for a concrete stock quantity/lineage.

- `shelf_life_rule_activation_id` PK;
- `household_id` FK REQ;
- exact `shelf_life_rule_id` FK REQ;
- originating `stock_item_id` FK REQ at activation;
- authoritative activation anchor;
- optional exact `household_timezone_version_id` selected when Household timezone was used;
- optional more-specific governed source temporal context;
- optional `compatibility_evidence_id` for concept-targeted rules;
- preserved evaluation inputs/provenance.

Later redistribution inherits this activation through quantity-lineage evidence rather than changing the original activation subject.

### `effective_expiration`

Derived/materializable projection for one current StockItem/lineage view:

- `effective_expiration_id` PK;
- `household_id` FK REQ;
- `stock_item_id` FK REQ;
- effective expiration value/precision;
- candidate-combination result;
- derivation version/status;
- recomputation provenance.

A StockItem has at most one active current EffectiveExpiration projection for a given derivation contract/version. Historical derivation snapshots may be retained separately when required, but they cannot compete as current truth.

### `effective_expiration_candidate`

Links one EffectiveExpiration calculation to one candidate via constrained source XOR:

- `effective_expiration_candidate_id` PK;
- `household_id`;
- EffectiveExpiration FK;
- source candidate XOR:
  - `source_expiration_fact_id`, or
  - `shelf_life_rule_activation_id`;
- candidate value/precision used for comparison;
- comparison/timezone context;
- selected/rejected outcome and reason.

Earliest-applicable candidate semantics remain governed by DB-00. A candidate cannot point to an unrelated Household/lineage fact.

## 10. Shopping and replenishment

### `household_product_policy`

- `household_product_policy_id` PK;
- `household_id` FK REQ;
- `product_id` FK REQ and visible to Household;
- optional exact desired/minimum quantity + unit;
- policy metadata.

### `shopping_list`

- `shopping_list_id` PK;
- `household_id` FK REQ;
- lifecycle metadata.

### `shopping_list_item`

- `shopping_list_item_id` PK;
- `household_id` FK REQ;
- ShoppingList FK REQ;
- subject XOR:
  - `product_id`, or
  - `ingredient_concept_id`;
- exact requested rational quantity + unit;
- unresolved source text only as provenance, never canonical fulfillment identity;
- status.

### `shopping_list_fulfillment`

- `shopping_list_fulfillment_id` PK;
- `household_id` FK REQ;
- ShoppingListItem FK REQ;
- PurchaseItem FK REQ;
- exact allocated rational quantity + unit;
- optional CompatibilityDecisionEvidence for concept-targeted item;
- conversion evidence when applicable;
- provenance.

All ShoppingListFulfillment allocations for one PurchaseItem share the shopping-intent attribution pool and cannot exceed purchased quantity after exact conversion. This pool is independent from physical receiving allocation.

## 11. Alerts and notifications

### `alert_rule`

- `alert_rule_id` PK;
- `household_id` FK REQ for Household-derived operational rules;
- governed subject/scope descriptor whose allowed target classes are defined by the rule type;
- condition/configuration;
- lifecycle/version metadata.

Where a rule targets a referentially significant domain entity, DB-02 must use a typed FK/association relation rather than an unconstrained generic entity ID.

### `alert`

- `alert_id` PK;
- `household_id` FK REQ;
- AlertRule FK REQ;
- triggering subject/context typed according to the originating rule;
- detection occurrence/recording provenance;
- state.

### `notification_delivery`

- `notification_delivery_id` PK;
- `household_id` FK REQ;
- Alert FK REQ;
- recipient/destination/channel;
- attempt/delivery state;
- decision/attempt provenance.

Alert state and delivery state are independent. A global user notification preference, if later modeled, influences delivery behavior only and cannot grant Household data authority.

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
- typed canonical target reference where resolved;
- lifecycle/status.

Provider identifiers never grant Household authority. Candidate uniqueness is scoped by provider/integration namespace, external reference type/value and Household when the reference is Household-operational; DB-02 must not make an unqualified provider value globally authoritative.

## 13. Audit, idempotency and outbox

### `audit_event`

Append-only auditable action record distinct from inventory history, domain event streams and application logs.

- `audit_event_id` PK;
- optional/direct Household context;
- actor/principal;
- action;
- target type and stable target identity as audit evidence;
- occurrence/recording time;
- trace/provenance metadata.

Audit target identity is evidentiary metadata and does not itself replace the typed domain FK relationships of business facts.

### `idempotency_record`

- `idempotency_record_id` PK;
- target scope class;
- `household_id` REQ for Household operations, absent only for explicitly governed non-Household system/global commands;
- authenticated actor/trusted principal identity;
- command/operation identity and version;
- client idempotency key;
- canonical request fingerprint;
- execution state;
- committed response/result reference;
- retention/expiry state.

Candidate key: `(target_scope, household_or_global_scope_identity, principal, operation_or_command, client_key)`.

A key alone is never globally unique. Matching scoped identity with a different fingerprint/target/version is a conflict, not a new execution.

### `outbox_record`

Durable publication boundary associated with the database transaction that commits the business mutation.

- `outbox_record_id` PK;
- Household/context where applicable;
- event/message contract identity and version;
- aggregate/business fact identity;
- payload or immutable payload reference;
- publication lifecycle timestamps/status.

Outbox publication state does not change whether the underlying business mutation committed.

## 14. Relational ownership summary

Direct Household scope is required at minimum on:

- HouseholdMembership and HouseholdTimezoneVersion;
- StorageLocation / Compartment;
- Household-private catalog entities and mappings;
- StagedIdentifierClaim;
- Purchase / PurchaseItem / Receipt / ReceiptItem and related allocations/effects/exceptions;
- StockItem / SourceExpirationFact / InventoryMovement / InventoryTransfer / quantity lineage / count and reconciliation facts;
- Preparation and all input/output/allocation/deviation facts;
- Household shelf-life activations/effective projections;
- HouseholdProductPolicy / ShoppingList and fulfillment;
- AlertRule / Alert / NotificationDelivery;
- Household-affecting Integration / ImportRun / ExternalReference;
- Household-scoped AuditEvent / IdempotencyRecord / OutboxRecord.

A child relation carrying `household_id` must agree with every Household-owning parent it references. The database contract must make mismatched cross-Household composition impossible within one committed business fact.

## 15. Authoritative versus derived facts

Authoritative/history-bearing examples:

- HouseholdTimezoneVersion;
- Purchase/Receipt committed facts and allocations;
- InventoryMovement;
- InventoryTransfer identity/effects and exact quantity-lineage edges;
- Inventory ledger basis and reconciliation outcomes;
- RecipeVersion and its ingredient snapshot once committed/published for use;
- Preparation input/output facts and allocations/deviations;
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
- analytical purchase unit cost allocations not present in the source transaction.

A derived relation must be rebuildable from authoritative facts plus explicitly versioned rules/evidence.

## 16. Explicit logical non-conflations

DB-01 must preserve these separations in every physical implementation:

- User profile versus Household authority;
- global catalog identity versus Household-private catalog ownership;
- canonical ProductIdentifier versus staged unresolved identifier evidence;
- Product versus Batch versus StockItem;
- ReceiptItem versus PurchaseItem allocation versus InventoryMovement effect;
- physical receiving pool versus shopping-intent attribution pool;
- StockItem current placement versus immutable historical placement effects;
- StockItem current balance projection versus InventoryMovement ledger truth;
- InventoryTransfer business identity versus its two ledger effects;
- same-Product quantity lineage versus Product-transforming Preparation semantics;
- InventoryCount observation versus historical ledger basis versus reconciliation outcome/adjustment;
- Recipe versus immutable RecipeVersion versus concrete Preparation;
- shelf-life rule definition versus activation decision versus EffectiveExpiration projection;
- notification preference versus Household AlertRule authority;
- provider/external identity versus Household authorization;
- AuditEvent versus domain/inventory history.
