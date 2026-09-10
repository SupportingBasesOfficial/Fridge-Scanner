import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  ConflictError,
  HouseholdId,
  InventoryMovementId,
  PrincipalId,
  PurchaseItemId,
  PurchaseItemReceiptAllocationId,
  PurchaseItemSubstitutionAllocationId,
  ReceiptItemId,
  ReceiptItemIntentId,
  ReceiptItemInventoryEffectId,
  StockItemId,
  StorageLocationId,
  MaterializeOrdinaryReceiptItemUseCase,
  MaterializeSubstitutionReceiptItemUseCase,
  type IdentifierGenerator,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdOrdinaryReceiptItemMaterializer } from './materialize-ordinary-receipt-item.js';
import { PgHouseholdSubstitutionReceiptItemMaterializer } from './materialize-substitution-receipt-item.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for substitution receiving integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for substitution receiving integration tests');

const HOUSEHOLD = HouseholdId('c7400001-0b06-4740-8740-000000000001');
const ADMIN = PrincipalId('c7400002-0b06-4740-8740-000000000002');
const MEMBERSHIP = 'c7400003-0b06-4740-8740-000000000003';
const ROLE = 'BE06_SUBSTITUTION_ADMIN';
const REQUESTED = 'c7400004-0b06-4740-8740-000000000004';
const RECEIVED = 'c7400005-0b06-4740-8740-000000000005';
const UNIT = 'c7400006-0b06-4740-8740-000000000006';
const PURCHASE = 'c7400007-0b06-4740-8740-000000000007';
const REQUESTED_ITEM = PurchaseItemId('c7400008-0b06-4740-8740-000000000008');
const RECEIVED_ITEM = PurchaseItemId('c7400009-0b06-4740-8740-000000000009');
const RECEIPT = 'c7400010-0b06-4740-8740-000000000010';
const LOCATION = StorageLocationId('c7400011-0b06-4740-8740-000000000011');

class OneId<T> implements IdentifierGenerator<T> {
  constructor(private value: T | undefined) {}
  generate(): T {
    if (this.value === undefined) throw new Error('identifier fixture exhausted');
    const result = this.value;
    this.value = undefined;
    return result;
  }
}

interface SubIds {
  receipt: ReceiptItemId;
  allocation: PurchaseItemSubstitutionAllocationId;
  stock: StockItemId;
  movement: InventoryMovementId;
  effect: ReceiptItemInventoryEffectId;
}

function subIds(seed: string): SubIds {
  return {
    receipt: ReceiptItemId(`c741${seed}01-0b06-4741-8741-000000000001`),
    allocation: PurchaseItemSubstitutionAllocationId(`c741${seed}02-0b06-4741-8741-000000000002`),
    stock: StockItemId(`c741${seed}03-0b06-4741-8741-000000000003`),
    movement: InventoryMovementId(`c741${seed}04-0b06-4741-8741-000000000004`),
    effect: ReceiptItemInventoryEffectId(`c741${seed}05-0b06-4741-8741-000000000005`),
  };
}

