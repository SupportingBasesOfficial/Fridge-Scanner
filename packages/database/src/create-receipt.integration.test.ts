import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CreateReceiptUseCase,
  HouseholdId,
  IdempotencyConflictError,
  NotFoundError,
  PrincipalId,
  PurchaseId,
  ReceiptId,
  type IdentifierGenerator,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdReceiptWriter } from './create-receipt.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for CreateReceipt integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for CreateReceipt integration tests');

const HOUSEHOLD = HouseholdId('e7600001-0b06-4760-8760-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('e7600002-0b06-4760-8760-000000000002');
const ADMIN = PrincipalId('e7600003-0b06-4760-8760-000000000003');
const NO_CAP = PrincipalId('e7600004-0b06-4760-8760-000000000004');
const ADMIN_MEMBERSHIP = 'e7600005-0b06-4760-8760-000000000005';
const NO_CAP_MEMBERSHIP = 'e7600006-0b06-4760-8760-000000000006';
const ADMIN_ROLE = 'BE06_RECEIPT_ADMIN';
const NO_CAP_ROLE = 'BE06_RECEIPT_NO_CAP';
const PURCHASE = PurchaseId('e7600007-0b06-4760-8760-000000000007');
const FOREIGN_PURCHASE = PurchaseId('e7600008-0b06-4760-8760-000000000008');

class QueueGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly values: T[]) {}
  generate(): T {
    const value = this.values.shift();
    if (value === undefined) throw new Error('identifier fixture exhausted');
    return value;
  }
}

function receiptUseCase(database: PgDatabase, receiptIds: ReceiptId[]): CreateReceiptUseCase {
  return new CreateReceiptUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdReceiptWriter(),
    new QueueGenerator(receiptIds),
  );
}

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 Receipt Admin'), ($2::uuid, 'BE06 Receipt No Cap')`,
      [ADMIN, NO_CAP],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 Receipt Household'), ($2::uuid, 'BE06 Receipt Foreign Household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 receipt administrator'), ($2, 'BE06 receipt no capability')`,
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
      `insert into fridge.currency (currency_code, display_name, lifecycle_status)
       values ('RCP', 'BE06 Receipt Fixture Currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.purchase (
         purchase_id, household_id, transaction_currency_code, occurred_at, source_provenance
       ) values
         ($1::uuid, $3::uuid, 'RCP', clock_timestamp() - interval '10 minutes', 'fixture'),
         ($2::uuid, $4::uuid, 'RCP', clock_timestamp() - interval '10 minutes', 'foreign fixture')`,
      [PURCHASE, FOREIGN_PURCHASE, HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('CreateReceipt creates immutable live Receipt with optional same-Household Purchase and no ReceiptItem', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const receiptId = ReceiptId('e7610001-0b06-4761-8761-000000000001');
  const commandId = CommandId('e7610002-0b06-4761-8761-000000000002');

  try {
    const output = await receiptUseCase(database, [receiptId]).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      provenance: '  MANUAL_RECEIVING  ',
    });
    assert.equal(output.receiptId, receiptId);

    const receipt = await admin.query<{
      household_id: string;
      purchase_id: string | null;
      source_identity: string | null;
      source_provenance: string | null;
      same_time: boolean;
    }>(
      `select household_id::text,
              purchase_id::text,
              source_identity,
              source_provenance,
              occurred_at = recorded_at as same_time
         from fridge.receipt
        where receipt_id = $1::uuid`,
      [receiptId],
    );
    assert.deepEqual(receipt.rows, [{
      household_id: HOUSEHOLD,
      purchase_id: PURCHASE,
      source_identity: null,
      source_provenance: 'MANUAL_RECEIVING',
      same_time: true,
    }]);

    const items = await admin.query<{ count: string }>(
      `select count(*)::text as count
         from fridge.receipt_item
        where receipt_id = $1::uuid`,
      [receiptId],
    );
    assert.equal(items.rows[0]?.count, '0');
  } finally {
    await database.close();
    await admin.end();
  }
});

