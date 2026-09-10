import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  AcceptOrdinaryOverReceiptUseCase,
  CommandId,
  ConflictError,
  HouseholdId,
  InventoryMovementId,
  MaterializeOrdinaryReceiptItemUseCase,
  PrincipalId,
  PurchaseItemId,
  PurchaseItemReceiptAllocationId,
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
import { PgHouseholdOrdinaryOverReceiptAcceptor } from './accept-ordinary-over-receipt.js';
import { PgHouseholdOrdinaryReceiptItemMaterializer } from './materialize-ordinary-receipt-item.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdOverReceiptExceptionRegistrar } from './register-over-receipt-exception.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for over-receipt acceptance integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for over-receipt acceptance integration tests');

const HOUSEHOLD = HouseholdId('9a800001-0b06-4880-8880-000000000001');
const ADMIN = PrincipalId('9a800002-0b06-4880-8880-000000000002');
const MEMBERSHIP = '9a800003-0b06-4880-8880-000000000003';
const ROLE = 'BE06_OVER_ACCEPT_ADMIN';
const PRODUCT = '9a800004-0b06-4880-8880-000000000004';
const UNIT = '9a800005-0b06-4880-8880-000000000005';
const PURCHASE = '9a800006-0b06-4880-8880-000000000006';
const PURCHASE_ITEM = PurchaseItemId('9a800007-0b06-4880-8880-000000000007');
const RECEIPT = '9a800008-0b06-4880-8880-000000000008';
const FIRST_INTENT = ReceiptItemIntentId('9a800009-0b06-4880-8880-000000000009');
const SECOND_INTENT = ReceiptItemIntentId('9a800010-0b06-4880-8880-000000000010');
const NORMAL_INTENT = ReceiptItemIntentId('9a800011-0b06-4880-8880-000000000011');
const LOCATION = StorageLocationId('9a800012-0b06-4880-8880-000000000012');

class OneId<T> implements IdentifierGenerator<T> {
  constructor(private value: T | undefined) {}
  generate(): T {
    if (this.value === undefined) throw new Error('identifier fixture exhausted');
    const result = this.value;
    this.value = undefined;
    return result;
  }
}

interface AcceptanceIds {
  resolution: PurchaseReceivingExceptionResolutionId;
  receipt: ReceiptItemId;
  allocation: PurchaseItemReceiptAllocationId;
  stock: StockItemId;
  movement: InventoryMovementId;
  effect: ReceiptItemInventoryEffectId;
}

function registrar(database: PgDatabase, exceptionId: PurchaseReceivingExceptionId) {
  return new RegisterOverReceiptExceptionUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdOverReceiptExceptionRegistrar(),
    new OneId(exceptionId),
  );
}

