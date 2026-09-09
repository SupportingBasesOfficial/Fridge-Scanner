import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  HouseholdId,
  IdempotencyConflictError,
  MeasurementUnitId,
  NotFoundError,
  PrincipalId,
  ProductId,
  ReceiptId,
  ReceiptItemIntentId,
  CreateReceiptItemIntentUseCase,
  exactRational,
  type IdentifierGenerator,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdReceiptItemIntentWriter } from './create-receipt-item-intent.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for ReceiptItem intent integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for ReceiptItem intent integration tests');

const HOUSEHOLD = HouseholdId('e7300001-0b06-4730-8730-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('e7300002-0b06-4730-8730-000000000002');
const ADMIN = PrincipalId('e7300003-0b06-4730-8730-000000000003');
const NO_CAP = PrincipalId('e7300004-0b06-4730-8730-000000000004');
const ADMIN_MEMBERSHIP = 'e7300005-0b06-4730-8730-000000000005';
const NO_CAP_MEMBERSHIP = 'e7300006-0b06-4730-8730-000000000006';
const ADMIN_ROLE = 'BE06_INTENT_ADMIN';
const NO_CAP_ROLE = 'BE06_INTENT_NO_CAP';
const RECEIPT = ReceiptId('e7310001-0b06-4731-8731-000000000001');
const FOREIGN_RECEIPT = ReceiptId('e7310002-0b06-4731-8731-000000000002');
const UNIT = MeasurementUnitId('e7320001-0b06-4732-8732-000000000001');
const RETIRED_UNIT = MeasurementUnitId('e7320002-0b06-4732-8732-000000000002');
const GLOBAL_PRODUCT = ProductId('e7330001-0b06-4733-8733-000000000001');
const FOREIGN_PRODUCT = ProductId('e7330002-0b06-4733-8733-000000000002');

class QueueGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly values: T[]) {}
  generate(): T {
    const value = this.values.shift();
    if (value === undefined) throw new Error('identifier fixture exhausted');
    return value;
  }
}

function intentUseCase(database: PgDatabase, ids: ReceiptItemIntentId[]): CreateReceiptItemIntentUseCase {
  return new CreateReceiptItemIntentUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdReceiptItemIntentWriter(),
    new QueueGenerator(ids),
  );
}

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 Intent Admin'), ($2::uuid, 'BE06 Intent No Cap')`,
      [ADMIN, NO_CAP],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 Intent Household'), ($2::uuid, 'BE06 Intent Foreign Household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 intent administrator'), ($2, 'BE06 intent no capability')`,
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
       values ('BE06_INTENT_COUNT', 'BE06 Intent Count', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values
         ($1::uuid, 'BE06_INTENT_EACH', 'BE06_INTENT_COUNT', 'BE06 intent each', 'ACTIVE'),
         ($2::uuid, 'BE06_INTENT_OLD', 'BE06_INTENT_COUNT', 'BE06 intent old', 'RETIRED')`,
      [UNIT, RETIRED_UNIT],
    );
    await pool.query(
      `insert into fridge.product (
         product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status
       ) values
         ($1::uuid, 'GLOBAL', null, 'BE06 intent global Product', 'ACTIVE'),
         ($2::uuid, 'HOUSEHOLD', $3::uuid, 'BE06 intent foreign Product', 'ACTIVE')`,
      [GLOBAL_PRODUCT, FOREIGN_PRODUCT, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.receipt (
         receipt_id, household_id, occurred_at, source_provenance, recorded_at
       ) values
         ($1::uuid, $3::uuid, clock_timestamp(), 'intent fixture', clock_timestamp()),
         ($2::uuid, $4::uuid, clock_timestamp(), 'foreign intent fixture', clock_timestamp())`,
      [RECEIPT, FOREIGN_RECEIPT, HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('CreateReceiptItemIntent commits exact operational intent without physical receiving side effects', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('e7340001-0b06-4734-8734-000000000001');
  const intentId = ReceiptItemIntentId('e7340002-0b06-4734-8734-000000000002');

  try {
    const output = await intentUseCase(database, [intentId]).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      receiptId: RECEIPT,
      productId: GLOBAL_PRODUCT,
      quantity: exactRational(3n, 2n),
      measurementUnitId: UNIT,
      provenance: '  scanner intake  ',
    });
    assert.equal(output.receiptItemIntentId, intentId);

    const intent = await admin.query<{
      receipt_id: string;
      product_id: string;
      intended_quantity_num: string;
      intended_quantity_den: string;
      intended_unit_id: string;
      provenance: string;
    }>(
      `select receipt_id::text, product_id::text,
              intended_quantity_num::text, intended_quantity_den::text,
              intended_unit_id::text, provenance
         from fridge.receipt_item_intent
        where receipt_item_intent_id = $1::uuid`,
      [intentId],
    );
    assert.deepEqual(intent.rows, [{
      receipt_id: RECEIPT,
      product_id: GLOBAL_PRODUCT,
      intended_quantity_num: '3',
      intended_quantity_den: '2',
      intended_unit_id: UNIT,
      provenance: 'scanner intake',
    }]);

    const physical = await admin.query<{ receipt_items: string; allocations: string; effects: string }>(
      `select
         (select count(*) from fridge.receipt_item where household_id = $1::uuid)::text as receipt_items,
         (select count(*) from fridge.purchase_item_receipt_allocation where household_id = $1::uuid)::text as allocations,
         (select count(*) from fridge.receipt_item_inventory_effect where household_id = $1::uuid)::text as effects`,
      [HOUSEHOLD],
    );
    assert.deepEqual(physical.rows[0], { receipt_items: '0', allocations: '0', effects: '0' });
  } finally {
    await database.close();
    await admin.end();
  }
});

