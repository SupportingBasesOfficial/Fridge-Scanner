import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  AcceptSubstitutionOverReceiptUseCase,
  CommandId,
  HouseholdId,
  IdempotencyConflictError,
  InventoryMovementId,
  PrincipalId,
  PurchaseItemId,
  PurchaseItemSubstitutionAllocationId,
  PurchaseReceivingExceptionId,
  PurchaseReceivingExceptionResolutionId,
  ReceiptItemId,
  ReceiptItemIntentId,
  ReceiptItemInventoryEffectId,
  RegisterOverReceiptExceptionUseCase,
  StockItemId,
  StorageLocationId,
  exactRational,
  type IdentifierGenerator,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdSubstitutionOverReceiptAcceptor } from './accept-substitution-over-receipt.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdOverReceiptExceptionRegistrar } from './register-over-receipt-exception.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for substitution over-receipt tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for substitution over-receipt tests');

const HOUSEHOLD = HouseholdId('ab900001-0b06-4900-8900-000000000001');
const ADMIN = PrincipalId('ab900002-0b06-4900-8900-000000000002');
const MEMBERSHIP = 'ab900003-0b06-4900-8900-000000000003';
const ROLE = 'BE06_SUB_OVER_ADMIN';
const REQUESTED_PRODUCT = 'ab900004-0b06-4900-8900-000000000004';
const RECEIVED_PRODUCT = 'ab900005-0b06-4900-8900-000000000005';
const UNIT = 'ab900006-0b06-4900-8900-000000000006';
const PURCHASE = 'ab900007-0b06-4900-8900-000000000007';
const PURCHASE_ITEM = PurchaseItemId('ab900008-0b06-4900-8900-000000000008');
const RECEIPT = 'ab900009-0b06-4900-8900-000000000009';
const INTENT = ReceiptItemIntentId('ab900010-0b06-4900-8900-000000000010');
const LOCATION = StorageLocationId('ab900011-0b06-4900-8900-000000000011');
const EXCEPTION = PurchaseReceivingExceptionId('ab900012-0b06-4900-8900-000000000012');

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
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE06 substitution over admin')`, [ADMIN]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE06 substitution over household')`, [HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ($1, 'BE06 substitution over admin')`, [ROLE]);
    await pool.query(`insert into fridge.household_role_capability (role_code, capability_code) values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`, [ROLE]);
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(`insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status) values ('BE06_SUB_OVER_COUNT', 'BE06 substitution over count', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status)
       values ($1::uuid, 'BE06_SUB_OVER_EACH', 'BE06_SUB_OVER_COUNT', 'each', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status) values
       ($1::uuid, 'GLOBAL', 'BE06 requested over product', 'ACTIVE'),
       ($2::uuid, 'GLOBAL', 'BE06 received substitute product', 'ACTIVE')`,
      [REQUESTED_PRODUCT, RECEIVED_PRODUCT],
    );
    await pool.query(`insert into fridge.currency (currency_code, display_name, lifecycle_status) values ('SUA', 'Substitution acceptance', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values ($1::uuid, $2::uuid, 'SUA', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 1, $5::uuid, 'one requested item')`,
      [PURCHASE_ITEM, HOUSEHOLD, PURCHASE, REQUESTED_PRODUCT, UNIT],
    );
    await pool.query(
      `insert into fridge.receipt (receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at)
       values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'substitution over receipt', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 2, 1, $5::uuid, 'two substitute items physically presented')`,
      [INTENT, HOUSEHOLD, RECEIPT, RECEIVED_PRODUCT, UNIT],
    );
    await pool.query(`insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status) values ('BE06_SUB_OVER_LOC', 'BE06 substitution over location', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.storage_location (storage_location_id, household_id, kind_code, display_name, lifecycle_status)
       values ($1::uuid, $2::uuid, 'BE06_SUB_OVER_LOC', 'BE06 substitution over location', 'ACTIVE')`,
      [LOCATION, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('detects then atomically accepts different-Product over-receipt and replay is stable', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const transactions = new PgHouseholdProcurementAdministrationTransactionManager(database);
    const detect = new RegisterOverReceiptExceptionUseCase(
      transactions,
      new PgHouseholdOverReceiptExceptionRegistrar(),
      new OneId(EXCEPTION),
    );
    const detected = await detect.execute({
      commandId: CommandId('ab910001-0b06-4910-8910-000000000001'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: INTENT,
      purchaseItemId: PURCHASE_ITEM,
      reason: 'two substitute units presented against one ordered unit',
      provenance: 'receiving detector',
    });
    assert.deepEqual(detected.discrepantQuantity, exactRational(1n, 1n));

    const resolution = PurchaseReceivingExceptionResolutionId('ab910002-0b06-4910-8910-000000000002');
    const receiptItem = ReceiptItemId('ab910003-0b06-4910-8910-000000000003');
    const allocation = PurchaseItemSubstitutionAllocationId('ab910004-0b06-4910-8910-000000000004');
    const stock = StockItemId('ab910005-0b06-4910-8910-000000000005');
    const movement = InventoryMovementId('ab910006-0b06-4910-8910-000000000006');
    const effect = ReceiptItemInventoryEffectId('ab910007-0b06-4910-8910-000000000007');
    const acceptCommand = CommandId('ab910008-0b06-4910-8910-000000000008');

    const accept = new AcceptSubstitutionOverReceiptUseCase(
      transactions,
      new PgHouseholdSubstitutionOverReceiptAcceptor(),
      new OneId(resolution), new OneId(receiptItem), new OneId(allocation),
      new OneId(stock), new OneId(movement), new OneId(effect),
    );
    const first = await accept.execute({
      commandId: acceptCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: EXCEPTION,
      reason: 'supplier substituted requested item with alternative product',
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'authorized substitution over-receipt acceptance',
    });

    assert.equal(first.purchaseReceivingExceptionResolutionId, resolution);
    assert.equal(first.purchaseItemSubstitutionAllocationId, allocation);
    assert.deepEqual(first.acceptedExcessQuantity, exactRational(1n, 1n));

    const proof = await admin.query<{
      resolution_kind: string;
      ordinary_allocation_id: string | null;
      substitution_allocation_id: string | null;
      requested_product_id: string;
      received_product_id: string;
      reason: string;
      approved_by_user_id: string | null;
      accepted_num: string;
      accepted_den: string;
      purchase_num: string;
      receipt_product: string;
      movement_product: string;
      movement_num: string;
    }>(
      `select r.resolution_kind,
              r.ordinary_allocation_id::text,
              r.substitution_allocation_id::text,
              a.requested_product_id::text,
              a.received_product_id::text,
              a.reason,
              a.approved_by_user_id::text,
              r.accepted_excess_quantity_num::text as accepted_num,
              r.accepted_excess_quantity_den::text as accepted_den,
              pi.purchased_quantity_num::text as purchase_num,
              ri.product_id::text as receipt_product,
              m.product_id::text as movement_product,
              m.quantity_num::text as movement_num
         from fridge.purchase_receiving_exception_resolution r
         join fridge.purchase_item_substitution_allocation a
           on a.household_id = r.household_id
          and a.purchase_item_substitution_allocation_id = r.substitution_allocation_id
         join fridge.purchase_item pi
           on pi.household_id = r.household_id and pi.purchase_item_id = r.purchase_item_id
         join fridge.receipt_item ri
           on ri.household_id = r.household_id and ri.receipt_item_id = r.receipt_item_id
         join fridge.receipt_item_inventory_effect e
           on e.household_id = r.household_id and e.receipt_item_id = r.receipt_item_id
         join fridge.inventory_movement m
           on m.household_id = e.household_id and m.inventory_movement_id = e.inventory_movement_id
        where r.purchase_receiving_exception_resolution_id = $1::uuid`,
      [resolution],
    );
    assert.equal(proof.rows.length, 1);
    const row = proof.rows[0]!;
    assert.equal(row.resolution_kind, 'ACCEPTED_SUBSTITUTION_EXCESS');
    assert.equal(row.ordinary_allocation_id, null);
    assert.equal(row.substitution_allocation_id, allocation);
    assert.equal(row.requested_product_id, REQUESTED_PRODUCT);
    assert.equal(row.received_product_id, RECEIVED_PRODUCT);
    assert.equal(row.reason, 'supplier substituted requested item with alternative product');
    assert.equal(row.approved_by_user_id, null);
    assert.equal(Number(row.accepted_num), 1);
    assert.equal(Number(row.accepted_den), 1);
    assert.equal(Number(row.purchase_num), 1);
    assert.equal(row.receipt_product, RECEIVED_PRODUCT);
    assert.equal(row.movement_product, RECEIVED_PRODUCT);
    assert.equal(Number(row.movement_num), 2);

    const replay = new AcceptSubstitutionOverReceiptUseCase(
      transactions,
      new PgHouseholdSubstitutionOverReceiptAcceptor(),
      new OneId(PurchaseReceivingExceptionResolutionId('ab910012-0b06-4910-8910-000000000012')),
      new OneId(ReceiptItemId('ab910013-0b06-4910-8910-000000000013')),
      new OneId(PurchaseItemSubstitutionAllocationId('ab910014-0b06-4910-8910-000000000014')),
      new OneId(StockItemId('ab910015-0b06-4910-8910-000000000015')),
      new OneId(InventoryMovementId('ab910016-0b06-4910-8910-000000000016')),
      new OneId(ReceiptItemInventoryEffectId('ab910017-0b06-4910-8910-000000000017')),
    );
    assert.deepEqual(await replay.execute({
      commandId: acceptCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: EXCEPTION,
      reason: 'supplier substituted requested item with alternative product',
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'authorized substitution over-receipt acceptance',
    }), first);

    await assert.rejects(
      new AcceptSubstitutionOverReceiptUseCase(
        transactions,
        new PgHouseholdSubstitutionOverReceiptAcceptor(),
        new OneId(PurchaseReceivingExceptionResolutionId('ab910022-0b06-4910-8910-000000000022')),
        new OneId(ReceiptItemId('ab910023-0b06-4910-8910-000000000023')),
        new OneId(PurchaseItemSubstitutionAllocationId('ab910024-0b06-4910-8910-000000000024')),
        new OneId(StockItemId('ab910025-0b06-4910-8910-000000000025')),
        new OneId(InventoryMovementId('ab910026-0b06-4910-8910-000000000026')),
        new OneId(ReceiptItemInventoryEffectId('ab910027-0b06-4910-8910-000000000027')),
      ).execute({
        commandId: acceptCommand,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        purchaseReceivingExceptionId: EXCEPTION,
        reason: 'different semantic reason',
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'authorized substitution over-receipt acceptance',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});
