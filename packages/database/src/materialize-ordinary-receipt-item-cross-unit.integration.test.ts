import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  HouseholdId,
  InventoryMovementId,
  PrincipalId,
  PurchaseItemId,
  PurchaseItemReceiptAllocationId,
  ReceiptItemId,
  ReceiptItemIntentId,
  ReceiptItemInventoryEffectId,
  StockItemId,
  StorageLocationId,
  MaterializeOrdinaryReceiptItemUseCase,
  type IdentifierGenerator,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdOrdinaryReceiptItemMaterializer } from './materialize-ordinary-receipt-item.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for cross-unit receiving integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for cross-unit receiving integration tests');

const HOUSEHOLD = HouseholdId('b7310001-0b06-4731-8731-000000000001');
const ADMIN = PrincipalId('b7310002-0b06-4731-8731-000000000002');
const MEMBERSHIP = 'b7310003-0b06-4731-8731-000000000003';
const ROLE = 'BE06_CROSS_RECEIVING_ADMIN';
const PRODUCT = 'b7310004-0b06-4731-8731-000000000004';
const EACH = 'b7310005-0b06-4731-8731-000000000005';
const PAIR = 'b7310006-0b06-4731-8731-000000000006';
const RULE = 'b7310007-0b06-4731-8731-000000000007';
const EVIDENCE = 'b7310008-0b06-4731-8731-000000000008';
const PURCHASE = 'b7310009-0b06-4731-8731-000000000009';
const PURCHASE_ITEM = PurchaseItemId('b7310010-0b06-4731-8731-000000000010');
const RECEIPT = 'b7310011-0b06-4731-8731-000000000011';
const INTENT = ReceiptItemIntentId('b7310012-0b06-4731-8731-000000000012');
const LOCATION = StorageLocationId('b7310013-0b06-4731-8731-000000000013');

const RECEIPT_ITEM = ReceiptItemId('b7320001-0b06-4732-8732-000000000001');
const ALLOCATION = PurchaseItemReceiptAllocationId('b7320002-0b06-4732-8732-000000000002');
const STOCK = StockItemId('b7320003-0b06-4732-8732-000000000003');
const MOVEMENT = InventoryMovementId('b7320004-0b06-4732-8732-000000000004');
const EFFECT = ReceiptItemInventoryEffectId('b7320005-0b06-4732-8732-000000000005');

