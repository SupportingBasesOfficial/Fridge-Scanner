import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompartmentId,
  ConflictError,
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
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdOrdinaryReceiptItemMaterializer } from './materialize-ordinary-receipt-item.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for ordinary receiving integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for ordinary receiving integration tests');

const HOUSEHOLD = HouseholdId('a7310001-0b06-4731-8731-000000000001');
const ADMIN = PrincipalId('a7310002-0b06-4731-8731-000000000002');
const NO_CAP = PrincipalId('a7310003-0b06-4731-8731-000000000003');
const ADMIN_MEMBERSHIP = 'a7310004-0b06-4731-8731-000000000004';
const NO_CAP_MEMBERSHIP = 'a7310005-0b06-4731-8731-000000000005';
const ADMIN_ROLE = 'BE06_MATERIALIZE_ADMIN';
const NO_CAP_ROLE = 'BE06_MATERIALIZE_NO_CAP';
const PRODUCT = 'a7310006-0b06-4731-8731-000000000006';
const OTHER_PRODUCT = 'a7310007-0b06-4731-8731-000000000007';
const UNIT = 'a7310008-0b06-4731-8731-000000000008';
const PURCHASE = 'a7310009-0b06-4731-8731-000000000009';
const PURCHASE_ITEM = PurchaseItemId('a7310010-0b06-4731-8731-000000000010');
const RECEIPT = 'a7310011-0b06-4731-8731-000000000011';
const LOCATION = StorageLocationId('a7310012-0b06-4731-8731-000000000012');
const PARENT_LOCATION = StorageLocationId('a7310013-0b06-4731-8731-000000000013');
const COMPARTMENT = CompartmentId('a7310014-0b06-4731-8731-000000000014');
const RETIRED_LOCATION = StorageLocationId('a7310015-0b06-4731-8731-000000000015');

class QueueGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly values: T[]) {}
  generate(): T {
    const value = this.values.shift();
    if (value === undefined) throw new Error('identifier fixture exhausted');
    return value;
  }
}

interface GeneratedIds {
  readonly receiptItem: ReceiptItemId;
  readonly allocation: PurchaseItemReceiptAllocationId;
  readonly stock: StockItemId;
  readonly movement: InventoryMovementId;
  readonly effect: ReceiptItemInventoryEffectId;
}

function generated(prefix: number): GeneratedIds {
  const p = String(prefix).padStart(2, '0');
  return {
    receiptItem: ReceiptItemId(`a732${p}01-0b06-4732-8732-000000000001`),
    allocation: PurchaseItemReceiptAllocationId(`a732${p}02-0b06-4732-8732-000000000002`),
    stock: StockItemId(`a732${p}03-0b06-4732-8732-000000000003`),
    movement: InventoryMovementId(`a732${p}04-0b06-4732-8732-000000000004`),
    effect: ReceiptItemInventoryEffectId(`a732${p}05-0b06-4732-8732-000000000005`),
  };
}

