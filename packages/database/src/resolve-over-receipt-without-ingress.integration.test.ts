import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
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
  ResolveOverReceiptWithoutIngressUseCase,
  StockItemId,
  StorageLocationId,
  type IdentifierGenerator,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdOrdinaryReceiptItemMaterializer } from './materialize-ordinary-receipt-item.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdOverReceiptExceptionRegistrar } from './register-over-receipt-exception.js';
import { PgHouseholdOverReceiptNonphysicalResolver } from './resolve-over-receipt-without-ingress.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for nonphysical over-receipt tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for nonphysical over-receipt tests');

const HOUSEHOLD = HouseholdId('ae800001-0b06-4800-8800-000000000001');
const ADMIN = PrincipalId('ae800002-0b06-4800-8800-000000000002');
const MEMBERSHIP = 'ae800003-0b06-4800-8800-000000000003';
const ROLE = 'BE06_NONPHYS_ADMIN';
const PRODUCT = 'ae800004-0b06-4800-8800-000000000004';
const UNIT = 'ae800005-0b06-4800-8800-000000000005';
const LOCATION = StorageLocationId('ae800006-0b06-4800-8800-000000000006');

const REJECT_PURCHASE = 'ae800010-0b06-4800-8800-000000000010';
const REJECT_ITEM = PurchaseItemId('ae800011-0b06-4800-8800-000000000011');
const REJECT_BYPASS_ITEM = PurchaseItemId('ae800012-0b06-4800-8800-000000000012');
const REJECT_RECEIPT = 'ae800013-0b06-4800-8800-000000000013';
const REJECT_INTENT = ReceiptItemIntentId('ae800014-0b06-4800-8800-000000000014');
const REJECT_EXCEPTION = PurchaseReceivingExceptionId('ae800015-0b06-4800-8800-000000000015');
const REJECT_RESOLUTION = PurchaseReceivingExceptionResolutionId('ae800016-0b06-4800-8800-000000000016');

const SUPER_PURCHASE = 'ae800020-0b06-4800-8800-000000000020';
const SUPER_ITEM = PurchaseItemId('ae800021-0b06-4800-8800-000000000021');
const SUPER_RECEIPT = 'ae800022-0b06-4800-8800-000000000022';
const SUPER_INTENT = ReceiptItemIntentId('ae800023-0b06-4800-8800-000000000023');
const SUPER_EXCEPTION = PurchaseReceivingExceptionId('ae800024-0b06-4800-8800-000000000024');
const SUPER_RESOLUTION = PurchaseReceivingExceptionResolutionId('ae800025-0b06-4800-8800-000000000025');

