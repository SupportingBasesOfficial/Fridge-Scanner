import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  AcceptOrdinaryOverReceiptUseCase,
  CommandId,
  HouseholdId,
  InventoryMovementId,
  MeasurementConversionEvidenceId,
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
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdOverReceiptExceptionRegistrar } from './register-over-receipt-exception.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for cross-unit over-receipt acceptance tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for cross-unit over-receipt acceptance tests');

const HOUSEHOLD = HouseholdId('9b800001-0b06-4880-8880-000000000001');
const ADMIN = PrincipalId('9b800002-0b06-4880-8880-000000000002');
const MEMBERSHIP = '9b800003-0b06-4880-8880-000000000003';
const ROLE = 'BE06_OVER_ACCEPT_CROSS_ADMIN';
const PRODUCT = '9b800004-0b06-4880-8880-000000000004';
const EACH = '9b800005-0b06-4880-8880-000000000005';
const PACK = '9b800006-0b06-4880-8880-000000000006';
const RULE = '9b800007-0b06-4880-8880-000000000007';
const EVIDENCE = MeasurementConversionEvidenceId('9b800008-0b06-4880-8880-000000000008');
const PURCHASE = '9b800009-0b06-4880-8880-000000000009';
const PURCHASE_ITEM = PurchaseItemId('9b800010-0b06-4880-8880-000000000010');
const RECEIPT = '9b800011-0b06-4880-8880-000000000011';
const INTENT = ReceiptItemIntentId('9b800012-0b06-4880-8880-000000000012');
const EXCEPTION = PurchaseReceivingExceptionId('9b800013-0b06-4880-8880-000000000013');
const LOCATION = StorageLocationId('9b800014-0b06-4880-8880-000000000014');

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
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE06 over accept cross admin')`, [ADMIN]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE06 over accept cross household')`, [HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ($1, 'BE06 over accept cross admin')`, [ROLE]);
    await pool.query(`insert into fridge.household_role_capability (role_code, capability_code) values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`, [ROLE]);
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(`insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status) values ('BE06_OVER_ACCEPT_CROSS', 'BE06 over accept cross count', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values
       ($1::uuid, 'BE06_OAC_EACH', 'BE06_OVER_ACCEPT_CROSS', 'each', 'ACTIVE'),
       ($2::uuid, 'BE06_OAC_PACK', 'BE06_OVER_ACCEPT_CROSS', 'pack', 'ACTIVE')`,
      [EACH, PACK],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_rule (
         measurement_conversion_rule_id, rule_family_id, version_no, conversion_kind,
         source_unit_id, target_unit_id, factor_num, factor_den,
         effective_from, lifecycle_status, provenance
       ) values (
         $1::uuid, '9b800015-0b06-4880-8880-000000000015'::uuid, 1, 'EXACT_FACTOR',
         $2::uuid, $3::uuid, 2, 1,
         '2026-09-01T00:00:00Z', 'ACTIVE', '1 pack = 2 each'
       )`,
      [RULE, PACK, EACH],
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
         2, 1, '2026-09-09T13:00:00Z', '2 packs = 4 each'
       )`,
      [EVIDENCE, HOUSEHOLD, RULE, PACK, EACH],
    );
    await pool.query(`insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status) values ($1::uuid, 'GLOBAL', 'BE06 over accept cross product', 'ACTIVE')`, [PRODUCT]);
    await pool.query(`insert into fridge.currency (currency_code, display_name, lifecycle_status) values ('OAC', 'Over acceptance cross', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values ($1::uuid, $2::uuid, 'OAC', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 3, 1, $5::uuid, 'three each ordered')`,
      [PURCHASE_ITEM, HOUSEHOLD, PURCHASE, PRODUCT, EACH],
    );
    await pool.query(
      `insert into fridge.receipt (receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at)
       values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'cross-unit over acceptance', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 2, 1, $5::uuid, 'two packs physically presented')`,
      [INTENT, HOUSEHOLD, RECEIPT, PRODUCT, PACK],
    );
    await pool.query(`insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status) values ('BE06_OAC_LOCATION', 'BE06 OAC location', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.storage_location (storage_location_id, household_id, kind_code, display_name, lifecycle_status)
       values ($1::uuid, $2::uuid, 'BE06_OAC_LOCATION', 'BE06 OAC location', 'ACTIVE')`,
      [LOCATION, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('cross-unit acceptance preserves physical PACK truth while accepting exact excess in purchased EACH unit', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });

  try {
    const detection = new RegisterOverReceiptExceptionUseCase(
      new PgHouseholdProcurementAdministrationTransactionManager(database),
      new PgHouseholdOverReceiptExceptionRegistrar(),
      new OneId(EXCEPTION),
    );
    const detected = await detection.execute({
      commandId: CommandId('9b810001-0b06-4881-8881-000000000001'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: INTENT,
      purchaseItemId: PURCHASE_ITEM,
      allocationConversionEvidenceId: EVIDENCE,
      reason: 'four each presented against three each ordered',
      provenance: 'two packs counted with pinned evidence',
    });
    assert.deepEqual(detected.discrepantQuantity, exactRational(1n, 1n));
    assert.equal(detected.discrepantUnitId, EACH);

    const acceptance = new AcceptOrdinaryOverReceiptUseCase(
      new PgHouseholdProcurementAdministrationTransactionManager(database),
      new PgHouseholdOrdinaryOverReceiptAcceptor(),
      new OneId(PurchaseReceivingExceptionResolutionId('9b810002-0b06-4881-8881-000000000002')),
      new OneId(ReceiptItemId('9b810003-0b06-4881-8881-000000000003')),
      new OneId(PurchaseItemReceiptAllocationId('9b810004-0b06-4881-8881-000000000004')),
      new OneId(StockItemId('9b810005-0b06-4881-8881-000000000005')),
      new OneId(InventoryMovementId('9b810006-0b06-4881-8881-000000000006')),
      new OneId(ReceiptItemInventoryEffectId('9b810007-0b06-4881-8881-000000000007')),
    );

    const accepted = await acceptance.execute({
      commandId: CommandId('9b810008-0b06-4881-8881-000000000008'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: EXCEPTION,
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'admin accepts exact cross-unit excess',
    });

    assert.deepEqual(accepted.acceptedExcessQuantity, exactRational(1n, 1n));
    assert.equal(accepted.acceptedExcessUnitId, EACH);

    const proof = await admin.query<{
      receipt_num: string;
      receipt_unit: string;
      allocation_num: string;
      allocation_unit: string;
      conversion_id: string;
      movement_num: string;
      movement_unit: string;
      accepted_num: string;
      accepted_unit: string;
      purchased_num: string;
      purchased_unit: string;
    }>(
      `select
         ri.received_quantity_num::text as receipt_num,
         ri.received_unit_id::text as receipt_unit,
         a.allocated_quantity_num::text as allocation_num,
         a.allocation_unit_id::text as allocation_unit,
         a.conversion_evidence_id::text as conversion_id,
         m.quantity_num::text as movement_num,
         m.measurement_unit_id::text as movement_unit,
         r.accepted_excess_quantity_num::text as accepted_num,
         r.accepted_excess_unit_id::text as accepted_unit,
         pi.purchased_quantity_num::text as purchased_num,
         pi.purchased_unit_id::text as purchased_unit
       from fridge.purchase_receiving_exception_resolution r
       join fridge.receipt_item ri
         on ri.household_id = r.household_id and ri.receipt_item_id = r.receipt_item_id
       join fridge.purchase_item_receipt_allocation a
         on a.household_id = r.household_id and a.purchase_item_receipt_allocation_id = r.ordinary_allocation_id
       join fridge.receipt_item_inventory_effect fx
         on fx.household_id = r.household_id and fx.receipt_item_id = r.receipt_item_id
       join fridge.inventory_movement m
         on m.household_id = fx.household_id and m.inventory_movement_id = fx.inventory_movement_id
       join fridge.purchase_item pi
         on pi.household_id = r.household_id and pi.purchase_item_id = r.purchase_item_id
       where r.purchase_receiving_exception_resolution_id = $1::uuid`,
      [accepted.purchaseReceivingExceptionResolutionId],
    );

    assert.equal(proof.rows.length, 1);
    assert.equal(Number(proof.rows[0]?.receipt_num), 2);
    assert.equal(proof.rows[0]?.receipt_unit, PACK);
    assert.equal(Number(proof.rows[0]?.allocation_num), 2);
    assert.equal(proof.rows[0]?.allocation_unit, PACK);
    assert.equal(proof.rows[0]?.conversion_id, EVIDENCE);
    assert.equal(Number(proof.rows[0]?.movement_num), 2);
    assert.equal(proof.rows[0]?.movement_unit, PACK);
    assert.equal(Number(proof.rows[0]?.accepted_num), 1);
    assert.equal(proof.rows[0]?.accepted_unit, EACH);
    assert.equal(Number(proof.rows[0]?.purchased_num), 3);
    assert.equal(proof.rows[0]?.purchased_unit, EACH);
  } finally {
    await database.close();
    await admin.end();
  }
});
