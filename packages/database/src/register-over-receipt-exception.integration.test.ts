import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  ConflictError,
  HouseholdId,
  IdempotencyConflictError,
  PrincipalId,
  PurchaseItemId,
  PurchaseReceivingExceptionId,
  ReceiptItemIntentId,
  RegisterOverReceiptExceptionUseCase,
  exactRational,
  type IdentifierGenerator,
} from '@fridge/application';
import { PgDatabase, HouseholdAuthorizationError } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdOverReceiptExceptionRegistrar } from './register-over-receipt-exception.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for over-receipt integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for over-receipt integration tests');

const HOUSEHOLD = HouseholdId('f8500001-0b06-4850-8850-000000000001');
const ADMIN = PrincipalId('f8500002-0b06-4850-8850-000000000002');
const NO_CAP = PrincipalId('f8500003-0b06-4850-8850-000000000003');
const ADMIN_MEMBERSHIP = 'f8500004-0b06-4850-8850-000000000004';
const NO_CAP_MEMBERSHIP = 'f8500005-0b06-4850-8850-000000000005';
const ADMIN_ROLE = 'BE06_OVER_RECEIPT_ADMIN';
const NO_CAP_ROLE = 'BE06_OVER_RECEIPT_VIEWER';
const PRODUCT = 'f8500006-0b06-4850-8850-000000000006';
const UNIT = 'f8500007-0b06-4850-8850-000000000007';
const PURCHASE = 'f8500008-0b06-4850-8850-000000000008';
const OVER_ITEM = PurchaseItemId('f8500009-0b06-4850-8850-000000000009');
const AVAILABLE_ITEM = PurchaseItemId('f8500010-0b06-4850-8850-000000000010');
const RECEIPT = 'f8500011-0b06-4850-8850-000000000011';
const OVER_INTENT = ReceiptItemIntentId('f8500012-0b06-4850-8850-000000000012');
const AVAILABLE_INTENT = ReceiptItemIntentId('f8500013-0b06-4850-8850-000000000013');

class OneId<T> implements IdentifierGenerator<T> {
  constructor(private value: T | undefined) {}
  generate(): T {
    if (this.value === undefined) throw new Error('identifier fixture exhausted');
    const result = this.value;
    this.value = undefined;
    return result;
  }
}

