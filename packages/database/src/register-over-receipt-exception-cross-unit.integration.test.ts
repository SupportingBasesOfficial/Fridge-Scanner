import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  HouseholdId,
  MeasurementConversionEvidenceId,
  PrincipalId,
  PurchaseItemId,
  PurchaseReceivingExceptionId,
  ReceiptItemIntentId,
  RegisterOverReceiptExceptionUseCase,
  exactRational,
  type IdentifierGenerator,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdOverReceiptExceptionRegistrar } from './register-over-receipt-exception.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for cross-unit over-receipt tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for cross-unit over-receipt tests');

const HOUSEHOLD = HouseholdId('d8500001-0b06-4850-8850-000000000001');
const ADMIN = PrincipalId('d8500002-0b06-4850-8850-000000000002');
const MEMBERSHIP = 'd8500003-0b06-4850-8850-000000000003';
const ROLE = 'BE06_OVER_CROSS_ADMIN';
const PRODUCT = 'd8500004-0b06-4850-8850-000000000004';
const EACH = 'd8500005-0b06-4850-8850-000000000005';
const PACK = 'd8500006-0b06-4850-8850-000000000006';
const RULE = 'd8500007-0b06-4850-8850-000000000007';
const EVIDENCE = MeasurementConversionEvidenceId('d8500008-0b06-4850-8850-000000000008');
const PURCHASE = 'd8500009-0b06-4850-8850-000000000009';
const PURCHASE_ITEM = PurchaseItemId('d8500010-0b06-4850-8850-000000000010');
const RECEIPT = 'd8500011-0b06-4850-8850-000000000011';
const INTENT = ReceiptItemIntentId('d8500012-0b06-4850-8850-000000000012');
const EXCEPTION = PurchaseReceivingExceptionId('d8500013-0b06-4850-8850-000000000013');

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
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE06 over cross admin')`, [ADMIN]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE06 over cross household')`, [HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ($1, 'BE06 over cross admin')`, [ROLE]);
    await pool.query(`insert into fridge.household_role_capability (role_code, capability_code) values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`, [ROLE]);
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(`insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status) values ('BE06_OVER_CROSS_COUNT', 'BE06 over cross count', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values
       ($1::uuid, 'BE06_OVER_CROSS_EACH', 'BE06_OVER_CROSS_COUNT', 'each', 'ACTIVE'),
       ($2::uuid, 'BE06_OVER_CROSS_PACK', 'BE06_OVER_CROSS_COUNT', 'pack', 'ACTIVE')`,
      [EACH, PACK],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_rule (
         measurement_conversion_rule_id, rule_family_id, version_no, conversion_kind,
         source_unit_id, target_unit_id, factor_num, factor_den,
         effective_from, lifecycle_status, provenance
       ) values (
         $1::uuid, 'd8500014-0b06-4850-8850-000000000014'::uuid, 1, 'EXACT_FACTOR',
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
    await pool.query(`insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status) values ($1::uuid, 'GLOBAL', 'BE06 over cross product', 'ACTIVE')`, [PRODUCT]);
    await pool.query(`insert into fridge.currency (currency_code, display_name, lifecycle_status) values ('OCU', 'Over cross unit', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values ($1::uuid, $2::uuid, 'OCU', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
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
       values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'cross-unit over-receipt', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 2, 1, $5::uuid, 'two packs physically presented')`,
      [INTENT, HOUSEHOLD, RECEIPT, PRODUCT, PACK],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('cross-unit detection derives exact discrepancy in the PurchaseItem comparison unit without physical ingress', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const useCase = new RegisterOverReceiptExceptionUseCase(
      new PgHouseholdProcurementAdministrationTransactionManager(database),
      new PgHouseholdOverReceiptExceptionRegistrar(),
      new OneId(EXCEPTION),
    );

    const result = await useCase.execute({
      commandId: CommandId('d8510001-0b06-4851-8851-000000000001'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: INTENT,
      purchaseItemId: PURCHASE_ITEM,
      allocationConversionEvidenceId: EVIDENCE,
      reason: 'four each presented against three each ordered',
      provenance: 'two packs counted with pinned exact conversion',
    });

    assert.deepEqual(result, {
      purchaseReceivingExceptionId: EXCEPTION,
      discrepantQuantity: exactRational(1n, 1n),
      discrepantUnitId: EACH,
    });

    const proof = await admin.query<{
      discrepancy_num: string;
      discrepancy_den: string;
      discrepancy_unit: string;
      receipt_items: string;
      movements: string;
    }>(
      `select
         e.discrepant_quantity_num::text as discrepancy_num,
         e.discrepant_quantity_den::text as discrepancy_den,
         e.discrepant_unit_id::text as discrepancy_unit,
         (select count(*)::text from fridge.receipt_item where household_id = $2::uuid) as receipt_items,
         (select count(*)::text from fridge.inventory_movement where household_id = $2::uuid) as movements
       from fridge.purchase_receiving_exception e
       where e.purchase_receiving_exception_id = $1::uuid`,
      [EXCEPTION, HOUSEHOLD],
    );

    assert.equal(proof.rows.length, 1);
    assert.equal(Number(proof.rows[0]?.discrepancy_num), 1);
    assert.equal(Number(proof.rows[0]?.discrepancy_den), 1);
    assert.equal(proof.rows[0]?.discrepancy_unit, EACH);
    assert.equal(proof.rows[0]?.receipt_items, '0');
    assert.equal(proof.rows[0]?.movements, '0');
  } finally {
    await database.close();
    await admin.end();
  }
});