function acceptor(database: PgDatabase, ids: AcceptanceIds) {
  return new AcceptOrdinaryOverReceiptUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdOrdinaryOverReceiptAcceptor(),
    new OneId(ids.resolution),
    new OneId(ids.receipt),
    new OneId(ids.allocation),
    new OneId(ids.stock),
    new OneId(ids.movement),
    new OneId(ids.effect),
  );
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE06 over acceptance admin')`, [ADMIN]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE06 over acceptance household')`, [HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ($1, 'BE06 over acceptance admin')`, [ROLE]);
    await pool.query(`insert into fridge.household_role_capability (role_code, capability_code) values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`, [ROLE]);
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(`insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status) values ('BE06_OVER_ACCEPT_COUNT', 'BE06 over acceptance count', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status)
       values ($1::uuid, 'BE06_OVER_ACCEPT_EACH', 'BE06_OVER_ACCEPT_COUNT', 'each', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(`insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status) values ($1::uuid, 'GLOBAL', 'BE06 over acceptance product', 'ACTIVE')`, [PRODUCT]);
    await pool.query(`insert into fridge.currency (currency_code, display_name, lifecycle_status) values ('OAA', 'Over acceptance', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values ($1::uuid, $2::uuid, 'OAA', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 1, $5::uuid, 'one ordered')`,
      [PURCHASE_ITEM, HOUSEHOLD, PURCHASE, PRODUCT, UNIT],
    );
    await pool.query(
      `insert into fridge.receipt (receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at)
       values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'over acceptance observation', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values
       ($1::uuid, $4::uuid, $5::uuid, $6::uuid, 2, 1, $7::uuid, 'first two presented'),
       ($2::uuid, $4::uuid, $5::uuid, $6::uuid, 1, 1, $7::uuid, 'second one presented'),
       ($3::uuid, $4::uuid, $5::uuid, $6::uuid, 1, 1, $7::uuid, 'normal one after acceptance')`,
      [FIRST_INTENT, SECOND_INTENT, NORMAL_INTENT, HOUSEHOLD, RECEIPT, PRODUCT, UNIT],
    );
    await pool.query(`insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status) values ('BE06_OVER_ACCEPT_LOCATION', 'BE06 over acceptance location', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.storage_location (storage_location_id, household_id, kind_code, display_name, lifecycle_status)
       values ($1::uuid, $2::uuid, 'BE06_OVER_ACCEPT_LOCATION', 'BE06 over acceptance location', 'ACTIVE')`,
      [LOCATION, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('accepts detected ordinary excess atomically, preserves DETECTED history, and replay is stable', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const exceptionId = PurchaseReceivingExceptionId('9a810001-0b06-4881-8881-000000000001');
  const acceptanceCommand = CommandId('9a810002-0b06-4881-8881-000000000002');
  const ids: AcceptanceIds = {
    resolution: PurchaseReceivingExceptionResolutionId('9a810003-0b06-4881-8881-000000000003'),
    receipt: ReceiptItemId('9a810004-0b06-4881-8881-000000000004'),
    allocation: PurchaseItemReceiptAllocationId('9a810005-0b06-4881-8881-000000000005'),
    stock: StockItemId('9a810006-0b06-4881-8881-000000000006'),
    movement: InventoryMovementId('9a810007-0b06-4881-8881-000000000007'),
    effect: ReceiptItemInventoryEffectId('9a810008-0b06-4881-8881-000000000008'),
  };

  try {
    const detected = await registrar(database, exceptionId).execute({
      commandId: CommandId('9a810009-0b06-4881-8881-000000000009'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: FIRST_INTENT,
      purchaseItemId: PURCHASE_ITEM,
      reason: 'two arrived against one ordered',
      provenance: 'first exact receiving count',
    });
    assert.deepEqual(detected.discrepantQuantity, exactRational(1n, 1n));

    const accepted = await acceptor(database, ids).execute({
      commandId: acceptanceCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: exceptionId,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'admin accepted first excess',
    });

    assert.deepEqual(accepted, {
      purchaseReceivingExceptionResolutionId: ids.resolution,
      receiptItemId: ids.receipt,
      purchaseItemReceiptAllocationId: ids.allocation,
      stockItemId: ids.stock,
      inventoryMovementId: ids.movement,
      receiptItemInventoryEffectId: ids.effect,
      acceptedExcessQuantity: exactRational(1n, 1n),
      acceptedExcessUnitId: UNIT,
    });

    const proof = await admin.query<{
      detected_status: string;
      purchased_num: string;
      resolution_kind: string;
      accepted_num: string;
      approved_by: string;
      receipt_qty: string;
      allocation_qty: string;
      movement_qty: string;
      effect_qty: string;
      physical_kind: string;
    }>(
      `select
         e.resolution_status as detected_status,
         pi.purchased_quantity_num::text as purchased_num,
         r.resolution_kind,
         r.accepted_excess_quantity_num::text as accepted_num,
         r.approved_by_user_id::text as approved_by,
         ri.received_quantity_num::text as receipt_qty,
         a.allocated_quantity_num::text as allocation_qty,
         m.quantity_num::text as movement_qty,
         fx.quantity_num::text as effect_qty,
         pm.materialization_kind as physical_kind
       from fridge.purchase_receiving_exception e
       join fridge.purchase_receiving_exception_resolution r
         on r.household_id = e.household_id
        and r.purchase_receiving_exception_id = e.purchase_receiving_exception_id
       join fridge.purchase_item pi
         on pi.household_id = r.household_id and pi.purchase_item_id = r.purchase_item_id
       join fridge.receipt_item ri
         on ri.household_id = r.household_id and ri.receipt_item_id = r.receipt_item_id
       join fridge.purchase_item_receipt_allocation a
         on a.household_id = r.household_id and a.purchase_item_receipt_allocation_id = r.ordinary_allocation_id
       join fridge.receipt_item_inventory_effect fx
         on fx.household_id = r.household_id and fx.receipt_item_id = r.receipt_item_id
       join fridge.inventory_movement m
         on m.household_id = fx.household_id and m.inventory_movement_id = fx.inventory_movement_id
       join fridge.receipt_item_intent_physical_materialization pm
         on pm.household_id = r.household_id and pm.receipt_item_intent_id = r.receipt_item_intent_id
       where e.purchase_receiving_exception_id = $1::uuid`,
      [exceptionId],
    );

    assert.equal(proof.rows.length, 1);
    assert.equal(proof.rows[0]?.detected_status, 'DETECTED');
    assert.equal(Number(proof.rows[0]?.purchased_num), 1);
    assert.equal(proof.rows[0]?.resolution_kind, 'ACCEPTED_ORDINARY_EXCESS');
    assert.equal(Number(proof.rows[0]?.accepted_num), 1);
    assert.equal(proof.rows[0]?.approved_by, ADMIN);
    assert.equal(Number(proof.rows[0]?.receipt_qty), 2);
    assert.equal(Number(proof.rows[0]?.allocation_qty), 2);
    assert.equal(Number(proof.rows[0]?.movement_qty), 2);
    assert.equal(Number(proof.rows[0]?.effect_qty), 2);
    assert.equal(proof.rows[0]?.physical_kind, 'ORDINARY');

    const replay = await acceptor(database, {
      resolution: PurchaseReceivingExceptionResolutionId('9a810010-0b06-4881-8881-000000000010'),
      receipt: ReceiptItemId('9a810011-0b06-4881-8881-000000000011'),
      allocation: PurchaseItemReceiptAllocationId('9a810012-0b06-4881-8881-000000000012'),
      stock: StockItemId('9a810013-0b06-4881-8881-000000000013'),
      movement: InventoryMovementId('9a810014-0b06-4881-8881-000000000014'),
      effect: ReceiptItemInventoryEffectId('9a810015-0b06-4881-8881-000000000015'),
    }).execute({
      commandId: acceptanceCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: exceptionId,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'admin accepted first excess',
    });
    assert.deepEqual(replay, accepted);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('second acceptance revalidates incremental excess instead of copying historical total discrepancy', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const exceptionId = PurchaseReceivingExceptionId('9a820001-0b06-4882-8882-000000000001');
  const ids: AcceptanceIds = {
    resolution: PurchaseReceivingExceptionResolutionId('9a820002-0b06-4882-8882-000000000002'),
    receipt: ReceiptItemId('9a820003-0b06-4882-8882-000000000003'),
    allocation: PurchaseItemReceiptAllocationId('9a820004-0b06-4882-8882-000000000004'),
    stock: StockItemId('9a820005-0b06-4882-8882-000000000005'),
    movement: InventoryMovementId('9a820006-0b06-4882-8882-000000000006'),
    effect: ReceiptItemInventoryEffectId('9a820007-0b06-4882-8882-000000000007'),
  };

  try {
    const detected = await registrar(database, exceptionId).execute({
      commandId: CommandId('9a820008-0b06-4882-8882-000000000008'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: SECOND_INTENT,
      purchaseItemId: PURCHASE_ITEM,
      reason: 'another unit arrived after first accepted excess',
      provenance: 'second exact receiving count',
    });

    // Existing physical allocation is 2, proposed is 1, purchased is 1:
    // DETECTED stores total overage 2.
    assert.deepEqual(detected.discrepantQuantity, exactRational(2n, 1n));

    const accepted = await acceptor(database, ids).execute({
      commandId: CommandId('9a820009-0b06-4882-8882-000000000009'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: exceptionId,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'admin accepted only the new incremental excess',
    });

    // The first allocation already has 1 unit of accepted excess. Its covered
    // purchased portion remains 1, so this new allocation contributes exactly
    // 1 additional accepted excess — not the historical total discrepancy 2.
    assert.deepEqual(accepted.acceptedExcessQuantity, exactRational(1n, 1n));

    const rows = await admin.query<{
      detected_num: string;
      accepted_num: string;
      total_allocated: string;
      total_accepted: string;
      purchased_num: string;
    }>(
      `select
         e.discrepant_quantity_num::text as detected_num,
         r.accepted_excess_quantity_num::text as accepted_num,
         (select sum(a.allocated_quantity_num)::text
            from fridge.purchase_item_receipt_allocation a
           where a.household_id = $2::uuid and a.purchase_item_id = $3::uuid) as total_allocated,
         (select sum(x.accepted_excess_quantity_num)::text
            from fridge.purchase_receiving_exception_resolution x
           where x.household_id = $2::uuid and x.purchase_item_id = $3::uuid) as total_accepted,
         pi.purchased_quantity_num::text as purchased_num
       from fridge.purchase_receiving_exception e
       join fridge.purchase_receiving_exception_resolution r
         on r.household_id = e.household_id
        and r.purchase_receiving_exception_id = e.purchase_receiving_exception_id
       join fridge.purchase_item pi
         on pi.household_id = r.household_id and pi.purchase_item_id = r.purchase_item_id
       where e.purchase_receiving_exception_id = $1::uuid`,
      [exceptionId, HOUSEHOLD, PURCHASE_ITEM],
    );
    assert.equal(Number(rows.rows[0]?.detected_num), 2);
    assert.equal(Number(rows.rows[0]?.accepted_num), 1);
    assert.equal(Number(rows.rows[0]?.total_allocated), 3);
    assert.equal(Number(rows.rows[0]?.total_accepted), 2);
    assert.equal(Number(rows.rows[0]?.purchased_num), 1);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('ordinary receiving without explicit exception acceptance remains blocked after accepted excess', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const receiptCandidate = ReceiptItemId('9a830001-0b06-4883-8883-000000000001');
  const allocationCandidate = PurchaseItemReceiptAllocationId('9a830002-0b06-4883-8883-000000000002');
  const stockCandidate = StockItemId('9a830003-0b06-4883-8883-000000000003');
  const movementCandidate = InventoryMovementId('9a830004-0b06-4883-8883-000000000004');
  const effectCandidate = ReceiptItemInventoryEffectId('9a830005-0b06-4883-8883-000000000005');

  try {
    const ordinary = new MaterializeOrdinaryReceiptItemUseCase(
      new PgHouseholdProcurementAdministrationTransactionManager(database),
      new PgHouseholdOrdinaryReceiptItemMaterializer(),
      new OneId(receiptCandidate),
      new OneId(allocationCandidate),
      new OneId(stockCandidate),
      new OneId(movementCandidate),
      new OneId(effectCandidate),
    );

    await assert.rejects(
      ordinary.execute({
        commandId: CommandId('9a830006-0b06-4883-8883-000000000006'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: NORMAL_INTENT,
        purchaseItemId: PURCHASE_ITEM,
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'must not inherit accepted excess authority',
      }),
      ConflictError,
    );

    const proof = await admin.query<{ receipt_item: string; allocation: string; stock: string; movement: string; effect: string }>(
      `select
         (select count(*)::text from fridge.receipt_item where receipt_item_id = $1::uuid) as receipt_item,
         (select count(*)::text from fridge.purchase_item_receipt_allocation where purchase_item_receipt_allocation_id = $2::uuid) as allocation,
         (select count(*)::text from fridge.stock_item where stock_item_id = $3::uuid) as stock,
         (select count(*)::text from fridge.inventory_movement where inventory_movement_id = $4::uuid) as movement,
         (select count(*)::text from fridge.receipt_item_inventory_effect where receipt_item_inventory_effect_id = $5::uuid) as effect`,
      [receiptCandidate, allocationCandidate, stockCandidate, movementCandidate, effectCandidate],
    );
    assert.deepEqual(proof.rows, [{ receipt_item: '0', allocation: '0', stock: '0', movement: '0', effect: '0' }]);
  } finally {
    await database.close();
    await admin.end();
  }
});