function useCase(database: PgDatabase, candidate: PurchaseReceivingExceptionId) {
  return new RegisterOverReceiptExceptionUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdOverReceiptExceptionRegistrar(),
    new OneId(candidate),
  );
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name) values
       ($1::uuid, 'BE06 over-receipt admin'),
       ($2::uuid, 'BE06 over-receipt no-cap')`,
      [ADMIN, NO_CAP],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 over-receipt household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name) values
       ($1, 'BE06 over-receipt admin'),
       ($2, 'BE06 over-receipt viewer')`,
      [ADMIN_ROLE, NO_CAP_ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`,
      [ADMIN_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values
       ($1::uuid, $3::uuid, $4::uuid, $6, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
       ($2::uuid, $3::uuid, $5::uuid, $7, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, NO_CAP_MEMBERSHIP, HOUSEHOLD, ADMIN, NO_CAP, ADMIN_ROLE, NO_CAP_ROLE],
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_OVER_COUNT', 'BE06 over-receipt count', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status)
       values ($1::uuid, 'BE06_OVER_EACH', 'BE06_OVER_COUNT', 'each', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', 'BE06 over-receipt product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.currency (currency_code, display_name, lifecycle_status)
       values ('ORI', 'Over receipt integration', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values ($1::uuid, $2::uuid, 'ORI', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id, provenance
       ) values
       ($1::uuid, $3::uuid, $4::uuid, $5::uuid, 1, 1, $6::uuid, 'one ordered'),
       ($2::uuid, $3::uuid, $4::uuid, $5::uuid, 3, 1, $6::uuid, 'three ordered')`,
      [OVER_ITEM, AVAILABLE_ITEM, HOUSEHOLD, PURCHASE, PRODUCT, UNIT],
    );
    await pool.query(
      `insert into fridge.receipt (receipt_id, household_id, purchase_id, occurred_at, source_provenance, recorded_at)
       values ($1::uuid, $2::uuid, $3::uuid, '2026-09-09T13:00:00Z', 'over-receipt observation', '2026-09-09T13:00:00Z')`,
      [RECEIPT, HOUSEHOLD, PURCHASE],
    );
    await pool.query(
      `insert into fridge.receipt_item_intent (
         receipt_item_intent_id, household_id, receipt_id, product_id,
         intended_quantity_num, intended_quantity_den, intended_unit_id, provenance
       ) values
       ($1::uuid, $3::uuid, $4::uuid, $5::uuid, 2, 1, $6::uuid, 'two physically presented'),
       ($2::uuid, $3::uuid, $4::uuid, $5::uuid, 2, 1, $6::uuid, 'two within allowance')`,
      [OVER_INTENT, AVAILABLE_INTENT, HOUSEHOLD, RECEIPT, PRODUCT, UNIT],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('registers exact detected over-receipt without creating physical receiving truth and replay is stable', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('f8510001-0b06-4851-8851-000000000001');
  const exceptionId = PurchaseReceivingExceptionId('f8510002-0b06-4851-8851-000000000002');

  try {
    const first = await useCase(database, exceptionId).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: OVER_INTENT,
      purchaseItemId: OVER_ITEM,
      reason: 'supplier delivered one extra unit',
      provenance: 'receiving station exact count',
    });

    assert.deepEqual(first, {
      purchaseReceivingExceptionId: exceptionId,
      discrepantQuantity: exactRational(1n, 1n),
      discrepantUnitId: UNIT,
    });

    const stored = await admin.query<{
      exception_kind: string;
      resolution_status: string;
      discrepant_quantity_num: string;
      discrepant_quantity_den: string;
      receipt_item_id: string | null;
      ordinary_allocation_id: string | null;
      substitution_allocation_id: string | null;
      detection_provenance: string;
    }>(
      `select e.exception_kind,
              e.resolution_status,
              e.discrepant_quantity_num::text,
              e.discrepant_quantity_den::text,
              e.receipt_item_id::text,
              e.ordinary_allocation_id::text,
              e.substitution_allocation_id::text,
              b.detection_provenance
         from fridge.purchase_receiving_exception e
         join fridge.receipt_item_intent_over_receipt_exception b
           on b.household_id = e.household_id
          and b.purchase_receiving_exception_id = e.purchase_receiving_exception_id
        where e.purchase_receiving_exception_id = $1::uuid`,
      [exceptionId],
    );
    assert.deepEqual(stored.rows, [{
      exception_kind: 'OVER_RECEIPT',
      resolution_status: 'DETECTED',
      discrepant_quantity_num: '1',
      discrepant_quantity_den: '1',
      receipt_item_id: null,
      ordinary_allocation_id: null,
      substitution_allocation_id: null,
      detection_provenance: 'receiving station exact count',
    }]);

    const physical = await admin.query<{ receipt_items: string; ordinary: string; substitutions: string; movements: string }>(
      `select
        (select count(*)::text from fridge.receipt_item where household_id = $1::uuid and receipt_id = $2::uuid) as receipt_items,
        (select count(*)::text from fridge.purchase_item_receipt_allocation where household_id = $1::uuid and purchase_item_id = $3::uuid) as ordinary,
        (select count(*)::text from fridge.purchase_item_substitution_allocation where household_id = $1::uuid and purchase_item_id = $3::uuid) as substitutions,
        (select count(*)::text from fridge.inventory_movement where household_id = $1::uuid and receipt_id = $2::uuid) as movements`,
      [HOUSEHOLD, RECEIPT, OVER_ITEM],
    );
    assert.deepEqual(physical.rows, [{ receipt_items: '0', ordinary: '0', substitutions: '0', movements: '0' }]);

    const replayCandidate = PurchaseReceivingExceptionId('f8510003-0b06-4851-8851-000000000003');
    const replay = await useCase(database, replayCandidate).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptItemIntentId: OVER_INTENT,
      purchaseItemId: OVER_ITEM,
      reason: 'supplier delivered one extra unit',
      provenance: 'receiving station exact count',
    });
    assert.deepEqual(replay, first);

    await assert.rejects(
      useCase(database, PurchaseReceivingExceptionId('f8510004-0b06-4851-8851-000000000004')).execute({
        commandId: CommandId('f8510005-0b06-4851-8851-000000000005'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: OVER_INTENT,
        purchaseItemId: OVER_ITEM,
        reason: 'same detected excess under another command',
        provenance: 'must not duplicate exception',
      }),
      ConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});

test('rejects exception registration when current PurchaseItem allowance is sufficient', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const candidate = PurchaseReceivingExceptionId('f8520001-0b06-4852-8852-000000000001');
  try {
    await assert.rejects(
      useCase(database, candidate).execute({
        commandId: CommandId('f8520002-0b06-4852-8852-000000000002'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: AVAILABLE_INTENT,
        purchaseItemId: AVAILABLE_ITEM,
        reason: 'should not be classified as excess',
        provenance: 'availability still sufficient',
      }),
      ConflictError,
    );
  } finally {
    await database.close();
  }
});

test('requires current procurement administration capability', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, PurchaseReceivingExceptionId('f8530001-0b06-4853-8853-000000000001')).execute({
        commandId: CommandId('f8530002-0b06-4853-8853-000000000002'),
        actorPrincipalId: NO_CAP,
        householdId: HOUSEHOLD,
        receiptItemIntentId: AVAILABLE_INTENT,
        purchaseItemId: OVER_ITEM,
        reason: 'unauthorized discrepancy attempt',
        provenance: 'must not persist',
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});

test('cross-intent CommandId reuse remains an idempotency conflict', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const command = 'f8540001-0b06-4854-8854-000000000001';
  try {
    await admin.query(
      `insert into fridge.household_procurement_command_registry (household_id, command_id, intent_code)
       values ($1::uuid, $2::uuid, 'CREATE_RECEIPT')`,
      [HOUSEHOLD, command],
    );
    await assert.rejects(
      useCase(database, PurchaseReceivingExceptionId('f8540002-0b06-4854-8854-000000000002')).execute({
        commandId: CommandId(command),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        receiptItemIntentId: AVAILABLE_INTENT,
        purchaseItemId: OVER_ITEM,
        reason: 'cross-intent command reuse',
        provenance: 'must conflict',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});