class OneId<T> implements IdentifierGenerator<T> {
  constructor(private value: T | undefined) {}
  generate(): T {
    if (this.value === undefined) throw new Error('identifier fixture exhausted');
    const value = this.value;
    this.value = undefined;
    return value;
  }
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE06 nonphysical admin')`, [ADMIN]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE06 nonphysical household')`, [HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ($1, 'BE06 nonphysical admin')`, [ROLE]);
    await pool.query(`insert into fridge.household_role_capability (role_code, capability_code) values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`, [ROLE]);
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(`insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status) values ('BE06_NONPHYS_COUNT', 'BE06 nonphysical count', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status)
       values ($1::uuid, 'BE06_NONPHYS_EACH', 'BE06_NONPHYS_COUNT', 'each', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', 'BE06 nonphysical product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(`insert into fridge.currency (currency_code, display_name, lifecycle_status) values ('NPX', 'Nonphysical test currency', 'ACTIVE')`);
    await pool.query(`insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status) values ('BE06_NONPHYS_LOC', 'BE06 nonphysical location', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.storage_location (storage_location_id, household_id, kind_code, display_name, lifecycle_status)
       values ($1::uuid, $2::uuid, 'BE06_NONPHYS_LOC', 'BE06 nonphysical location', 'ACTIVE')`,
      [LOCATION, HOUSEHOLD],
    );

    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values
       ($1::uuid, $3::uuid, 'NPX', '2026-09-09T10:00:00Z', '2026-09-09T10:00:00Z'),
       ($2::uuid, $3::uuid, 'NPX', '2026-09-09T11:00:00Z', '2026-09-09T11:00:00Z')`,
      [REJECT_PURCHASE, SUPER_PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values
       ($1::uuid, $4::uuid, $5::uuid, $6::uuid, 1, 1, $7::uuid, 'reject target one'),
       ($2::uuid, $4::uuid, $5::uuid, $6::uuid, 3, 1, $7::uuid, 'reject bypass three'),
       ($3::uuid, $4::uuid, $8::uuid, $6::uuid, 3, 1, $7::uuid, 'supersession target three')`,
      [REJECT_ITEM, REJECT_BYPASS_ITEM, SUPER_ITEM, HOUSEHOLD, REJECT_PURCHASE, PRODUCT, UNIT, SUPER_PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt (receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at)
       values
       ($1::uuid, $3::uuid, $4::uuid, '2026-09-09T12:00:00Z', 'reject receipt', '2026-09-09T12:00:00Z'),
       ($2::uuid, $3::uuid, $5::uuid, '2026-09-09T13:00:00Z', 'supersession receipt', '2026-09-09T13:00:00Z')`,
      [REJECT_RECEIPT, SUPER_RECEIPT, HOUSEHOLD, REJECT_PURCHASE, SUPER_PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values
       ($1::uuid, $3::uuid, $4::uuid, $5::uuid, 2, 1, $6::uuid, 'two presented for rejection'),
       ($2::uuid, $3::uuid, $7::uuid, $5::uuid, 2, 1, $6::uuid, 'two presented under stale detection')`,
      [REJECT_INTENT, SUPER_INTENT, HOUSEHOLD, REJECT_RECEIPT, PRODUCT, UNIT, SUPER_RECEIPT],
    );

    // Historical stale DETECTED evidence: current PurchaseItem allowance is 3 and intent is only 2.
    // This fixture represents a prior erroneous detection without rewriting that historical fact.
    await pool.query(
      `insert into fridge.purchase_receiving_exception (
         purchase_receiving_exception_id, household_id, purchase_item_id,
         discrepant_quantity_num, discrepant_quantity_den, discrepant_unit_id,
         exception_kind, resolution_status, reason, correction_provenance, recorded_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid,
         1, 1, $4::uuid,
         'OVER_RECEIPT', 'DETECTED', 'historical detector false positive', 'historical import', '2026-09-09T13:01:00Z'
       )`,
      [SUPER_EXCEPTION, HOUSEHOLD, SUPER_ITEM, UNIT],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent_over_receipt_exception (
         household_id, receipt_item_intent_id, purchase_item_id,
         purchase_receiving_exception_id, allocation_conversion_evidence_id,
         detection_provenance, recorded_at
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, null, 'historical stale detector', '2026-09-09T13:01:00Z')`,
      [HOUSEHOLD, SUPER_INTENT, SUPER_ITEM, SUPER_EXCEPTION],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('REJECTED_NO_INGRESS records terminal nonphysical resolution and blocks bypass materialization', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const transactions = new PgHouseholdProcurementAdministrationTransactionManager(database);
    const detect = new RegisterOverReceiptExceptionUseCase(
      transactions,
      new PgHouseholdOverReceiptExceptionRegistrar(),
      new OneId(REJECT_EXCEPTION),
    );
    await detect.execute({
      commandId: CommandId('ae810001-0b06-4810-8810-000000000001'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: REJECT_INTENT,
      purchaseItemId: REJECT_ITEM,
      reason: 'two presented against one purchased',
      provenance: 'rejection detector',
    });

    const invalidSupersession = new ResolveOverReceiptWithoutIngressUseCase(
      transactions,
      new PgHouseholdOverReceiptNonphysicalResolver(),
      new OneId(PurchaseReceivingExceptionResolutionId('ae810020-0b06-4810-8810-000000000020')),
    );
    await assert.rejects(
      invalidSupersession.execute({
        commandId: CommandId('ae810021-0b06-4810-8810-000000000021'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        purchaseReceivingExceptionId: REJECT_EXCEPTION,
        resolutionKind: 'SUPERSEDED_DETECTION',
        reason: 'attempt to supersede while excess still exists',
        provenance: 'negative supersession proof',
      }),
      ConflictError,
    );

    const resolve = new ResolveOverReceiptWithoutIngressUseCase(
      transactions,
      new PgHouseholdOverReceiptNonphysicalResolver(),
      new OneId(REJECT_RESOLUTION),
    );
    const result = await resolve.execute({
      commandId: CommandId('ae810002-0b06-4810-8810-000000000002'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: REJECT_EXCEPTION,
      resolutionKind: 'REJECTED_NO_INGRESS',
      reason: 'supplier excess refused before inventory ingress',
      provenance: 'receiving supervisor rejection',
    });
    assert.equal(result.purchaseReceivingExceptionResolutionId, REJECT_RESOLUTION);
    assert.equal(result.resolutionKind, 'REJECTED_NO_INGRESS');

    const replay = new ResolveOverReceiptWithoutIngressUseCase(
      transactions,
      new PgHouseholdOverReceiptNonphysicalResolver(),
      new OneId(PurchaseReceivingExceptionResolutionId('ae810003-0b06-4810-8810-000000000003')),
    );
    const replayed = await replay.execute({
      commandId: CommandId('ae810002-0b06-4810-8810-000000000002'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: REJECT_EXCEPTION,
      resolutionKind: 'REJECTED_NO_INGRESS',
      reason: 'supplier excess refused before inventory ingress',
      provenance: 'receiving supervisor rejection',
    });
    assert.equal(replayed.purchaseReceivingExceptionResolutionId, REJECT_RESOLUTION);

    const physicalCandidates = {
      receiptItem: ReceiptItemId('ae810010-0b06-4810-8810-000000000010'),
      allocation: PurchaseItemReceiptAllocationId('ae810011-0b06-4810-8810-000000000011'),
      stock: StockItemId('ae810012-0b06-4810-8810-000000000012'),
      movement: InventoryMovementId('ae810013-0b06-4810-8810-000000000013'),
      effect: ReceiptItemInventoryEffectId('ae810014-0b06-4810-8810-000000000014'),
    };
    const materialize = new MaterializeOrdinaryReceiptItemUseCase(
      transactions,
      new PgHouseholdOrdinaryReceiptItemMaterializer(),
      new OneId(physicalCandidates.receiptItem),
      new OneId(physicalCandidates.allocation),
      new OneId(physicalCandidates.stock),
      new OneId(physicalCandidates.movement),
      new OneId(physicalCandidates.effect),
    );
    await assert.rejects(
      materialize.execute({
        commandId: CommandId('ae810015-0b06-4810-8810-000000000015'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: REJECT_INTENT,
        purchaseItemId: REJECT_BYPASS_ITEM,
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'attempted rejected bypass',
      }),
      ConflictError,
    );

    const proof = await admin.query<{
      kind: string;
      reason: string | null;
      receipt_item_id: string | null;
      ordinary_allocation_id: string | null;
      substitution_allocation_id: string | null;
      accepted_num: string | null;
      physical_claims: string;
    }>(
      `select r.resolution_kind as kind,
              r.resolution_reason as reason,
              r.receipt_item_id::text,
              r.ordinary_allocation_id::text,
              r.substitution_allocation_id::text,
              r.accepted_excess_quantity_num::text as accepted_num,
              (select count(*)::text from fridge.receipt_item_intent_physical_materialization pm
                where pm.household_id = r.household_id and pm.receipt_item_intent_id = r.receipt_item_intent_id) as physical_claims
         from fridge.purchase_receiving_exception_resolution r
        where r.purchase_receiving_exception_resolution_id = $1::uuid`,
      [REJECT_RESOLUTION],
    );
    assert.equal(proof.rows[0]?.kind, 'REJECTED_NO_INGRESS');
    assert.equal(proof.rows[0]?.reason, 'supplier excess refused before inventory ingress');
    assert.equal(proof.rows[0]?.receipt_item_id, null);
    assert.equal(proof.rows[0]?.ordinary_allocation_id, null);
    assert.equal(proof.rows[0]?.substitution_allocation_id, null);
    assert.equal(proof.rows[0]?.accepted_num, null);
    assert.equal(Number(proof.rows[0]?.physical_claims), 0);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('SUPERSEDED_DETECTION requires zero current excess and reopens normal materialization only', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const transactions = new PgHouseholdProcurementAdministrationTransactionManager(database);
    const resolve = new ResolveOverReceiptWithoutIngressUseCase(
      transactions,
      new PgHouseholdOverReceiptNonphysicalResolver(),
      new OneId(SUPER_RESOLUTION),
    );
    const result = await resolve.execute({
      commandId: CommandId('ae820001-0b06-4820-8820-000000000001'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: SUPER_EXCEPTION,
      resolutionKind: 'SUPERSEDED_DETECTION',
      reason: 'historical detector evidence is no longer valid against current receiving truth',
      provenance: 'receiving correction review',
    });
    assert.equal(result.resolutionKind, 'SUPERSEDED_DETECTION');

    const materialize = new MaterializeOrdinaryReceiptItemUseCase(
      transactions,
      new PgHouseholdOrdinaryReceiptItemMaterializer(),
      new OneId(ReceiptItemId('ae820010-0b06-4820-8820-000000000010')),
      new OneId(PurchaseItemReceiptAllocationId('ae820011-0b06-4820-8820-000000000011')),
      new OneId(StockItemId('ae820012-0b06-4820-8820-000000000012')),
      new OneId(InventoryMovementId('ae820013-0b06-4820-8820-000000000013')),
      new OneId(ReceiptItemInventoryEffectId('ae820014-0b06-4820-8820-000000000014')),
    );
    const physical = await materialize.execute({
      commandId: CommandId('ae820015-0b06-4820-8820-000000000015'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: SUPER_INTENT,
      purchaseItemId: SUPER_ITEM,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'normal receiving after supersession',
    });

    const proof = await admin.query<{
      resolution_kind: string;
      resolution_receipt_item_id: string | null;
      physical_kind: string;
      physical_receipt_item_id: string;
      detected_status: string;
    }>(
      `select r.resolution_kind,
              r.receipt_item_id::text as resolution_receipt_item_id,
              pm.materialization_kind as physical_kind,
              pm.receipt_item_id::text as physical_receipt_item_id,
              e.resolution_status as detected_status
         from fridge.purchase_receiving_exception_resolution r
         join fridge.purchase_receiving_exception e
           on e.household_id = r.household_id
          and e.purchase_receiving_exception_id = r.purchase_receiving_exception_id
         join fridge.receipt_item_intent_physical_materialization pm
           on pm.household_id = r.household_id
          and pm.receipt_item_intent_id = r.receipt_item_intent_id
        where r.purchase_receiving_exception_resolution_id = $1::uuid`,
      [SUPER_RESOLUTION],
    );
    assert.equal(proof.rows[0]?.resolution_kind, 'SUPERSEDED_DETECTION');
    assert.equal(proof.rows[0]?.resolution_receipt_item_id, null);
    assert.equal(proof.rows[0]?.physical_kind, 'ORDINARY');
    assert.equal(proof.rows[0]?.physical_receipt_item_id, physical.receiptItemId);
    assert.equal(proof.rows[0]?.detected_status, 'DETECTED');
  } finally {
    await database.close();
    await admin.end();
  }
});