test('CreateReceiptItemIntent replay returns original identity and semantic divergence conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const commandId = CommandId('e7350001-0b06-4735-8735-000000000001');
  const original = ReceiptItemIntentId('e7350002-0b06-4735-8735-000000000002');
  try {
    const first = await intentUseCase(database, [original]).execute({
      commandId, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, receiptId: RECEIPT,
      productId: GLOBAL_PRODUCT, quantity: exactRational(2n, 1n), measurementUnitId: UNIT,
      provenance: 'manual intake',
    });
    const replay = await intentUseCase(database, [ReceiptItemIntentId('e7350003-0b06-4735-8735-000000000003')]).execute({
      commandId, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, receiptId: RECEIPT,
      productId: GLOBAL_PRODUCT, quantity: exactRational(2n, 1n), measurementUnitId: UNIT,
      provenance: 'manual intake',
    });
    assert.deepEqual(replay, first);
    assert.equal(replay.receiptItemIntentId, original);

    await assert.rejects(
      intentUseCase(database, [ReceiptItemIntentId('e7350004-0b06-4735-8735-000000000004')]).execute({
        commandId, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, receiptId: RECEIPT,
        productId: GLOBAL_PRODUCT, quantity: exactRational(3n, 1n), measurementUnitId: UNIT,
        provenance: 'manual intake',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('CreateReceiptItemIntent collapses foreign Receipt/Product and retired Unit to NotFound', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const cases = [
    { command: 'e7360001-0b06-4736-8736-000000000001', intent: 'e7360002-0b06-4736-8736-000000000002', receipt: FOREIGN_RECEIPT, product: GLOBAL_PRODUCT, unit: UNIT },
    { command: 'e7360003-0b06-4736-8736-000000000003', intent: 'e7360004-0b06-4736-8736-000000000004', receipt: RECEIPT, product: FOREIGN_PRODUCT, unit: UNIT },
    { command: 'e7360005-0b06-4736-8736-000000000005', intent: 'e7360006-0b06-4736-8736-000000000006', receipt: RECEIPT, product: GLOBAL_PRODUCT, unit: RETIRED_UNIT },
  ] as const;

  try {
    for (const entry of cases) {
      await assert.rejects(
        intentUseCase(database, [ReceiptItemIntentId(entry.intent)]).execute({
          commandId: CommandId(entry.command), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
          receiptId: entry.receipt, productId: entry.product, quantity: exactRational(1n, 1n),
          measurementUnitId: entry.unit, provenance: 'invalid reference proof',
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('CreateReceiptItemIntent requires procurement capability and rejects cross-intent CommandId reuse', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const crossIntent = CommandId('e7370001-0b06-4737-8737-000000000001');
  try {
    await assert.rejects(
      intentUseCase(database, [ReceiptItemIntentId('e7370002-0b06-4737-8737-000000000002')]).execute({
        commandId: CommandId('e7370003-0b06-4737-8737-000000000003'), actorPrincipalId: NO_CAP,
        householdId: HOUSEHOLD, receiptId: RECEIPT, productId: GLOBAL_PRODUCT,
        quantity: exactRational(1n, 1n), measurementUnitId: UNIT, provenance: 'no cap',
      }),
      HouseholdAuthorizationError,
    );

    await admin.query(
      `insert into fridge.household_procurement_command_registry (household_id, command_id, intent_code)
       values ($1::uuid, $2::uuid, 'CREATE_RECEIPT')`,
      [HOUSEHOLD, crossIntent],
    );
    await assert.rejects(
      intentUseCase(database, [ReceiptItemIntentId('e7370004-0b06-4737-8737-000000000004')]).execute({
        commandId: crossIntent, actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        receiptId: RECEIPT, productId: GLOBAL_PRODUCT, quantity: exactRational(1n, 1n),
        measurementUnitId: UNIT, provenance: 'cross intent',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});