function substitutionUseCase(database: PgDatabase, ids: SubIds): MaterializeSubstitutionReceiptItemUseCase {
  return new MaterializeSubstitutionReceiptItemUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdSubstitutionReceiptItemMaterializer(),
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
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE06 substitution admin')`, [ADMIN]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE06 substitution household')`, [HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ($1, 'BE06 substitution admin')`, [ROLE]);
    await pool.query(`insert into fridge.household_role_capability (role_code, capability_code) values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`, [ROLE]);
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(`insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status) values ('BE06_SUB_COUNT', 'BE06 substitution count', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status)
       values ($1::uuid, 'BE06_SUB_EACH', 'BE06_SUB_COUNT', 'each', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', 'requested product', 'ACTIVE'),
              ($2::uuid, 'GLOBAL', 'received substitute product', 'ACTIVE')`,
      [REQUESTED, RECEIVED],
    );
    await pool.query(`insert into fridge.currency (currency_code, display_name, lifecycle_status) values ('SRI', 'Substitution receiving integration', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values ($1::uuid, $2::uuid, 'SRI', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values
         ($1::uuid, $3::uuid, $4::uuid, $5::uuid, 3, 1, $7::uuid, 'requested purchase'),
         ($2::uuid, $3::uuid, $4::uuid, $6::uuid, 3, 1, $7::uuid, 'received-product purchase for cross-kind guard')`,
      [REQUESTED_ITEM, RECEIVED_ITEM, HOUSEHOLD, PURCHASE, REQUESTED, RECEIVED, UNIT],
    );
    await pool.query(
      `insert into fridge.receipt (receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at)
       values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'substitution receipt', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(`insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status) values ('BE06_SUB_LOCATION', 'BE06 substitution location', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.storage_location (storage_location_id, household_id, kind_code, display_name, lifecycle_status)
       values ($1::uuid, $2::uuid, 'BE06_SUB_LOCATION', 'BE06 substitution location', 'ACTIVE')`,
      [LOCATION, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

async function createIntent(id: ReceiptItemIntentId, product: string, quantity: number): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, 1, $6::uuid, 'substitution intent')`,
      [id, HOUSEHOLD, RECEIPT, product, quantity, UNIT],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('different-Product substitution commits exact physical truth, replay is stable, and cross-kind rematerialization is blocked', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const intent = ReceiptItemIntentId('c7420001-0b06-4742-8742-000000000001');
  const command = CommandId('c7420002-0b06-4742-8742-000000000002');
  const ids = subIds('10');

  try {
    await createIntent(intent, RECEIVED, 2);
    const first = await substitutionUseCase(database, ids).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: intent,
      purchaseItemId: REQUESTED_ITEM,
      reason: 'store supplied alternate product',
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'receiving station substitution',
    });

    assert.deepEqual(first, {
      receiptItemId: ids.receipt,
      purchaseItemSubstitutionAllocationId: ids.allocation,
      stockItemId: ids.stock,
      inventoryMovementId: ids.movement,
      receiptItemInventoryEffectId: ids.effect,
    });

    const physical = await admin.query<{
      requested_product_id: string;
      received_product_id: string;
      reason: string;
      approved_by_user_id: string | null;
      movement_product_id: string;
      materialization_kind: string;
    }>(
      `select s.requested_product_id::text,
              s.received_product_id::text,
              s.reason,
              s.approved_by_user_id::text,
              im.product_id::text as movement_product_id,
              pm.materialization_kind
         from fridge.purchase_item_substitution_allocation s
         join fridge.receipt_item_inventory_effect e
           on e.household_id = s.household_id and e.receipt_item_id = s.receipt_item_id
         join fridge.inventory_movement im
           on im.household_id = e.household_id and im.inventory_movement_id = e.inventory_movement_id
         join fridge.receipt_item_intent_physical_materialization pm
           on pm.household_id = s.household_id and pm.receipt_item_id = s.receipt_item_id
        where s.purchase_item_substitution_allocation_id = $1::uuid`,
      [ids.allocation],
    );
    assert.deepEqual(physical.rows, [{
      requested_product_id: REQUESTED,
      received_product_id: RECEIVED,
      reason: 'store supplied alternate product',
      approved_by_user_id: null,
      movement_product_id: RECEIVED,
      materialization_kind: 'SUBSTITUTION',
    }]);

    const replayIds = subIds('11');
    const replay = await substitutionUseCase(database, replayIds).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: intent,
      purchaseItemId: REQUESTED_ITEM,
      reason: 'store supplied alternate product',
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'receiving station substitution',
    });
    assert.deepEqual(replay, first);

    const ordinary = new MaterializeOrdinaryReceiptItemUseCase(
      new PgHouseholdProcurementAdministrationTransactionManager(database),
      new PgHouseholdOrdinaryReceiptItemMaterializer(),
      new OneId(ReceiptItemId('c7430001-0b06-4743-8743-000000000001')),
      new OneId(PurchaseItemReceiptAllocationId('c7430002-0b06-4743-8743-000000000002')),
      new OneId(StockItemId('c7430003-0b06-4743-8743-000000000003')),
      new OneId(InventoryMovementId('c7430004-0b06-4743-8743-000000000004')),
      new OneId(ReceiptItemInventoryEffectId('c7430005-0b06-4743-8743-000000000005')),
    );

    await assert.rejects(
      ordinary.execute({
        commandId: CommandId('c7430006-0b06-4743-8743-000000000006'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: intent,
        purchaseItemId: RECEIVED_ITEM,
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'must not rematerialize',
      }),
      ConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('substitution shares PurchaseItem allowance and over-receipt attempt rolls back all candidate physical artifacts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const intent = ReceiptItemIntentId('c7440001-0b06-4744-8744-000000000001');
  const ids = subIds('20');

  try {
    await createIntent(intent, RECEIVED, 2);
    await assert.rejects(
      substitutionUseCase(database, ids).execute({
        commandId: CommandId('c7440002-0b06-4744-8744-000000000002'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: intent,
        purchaseItemId: REQUESTED_ITEM,
        reason: 'another substitute beyond remaining allowance',
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'must roll back',
      }),
      ConflictError,
    );

    const counts = await admin.query<{ receipt_count: string; allocation_count: string; movement_count: string; effect_count: string }>(
      `select
         (select count(*)::text from fridge.receipt_item where receipt_item_id = $1::uuid) as receipt_count,
         (select count(*)::text from fridge.purchase_item_substitution_allocation where purchase_item_substitution_allocation_id = $2::uuid) as allocation_count,
         (select count(*)::text from fridge.inventory_movement where inventory_movement_id = $3::uuid) as movement_count,
         (select count(*)::text from fridge.receipt_item_inventory_effect where receipt_item_inventory_effect_id = $4::uuid) as effect_count`,
      [ids.receipt, ids.allocation, ids.movement, ids.effect],
    );
    assert.deepEqual(counts.rows, [{ receipt_count: '0', allocation_count: '0', movement_count: '0', effect_count: '0' }]);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('same-Product intent is rejected by substitution boundary', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const intent = ReceiptItemIntentId('c7450001-0b06-4745-8745-000000000001');
  try {
    await createIntent(intent, REQUESTED, 1);
    await assert.rejects(
      substitutionUseCase(database, subIds('30')).execute({
        commandId: CommandId('c7450002-0b06-4745-8745-000000000002'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: intent,
        purchaseItemId: REQUESTED_ITEM,
        reason: 'not actually a substitution',
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'must use ordinary path',
      }),
      ConflictError,
    );
  } finally {
    await database.close();
  }
});
