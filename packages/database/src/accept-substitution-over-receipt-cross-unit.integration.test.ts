import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  AcceptSubstitutionOverReceiptUseCase,
  CommandId,
  HouseholdId,
  InventoryMovementId,
  MeasurementConversionEvidenceId,
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
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for cross-unit substitution acceptance tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for cross-unit substitution acceptance tests');

const HOUSEHOLD = HouseholdId('ac900001-0b06-4900-8900-000000000001');
const ADMIN = PrincipalId('ac900002-0b06-4900-8900-000000000002');
const MEMBERSHIP = 'ac900003-0b06-4900-8900-000000000003';
const ROLE = 'BE06_SUB_OVER_X_ADMIN';
const REQUESTED_PRODUCT = 'ac900004-0b06-4900-8900-000000000004';
const RECEIVED_PRODUCT = 'ac900005-0b06-4900-8900-000000000005';
const EACH = 'ac900006-0b06-4900-8900-000000000006';
const PACK = 'ac900007-0b06-4900-8900-000000000007';
const RULE = 'ac900008-0b06-4900-8900-000000000008';
const EVIDENCE = MeasurementConversionEvidenceId('ac900009-0b06-4900-8900-000000000009');
const PURCHASE = 'ac900010-0b06-4900-8900-000000000010';
const PURCHASE_ITEM = PurchaseItemId('ac900011-0b06-4900-8900-000000000011');
const RECEIPT = 'ac900012-0b06-4900-8900-000000000012';
const INTENT = ReceiptItemIntentId('ac900013-0b06-4900-8900-000000000013');
const LOCATION = StorageLocationId('ac900014-0b06-4900-8900-000000000014');
const EXCEPTION = PurchaseReceivingExceptionId('ac900015-0b06-4900-8900-000000000015');

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
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE06 substitution cross admin')`, [ADMIN]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE06 substitution cross household')`, [HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ($1, 'BE06 substitution cross admin')`, [ROLE]);
    await pool.query(`insert into fridge.household_role_capability (role_code, capability_code) values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`, [ROLE]);
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(`insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status) values ('BE06_SUB_OVER_X_COUNT', 'BE06 substitution cross count', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status) values
       ($1::uuid, 'BE06_SUB_OVER_X_EACH', 'BE06_SUB_OVER_X_COUNT', 'each', 'ACTIVE'),
       ($2::uuid, 'BE06_SUB_OVER_X_PACK', 'BE06_SUB_OVER_X_COUNT', 'pack', 'ACTIVE')`,
      [EACH, PACK],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_rule (
         measurement_conversion_rule_id, rule_family_id, version_no, conversion_kind,
         source_unit_id, target_unit_id, factor_num, factor_den,
         effective_from, lifecycle_status, provenance
       ) values (
         $1::uuid, 'ac900016-0b06-4900-8900-000000000016'::uuid, 1, 'EXACT_FACTOR',
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
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status) values
       ($1::uuid, 'GLOBAL', 'BE06 requested cross product', 'ACTIVE'),
       ($2::uuid, 'GLOBAL', 'BE06 received cross substitute', 'ACTIVE')`,
      [REQUESTED_PRODUCT, RECEIVED_PRODUCT],
    );
    await pool.query(`insert into fridge.currency (currency_code, display_name, lifecycle_status) values ('SUX', 'Substitution cross acceptance', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values ($1::uuid, $2::uuid, 'SUX', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 3, 1, $5::uuid, 'three each requested')`,
      [PURCHASE_ITEM, HOUSEHOLD, PURCHASE, REQUESTED_PRODUCT, EACH],
    );
    await pool.query(
      `insert into fridge.receipt (receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at)
       values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'cross substitution receipt', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 2, 1, $5::uuid, 'two substitute packs presented')`,
      [INTENT, HOUSEHOLD, RECEIPT, RECEIVED_PRODUCT, PACK],
    );
    await pool.query(`insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status) values ('BE06_SUB_OVER_X_LOC', 'BE06 substitution cross location', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.storage_location (storage_location_id, household_id, kind_code, display_name, lifecycle_status)
       values ($1::uuid, $2::uuid, 'BE06_SUB_OVER_X_LOC', 'BE06 substitution cross location', 'ACTIVE')`,
      [LOCATION, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('cross-unit substitution acceptance keeps physical truth in received unit and accepts excess in purchased unit', async () => {
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
      commandId: CommandId('ac910001-0b06-4910-8910-000000000001'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: INTENT,
      purchaseItemId: PURCHASE_ITEM,
      allocationConversionEvidenceId: EVIDENCE,
      reason: 'four each equivalent presented against three each requested',
      provenance: 'cross-unit detector',
    });
    assert.deepEqual(detected.discrepantQuantity, exactRational(1n, 1n));

    const resolution = PurchaseReceivingExceptionResolutionId('ac910002-0b06-4910-8910-000000000002');
    const allocation = PurchaseItemSubstitutionAllocationId('ac910003-0b06-4910-8910-000000000003');
    const accept = new AcceptSubstitutionOverReceiptUseCase(
      transactions,
      new PgHouseholdSubstitutionOverReceiptAcceptor(),
      new OneId(resolution),
      new OneId(ReceiptItemId('ac910004-0b06-4910-8910-000000000004')),
      new OneId(allocation),
      new OneId(StockItemId('ac910005-0b06-4910-8910-000000000005')),
      new OneId(InventoryMovementId('ac910006-0b06-4910-8910-000000000006')),
      new OneId(ReceiptItemInventoryEffectId('ac910007-0b06-4910-8910-000000000007')),
    );
    const result = await accept.execute({
      commandId: CommandId('ac910008-0b06-4910-8910-000000000008'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: EXCEPTION,
      reason: 'supplier provided alternate product in two packs',
      placement: { kind: 'LOCATION', storageLocationId: LOCATION },
      provenance: 'cross-unit substitution acceptance',
    });

    assert.deepEqual(result.acceptedExcessQuantity, exactRational(1n, 1n));
    assert.equal(result.acceptedExcessUnitId, EACH);

    const proof = await admin.query<{
      allocation_num: string;
      allocation_den: string;
      allocation_unit: string;
      conversion_evidence: string | null;
      accepted_num: string;
      accepted_den: string;
      accepted_unit: string;
      movement_num: string;
      movement_den: string;
      movement_unit: string;
    }>(
      `select a.substituted_quantity_num::text as allocation_num,
              a.substituted_quantity_den::text as allocation_den,
              a.allocation_unit_id::text as allocation_unit,
              a.conversion_evidence_id::text as conversion_evidence,
              r.accepted_excess_quantity_num::text as accepted_num,
              r.accepted_excess_quantity_den::text as accepted_den,
              r.accepted_excess_unit_id::text as accepted_unit,
              m.quantity_num::text as movement_num,
              m.quantity_den::text as movement_den,
              m.measurement_unit_id::text as movement_unit
         from fridge.purchase_receiving_exception_resolution r
         join fridge.purchase_item_substitution_allocation a
           on a.household_id = r.household_id
          and a.purchase_item_substitution_allocation_id = r.substitution_allocation_id
         join fridge.receipt_item_inventory_effect e
           on e.household_id = r.household_id and e.receipt_item_id = r.receipt_item_id
         join fridge.inventory_movement m
           on m.household_id = e.household_id and m.inventory_movement_id = e.inventory_movement_id
        where r.purchase_receiving_exception_resolution_id = $1::uuid`,
      [resolution],
    );
    const row = proof.rows[0]!;
    assert.equal(Number(row.allocation_num), 2);
    assert.equal(Number(row.allocation_den), 1);
    assert.equal(row.allocation_unit, PACK);
    assert.equal(row.conversion_evidence, EVIDENCE);
    assert.equal(Number(row.accepted_num), 1);
    assert.equal(Number(row.accepted_den), 1);
    assert.equal(row.accepted_unit, EACH);
    assert.equal(Number(row.movement_num), 2);
    assert.equal(Number(row.movement_den), 1);
    assert.equal(row.movement_unit, PACK);
  } finally {
    await database.close();
    await admin.end();
  }
});