test('CreateReceipt supports direct Receipt without Purchase when workflow provenance is explicit', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const receiptId = ReceiptId('e7620001-0b06-4762-8762-000000000001');

  try {
    await receiptUseCase(database, [receiptId]).execute({
      commandId: CommandId('e7620002-0b06-4762-8762-000000000002'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      provenance: 'DIRECT_PHYSICAL_RECEIPT',
    });

    const receipt = await admin.query<{ purchase_id: string | null; source_provenance: string }>(
      `select purchase_id::text, source_provenance
         from fridge.receipt
        where receipt_id = $1::uuid`,
      [receiptId],
    );
    assert.deepEqual(receipt.rows, [{ purchase_id: null, source_provenance: 'DIRECT_PHYSICAL_RECEIPT' }]);
  } finally {
    await database.close();
    await admin.end();
  }
});

test('CreateReceipt committed replay returns original identity and semantic divergence conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const commandId = CommandId('e7630001-0b06-4763-8763-000000000001');
  const original = ReceiptId('e7630002-0b06-4763-8763-000000000002');

  try {
    const first = await receiptUseCase(database, [original]).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      provenance: 'DELIVERY_DOOR',
    });
    const replay = await receiptUseCase(
      database,
      [ReceiptId('e7630003-0b06-4763-8763-000000000003')],
    ).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      provenance: 'DELIVERY_DOOR',
    });
    assert.deepEqual(replay, first);
    assert.equal(replay.receiptId, original);

    await assert.rejects(
      receiptUseCase(database, [ReceiptId('e7630004-0b06-4763-8763-000000000004')]).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        purchaseId: PURCHASE,
        provenance: 'OTHER_WORKFLOW',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('CreateReceipt collapses foreign or missing Purchase to NotFound without persistence', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const cases = [
    {
      purchaseId: FOREIGN_PURCHASE,
      commandId: CommandId('e7640001-0b06-4764-8764-000000000001'),
      receiptId: ReceiptId('e7640002-0b06-4764-8764-000000000002'),
    },
    {
      purchaseId: PurchaseId('e7640003-0b06-4764-8764-000000000003'),
      commandId: CommandId('e7640004-0b06-4764-8764-000000000004'),
      receiptId: ReceiptId('e7640005-0b06-4764-8764-000000000005'),
    },
  ];

  try {
    for (const fixture of cases) {
      await assert.rejects(
        receiptUseCase(database, [fixture.receiptId]).execute({
          commandId: fixture.commandId,
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          purchaseId: fixture.purchaseId,
          provenance: 'PURCHASE_LINKED',
        }),
        NotFoundError,
      );
      const count = await admin.query<{ count: string }>(
        `select count(*)::text as count from fridge.receipt where receipt_id = $1::uuid`,
        [fixture.receiptId],
      );
      assert.equal(count.rows[0]?.count, '0');
    }
  } finally {
    await database.close();
    await admin.end();
  }
});

test('CreateReceipt requires current HOUSEHOLD_PROCUREMENT_ADMINISTER capability', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      receiptUseCase(database, [ReceiptId('e7650001-0b06-4765-8765-000000000001')]).execute({
        commandId: CommandId('e7650002-0b06-4765-8765-000000000002'),
        actorPrincipalId: NO_CAP,
        householdId: HOUSEHOLD,
        provenance: 'DIRECT_PHYSICAL_RECEIPT',
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});

test('CreateReceipt rejects cross-intent CommandId reuse', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('e7660001-0b06-4766-8766-000000000001');
  try {
    await admin.query(
      `insert into fridge.household_procurement_command_registry (household_id, command_id, intent_code)
       values ($1::uuid, $2::uuid, 'CREATE_PURCHASE')`,
      [HOUSEHOLD, commandId],
    );

    await assert.rejects(
      receiptUseCase(database, [ReceiptId('e7660002-0b06-4766-8766-000000000002')]).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        provenance: 'DIRECT_PHYSICAL_RECEIPT',
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
    await admin.end();
  }
});