class OneId<T> implements IdentifierGenerator<T> {
  constructor(private value: T | undefined) {}
  generate(): T {
    if (this.value === undefined) throw new Error('identifier fixture exhausted');
    const result = this.value;
    this.value = undefined;
    return result;
  }
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 cross receiving admin')`,
      [ADMIN],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 cross receiving household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 cross receiving admin')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4,
         'ACTIVE', clock_timestamp() - interval '1 hour', null
       )`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_CROSS_RECEIVING_COUNT', 'BE06 cross receiving count', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values
         ($1::uuid, 'BE06_CROSS_RECEIVING_EACH', 'BE06_CROSS_RECEIVING_COUNT', 'each', 'ACTIVE'),
         ($2::uuid, 'BE06_CROSS_RECEIVING_PAIR', 'BE06_CROSS_RECEIVING_COUNT', 'pair', 'ACTIVE')`,
      [EACH, PAIR],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_rule (
         measurement_conversion_rule_id, rule_family_id, version_no, conversion_kind,
         source_unit_id, target_unit_id, factor_num, factor_den,
         effective_from, lifecycle_status, provenance
       ) values (
         $1::uuid, 'b7310014-0b06-4731-8731-000000000014'::uuid, 1, 'EXACT_FACTOR',
         $2::uuid, $3::uuid, 2, 1,
         '2026-09-01T00:00:00Z', 'ACTIVE', '1 pair = 2 each'
       )`,
      [RULE, PAIR, EACH],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_evidence (
         measurement_conversion_evidence_id, household_id, measurement_conversion_rule_id,
         source_unit_id, source_quantity_num, source_quantity_den,
         target_unit_id, target_quantity_num, target_quantity_den,
         applied_factor_num, applied_factor_den, evaluation_anchor, provenance
       ) values (
         $1::uuid, $2::uuid, $3::uuid,
         $4::uuid, 2, 1,
         $5::uuid, 4, 1,
         2, 1, '2026-09-09T13:00:00Z', '2 pairs = 4 each'
       )`,
      [EVIDENCE, HOUSEHOLD, RULE, PAIR, EACH],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', 'BE06 cross receiving product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.currency (currency_code, display_name, lifecycle_status)
       values ('CRI', 'BE06 cross receiving currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.purchase (
         purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at
       ) values ($1::uuid, $2::uuid, 'CRI', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 4, 1, $5::uuid, 'cross-unit purchase')`,
      [PURCHASE_ITEM, HOUSEHOLD, PURCHASE, PRODUCT, EACH],
    );
    await pool.query(
      `insert into fridge.receipt (
         receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at
       ) values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'cross-unit receipt', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 2, 1, $5::uuid, 'observed as two pairs')`,
      [INTENT, HOUSEHOLD, RECEIPT, PRODUCT, PAIR],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ('BE06_CROSS_RECEIVING_LOCATION', 'BE06 cross receiving location', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name, lifecycle_status
       ) values ($1::uuid, $2::uuid, 'BE06_CROSS_RECEIVING_LOCATION', 'BE06 cross receiving location', 'ACTIVE')`,
      [LOCATION, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('ordinary receiving keeps physical ReceiptItem unit while purchase-side evidence reconciles exact cross-unit quantity', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const useCase = new MaterializeOrdinaryReceiptItemUseCase(
      new PgHouseholdProcurementAdministrationTransactionManager(database),
      new PgHouseholdOrdinaryReceiptItemMaterializer(),
      new OneId(RECEIPT_ITEM),
      new OneId(ALLOCATION),
      new OneId(STOCK),
      new OneId(MOVEMENT),
      new OneId(EFFECT),
    );

    const result = await useCase.execute({
      commandId: CommandId('b7330001-0b06-4733-8733-000000000001'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: INTENT,
      purchaseItemId: PURCHASE_ITEM,
      allocationConversionEvidenceId: EVIDENCE,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'cross-unit ordinary receiving',
    });

    assert.deepEqual(result, {
      receiptItemId: RECEIPT_ITEM,
      purchaseItemReceiptAllocationId: ALLOCATION,
      stockItemId: STOCK,
      inventoryMovementId: MOVEMENT,
      receiptItemInventoryEffectId: EFFECT,
    });

    const physical = await admin.query<{
      received_num: string;
      received_unit_id: string;
      allocation_num: string;
      allocation_unit_id: string;
      conversion_evidence_id: string | null;
      movement_num: string;
      movement_unit_id: string;
    }>(
      `select ri.received_quantity_num::text as received_num,
              ri.received_unit_id::text,
              a.allocated_quantity_num::text as allocation_num,
              a.allocation_unit_id::text,
              a.conversion_evidence_id::text,
              im.quantity_num::text as movement_num,
              im.measurement_unit_id::text as movement_unit_id
         from fridge.receipt_item ri
         join fridge.purchase_item_receipt_allocation a
           on a.household_id = ri.household_id and a.receipt_item_id = ri.receipt_item_id
         join fridge.receipt_item_inventory_effect e
           on e.household_id = ri.household_id and e.receipt_item_id = ri.receipt_item_id
         join fridge.inventory_movement im
           on im.household_id = e.household_id and im.inventory_movement_id = e.inventory_movement_id
        where ri.receipt_item_id = $1::uuid`,
      [RECEIPT_ITEM],
    );

    assert.deepEqual(physical.rows, [{
      received_num: '2',
      received_unit_id: PAIR,
      allocation_num: '2',
      allocation_unit_id: PAIR,
      conversion_evidence_id: EVIDENCE,
      movement_num: '2',
      movement_unit_id: PAIR,
    }]);

    const purchasePool = await admin.query<{ converted_num: string; converted_den: string }>(
      `select quantity_num::text as converted_num, quantity_den::text as converted_den
         from fridge_internal.quantity_in_target_unit(
           $1::uuid, 2, 1, $2::uuid, $3::uuid, $4::uuid
         )`,
      [HOUSEHOLD, PAIR, EACH, EVIDENCE],
    );
    assert.deepEqual(purchasePool.rows, [{ converted_num: '4', converted_den: '1' }]);
  } finally {
    await database.close();
    await admin.end();
  }
});