function materializeUseCase(database: PgDatabase, ids: GeneratedIds): MaterializeOrdinaryReceiptItemUseCase {
  return new MaterializeOrdinaryReceiptItemUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdOrdinaryReceiptItemMaterializer(),
    new QueueGenerator([ids.receiptItem]),
    new QueueGenerator([ids.allocation]),
    new QueueGenerator([ids.stock]),
    new QueueGenerator([ids.movement]),
    new QueueGenerator([ids.effect]),
  );
}

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 materialization admin'), ($2::uuid, 'BE06 materialization no cap')`,
      [ADMIN, NO_CAP],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 materialization household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 materialization admin'), ($2, 'BE06 materialization no capability')`,
      [ADMIN_ROLE, NO_CAP_ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`,
      [ADMIN_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, $6, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, $7, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, NO_CAP_MEMBERSHIP, HOUSEHOLD, ADMIN, NO_CAP, ADMIN_ROLE, NO_CAP_ROLE],
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_MATERIALIZE_COUNT', 'BE06 materialization count', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values ($1::uuid, 'BE06_MATERIALIZE_EACH', 'BE06_MATERIALIZE_COUNT', 'BE06 each', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', 'BE06 materialization product', 'ACTIVE'),
              ($2::uuid, 'GLOBAL', 'BE06 other product', 'ACTIVE')`,
      [PRODUCT, OTHER_PRODUCT],
    );
    await pool.query(
      `insert into fridge.currency (currency_code, display_name, lifecycle_status)
       values ('RMI', 'BE06 materialization currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.purchase (
         purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at
       ) values ($1::uuid, $2::uuid, 'RMI', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 5, 1, $5::uuid, 'integration purchase item')`,
      [PURCHASE_ITEM, HOUSEHOLD, PURCHASE, PRODUCT, UNIT],
    );
    await pool.query(
      `insert into fridge.receipt (
         receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at
       ) values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'integration receipt', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ('BE06_MATERIALIZE_LOCATION', 'BE06 materialization location', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name,
         lifecycle_status, created_at, retired_at
       ) values
         ($1::uuid, $4::uuid, 'BE06_MATERIALIZE_LOCATION', 'BE06 location',
          'ACTIVE', clock_timestamp() - interval '2 hours', null),
         ($2::uuid, $4::uuid, 'BE06_MATERIALIZE_LOCATION', 'BE06 compartment parent',
          'ACTIVE', clock_timestamp() - interval '2 hours', null),
         ($3::uuid, $4::uuid, 'BE06_MATERIALIZE_LOCATION', 'BE06 retired location',
          'RETIRED', clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour')`,
      [LOCATION, PARENT_LOCATION, RETIRED_LOCATION, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.compartment (
         compartment_id, household_id, storage_location_id, display_name, lifecycle_status
       ) values ($1::uuid, $2::uuid, $3::uuid, 'BE06 compartment', 'ACTIVE')`,
      [COMPARTMENT, HOUSEHOLD, PARENT_LOCATION],
    );
  } finally {
    await pool.end();
  }
}

async function createIntent(
  intentId: ReceiptItemIntentId,
  quantity: number,
  productId = PRODUCT,
): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, 1, $6::uuid, 'integration intent')`,
      [intentId, HOUSEHOLD, RECEIPT, productId, quantity, UNIT],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('ordinary materialization commits partial receiving + placed inventory atomically and replay returns original identities', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const intent = ReceiptItemIntentId('a7330001-0b06-4733-8733-000000000001');
  const command = CommandId('a7330002-0b06-4733-8733-000000000002');
  const ids = generated(10);

  try {
    await createIntent(intent, 2);
    const first = await materializeUseCase(database, ids).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: intent,
      purchaseItemId: PURCHASE_ITEM,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: '  integration location ingress  ',
    });
    assert.deepEqual(first, {
      receiptItemId: ids.receiptItem,
      purchaseItemReceiptAllocationId: ids.allocation,
      stockItemId: ids.stock,
      inventoryMovementId: ids.movement,
      receiptItemInventoryEffectId: ids.effect,
    });

    const physical = await admin.query<{
      received_quantity_num: string;
      allocation_num: string;
      movement_num: string;
      movement_kind: string;
      placement_kind: string;
      storage_location_id: string | null;
      effect_num: string;
      mapped: boolean;
    }>(
      `select ri.received_quantity_num::text,
              a.allocated_quantity_num::text as allocation_num,
              im.quantity_num::text as movement_num,
              im.movement_kind,
              im.placement_anchor_kind::text as placement_kind,
              im.storage_location_id::text,
              e.quantity_num::text as effect_num,
              (m.receipt_item_intent_id is not null) as mapped
         from fridge.receipt_item ri
         join fridge.purchase_item_receipt_allocation a
           on a.household_id = ri.household_id and a.receipt_item_id = ri.receipt_item_id
         join fridge.receipt_item_inventory_effect e
           on e.household_id = ri.household_id and e.receipt_item_id = ri.receipt_item_id
         join fridge.inventory_movement im
           on im.household_id = e.household_id and im.inventory_movement_id = e.inventory_movement_id
         join fridge.receipt_item_intent_materialization m
           on m.household_id = ri.household_id and m.receipt_item_id = ri.receipt_item_id
        where ri.receipt_item_id = $1::uuid`,
      [ids.receiptItem],
    );
    assert.deepEqual(physical.rows, [{
      received_quantity_num: '2',
      allocation_num: '2',
      movement_num: '2',
      movement_kind: 'RECEIPT_INGRESS',
      placement_kind: 'LOCATION',
      storage_location_id: LOCATION,
      effect_num: '2',
      mapped: true,
    }]);

    const replayIds = generated(11);
    const replay = await materializeUseCase(database, replayIds).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: intent,
      purchaseItemId: PURCHASE_ITEM,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'integration location ingress',
    });
    assert.deepEqual(replay, first);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('partial receiving shares one PurchaseItem pool and deterministic over-receipt leaves no physical artifacts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const intent2 = ReceiptItemIntentId('a7340001-0b06-4734-8734-000000000001');
  const intent3 = ReceiptItemIntentId('a7340002-0b06-4734-8734-000000000002');
  const ids2 = generated(20);
  const ids3 = generated(21);

  try {
    await createIntent(intent2, 2);
    await materializeUseCase(database, ids2).execute({
      commandId: CommandId('a7340003-0b06-4734-8734-000000000003'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: intent2,
      purchaseItemId: PURCHASE_ITEM,
      placement: { kind: 'COMPARTMENT', compartmentId: COMPARTMENT },
      provenance: 'compartment partial ingress',
    });

    const compartmentMovement = await admin.query<{ kind: string; compartment_id: string | null }>(
      `select placement_anchor_kind::text as kind, compartment_id::text
         from fridge.inventory_movement
        where inventory_movement_id = $1::uuid`,
      [ids2.movement],
    );
    assert.deepEqual(compartmentMovement.rows, [{ kind: 'COMPARTMENT', compartment_id: COMPARTMENT }]);

    await createIntent(intent3, 2);
    await assert.rejects(
      materializeUseCase(database, ids3).execute({
        commandId: CommandId('a7340004-0b06-4734-8734-000000000004'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: intent3,
        purchaseItemId: PURCHASE_ITEM,
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'must exceed remaining quantity',
      }),
      ConflictError,
    );

    const artifactCount = await admin.query<{ receipt_items: string; movements: string; effects: string }>(
      `select
         (select count(*)::text from fridge.receipt_item where receipt_item_id = $1::uuid) as receipt_items,
         (select count(*)::text from fridge.inventory_movement where inventory_movement_id = $2::uuid) as movements,
         (select count(*)::text from fridge.receipt_item_inventory_effect where receipt_item_inventory_effect_id = $3::uuid) as effects`,
      [ids3.receiptItem, ids3.movement, ids3.effect],
    );
    assert.deepEqual(artifactCount.rows, [{ receipt_items: '0', movements: '0', effects: '0' }]);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('ordinary materialization rejects Product mismatch, retired topology and missing procurement capability without artifacts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const mismatchIntent = ReceiptItemIntentId('a7350001-0b06-4735-8735-000000000001');
  const topologyIntent = ReceiptItemIntentId('a7350002-0b06-4735-8735-000000000002');
  const noCapIntent = ReceiptItemIntentId('a7350003-0b06-4735-8735-000000000003');

  try {
    await createIntent(mismatchIntent, 1, OTHER_PRODUCT);
    await assert.rejects(
      materializeUseCase(database, generated(30)).execute({
        commandId: CommandId('a7350004-0b06-4735-8735-000000000004'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: mismatchIntent,
        purchaseItemId: PURCHASE_ITEM,
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'product mismatch',
      }),
      ConflictError,
    );

    await createIntent(topologyIntent, 1);
    await assert.rejects(
      materializeUseCase(database, generated(31)).execute({
        commandId: CommandId('a7350005-0b06-4735-8735-000000000005'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: topologyIntent,
        purchaseItemId: PURCHASE_ITEM,
        placement: { kind: 'LOCATION', storageLocationId: RETIRED_LOCATION },
        provenance: 'retired topology',
      }),
    );

    await createIntent(noCapIntent, 1);
    await assert.rejects(
      materializeUseCase(database, generated(32)).execute({
        commandId: CommandId('a7350006-0b06-4735-8735-000000000006'),
        actorPrincipalId: NO_CAP,
        householdId: HOUSEHOLD,
        receiptItemIntentId: noCapIntent,
        purchaseItemId: PURCHASE_ITEM,
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'no capability',
      }),
      HouseholdAuthorizationError,
    );

    const counts = await admin.query<{ materializations: string }>(
      `select count(*)::text as materializations
         from fridge.receipt_item_intent_materialization
        where receipt_item_intent_id in ($1::uuid, $2::uuid, $3::uuid)`,
      [mismatchIntent, topologyIntent, noCapIntent],
    );
    assert.equal(counts.rows[0]?.materializations, '0');
  } finally {
    await database.close();
    await admin.end();
  }
});
