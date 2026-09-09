import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CommitPurchaseItemSourceMoneyFactsUseCase,
  ConflictError,
  HouseholdId,
  IdempotencyConflictError,
  NotFoundError,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  type IdentifierGenerator,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdPurchaseItemSourceMoneyWriter } from './commit-purchase-item-source-money-facts.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for source money integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for source money integration tests');

const HOUSEHOLD = HouseholdId('b6800001-0b06-4680-8680-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('b6800002-0b06-4680-8680-000000000002');
const ADMIN = PrincipalId('b6800003-0b06-4680-8680-000000000003');
const NO_CAP = PrincipalId('b6800004-0b06-4680-8680-000000000004');
const ADMIN_MEMBERSHIP = 'b6800005-0b06-4680-8680-000000000005';
const NO_CAP_MEMBERSHIP = 'b6800006-0b06-4680-8680-000000000006';
const ADMIN_ROLE = 'BE06_MONEY_ADMIN';
const NO_CAP_ROLE = 'BE06_MONEY_NO_CAP';
const PURCHASE = PurchaseId('b6800010-0b06-4680-8680-000000000010');
const ITEM = PurchaseItemId('b6800011-0b06-4680-8680-000000000011');
const FOREIGN_PURCHASE = PurchaseId('b6800012-0b06-4680-8680-000000000012');
const FOREIGN_ITEM = PurchaseItemId('b6800013-0b06-4680-8680-000000000013');
const PRODUCT = 'b6800014-0b06-4680-8680-000000000014';
const UNIT = 'b6800015-0b06-4680-8680-000000000015';
const CONCURRENT_ITEM = PurchaseItemId('b6800016-0b06-4680-8680-000000000016');

class QueueGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly values: T[]) {}
  generate(): T {
    const value = this.values.shift();
    if (value === undefined) throw new Error('identifier fixture exhausted');
    return value;
  }
}

function factId(suffix: string): PurchaseItemMoneyFactId {
  return PurchaseItemMoneyFactId(`b6810000-0b06-4681-8681-${suffix.padStart(12, '0')}`);
}

function commandId(suffix: string): CommandId {
  return CommandId(`b6820000-0b06-4682-8682-${suffix.padStart(12, '0')}`);
}

function useCase(database: PgDatabase, ids: PurchaseItemMoneyFactId[]): CommitPurchaseItemSourceMoneyFactsUseCase {
  return new CommitPurchaseItemSourceMoneyFactsUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdPurchaseItemSourceMoneyWriter(),
    new QueueGenerator(ids),
  );
}

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 money admin'), ($2::uuid, 'BE06 money no cap')`,
      [ADMIN, NO_CAP],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 money household'), ($2::uuid, 'BE06 money foreign household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 money administrator'), ($2, 'BE06 money no capability')`,
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
       values ('MNY', 'BE06 source money currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_MONEY_DIM', 'BE06 source money dimension', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values ($1::uuid, 'BE06_MONEY_UNIT', 'BE06_MONEY_DIM', 'BE06 source money unit', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (
         product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status
       ) values ($1::uuid, 'GLOBAL', null, 'BE06 source money product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.purchase (
         purchase_id, household_id, transaction_currency_code, occurred_at
       ) values
         ($1::uuid, $3::uuid, 'MNY', clock_timestamp() - interval '10 minutes'),
         ($2::uuid, $4::uuid, 'MNY', clock_timestamp() - interval '10 minutes')`,
      [PURCHASE, FOREIGN_PURCHASE, HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id
       ) values
         ($1::uuid, $4::uuid, $6::uuid, $8::uuid, 2, 1, $9::uuid),
         ($2::uuid, $5::uuid, $7::uuid, $8::uuid, 1, 1, $9::uuid),
         ($3::uuid, $4::uuid, $6::uuid, $8::uuid, 1, 1, $9::uuid)`,
      [
        ITEM,
        FOREIGN_ITEM,
        CONCURRENT_ITEM,
        HOUSEHOLD,
        FOREIGN_HOUSEHOLD,
        PURCHASE,
        FOREIGN_PURCHASE,
        PRODUCT,
        UNIT,
      ],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('procurement administrator commits exact source money facts in Purchase transaction currency', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const gross = factId('1');
  const net = factId('2');
  try {
    const result = await useCase(database, [gross, net]).execute({
      commandId: commandId('1'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      facts: [
        { semanticRole: 'LINE_GROSS', amount: '19.9900', provenance: ' invoice gross ' },
        { semanticRole: 'LINE_NET', amount: '19.99', provenance: 'invoice net' },
      ],
    });
    assert.deepEqual(result.purchaseItemMoneyFactIds, [gross, net]);

    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const stored = await adminPool.query(
        `select purchase_item_money_fact_id::text, semantic_role, amount::text,
                currency_code, is_source_fact, money_rounding_policy_id, provenance
           from fridge.purchase_item_money_fact
          where household_id = $1::uuid and purchase_item_id = $2::uuid
          order by semantic_role`,
        [HOUSEHOLD, ITEM],
      );
      assert.deepEqual(
        stored.rows.map((row) => ({
          id: row.purchase_item_money_fact_id,
          role: row.semantic_role,
          amount: row.amount,
          currency: row.currency_code,
          source: row.is_source_fact,
          rounding: row.money_rounding_policy_id,
          provenance: row.provenance,
        })),
        [
          { id: gross, role: 'LINE_GROSS', amount: '19.99', currency: 'MNY', source: true, rounding: null, provenance: 'invoice gross' },
          { id: net, role: 'LINE_NET', amount: '19.99', currency: 'MNY', source: true, rounding: null, provenance: 'invoice net' },
        ],
      );
    } finally {
      await adminPool.end();
    }
  } finally {
    await database.close();
  }
});

test('committed replay returns original fact identities without duplicating rows', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const firstId = factId('3');
  const retryCandidate = factId('4');
  const command = commandId('2');
  try {
    const first = await useCase(database, [firstId]).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      facts: [{ semanticRole: 'LINE_DISCOUNT', amount: '1.00', provenance: 'invoice discount' }],
    });
    const retry = await useCase(database, [retryCandidate]).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      facts: [{ semanticRole: 'LINE_DISCOUNT', amount: '1', provenance: 'invoice discount' }],
    });
    assert.deepEqual(first.purchaseItemMoneyFactIds, [firstId]);
    assert.deepEqual(retry.purchaseItemMoneyFactIds, [firstId]);

    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const count = await pool.query(
        `select count(*)::int as count
           from fridge.purchase_item_money_fact
          where household_id = $1::uuid and purchase_item_id = $2::uuid and semantic_role = 'LINE_DISCOUNT'`,
        [HOUSEHOLD, ITEM],
      );
      assert.equal(count.rows[0]?.count, 1);
    } finally {
      await pool.end();
    }
  } finally {
    await database.close();
  }
});

test('concurrent first use of one CommandId converges on one physical source fact', async () => {
  const databaseA = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const databaseB = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const firstCandidate = factId('12');
  const secondCandidate = factId('13');
  const command = commandId('9');
  const input = {
    commandId: command,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    purchaseId: PURCHASE,
    purchaseItemId: CONCURRENT_ITEM,
    facts: [{ semanticRole: 'LINE_GROSS' as const, amount: '5.00', provenance: 'concurrent invoice gross' }],
  };

  try {
    const [left, right] = await Promise.all([
      useCase(databaseA, [firstCandidate]).execute(input),
      useCase(databaseB, [secondCandidate]).execute(input),
    ]);

    assert.deepEqual(left.purchaseItemMoneyFactIds, right.purchaseItemMoneyFactIds);
    assert.equal(left.purchaseItemMoneyFactIds.length, 1);
    assert.ok(
      left.purchaseItemMoneyFactIds[0] === firstCandidate ||
        left.purchaseItemMoneyFactIds[0] === secondCandidate,
    );

    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const physical = await pool.query(
        `select count(*)::int as fact_count,
                min(purchase_item_money_fact_id::text) as fact_id
           from fridge.purchase_item_money_fact
          where household_id = $1::uuid
            and purchase_item_id = $2::uuid
            and semantic_role = 'LINE_GROSS'
            and is_source_fact`,
        [HOUSEHOLD, CONCURRENT_ITEM],
      );
      assert.equal(physical.rows[0]?.fact_count, 1);
      assert.equal(physical.rows[0]?.fact_id, left.purchaseItemMoneyFactIds[0]);

      const results = await pool.query(
        `select count(*)::int as result_count
           from fridge.household_purchase_item_source_money_command_result
          where household_id = $1::uuid and command_id = $2::uuid`,
        [HOUSEHOLD, command],
      );
      assert.equal(results.rows[0]?.result_count, 1);
    } finally {
      await pool.end();
    }
  } finally {
    await databaseA.close();
    await databaseB.close();
  }
});

test('CommandId reserved by CreatePurchase conflicts cross-intent without persisting a money fact', async () => {
  const command = commandId('10');
  const candidate = factId('14');
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.household_procurement_command_registry (household_id, command_id, intent_code)
       values ($1::uuid, $2::uuid, 'CREATE_PURCHASE')`,
      [HOUSEHOLD, command],
    );
  } finally {
    await pool.end();
  }

  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, [candidate]).execute({
        commandId: command,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        purchaseId: PURCHASE,
        purchaseItemId: CONCURRENT_ITEM,
        facts: [{ semanticRole: 'LINE_NET', amount: '5', provenance: 'cross-intent probe' }],
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }

  const verifyPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const persisted = await verifyPool.query(
      `select count(*)::int as count
         from fridge.purchase_item_money_fact
        where purchase_item_money_fact_id = $1::uuid`,
      [candidate],
    );
    assert.equal(persisted.rows[0]?.count, 0);
  } finally {
    await verifyPool.end();
  }
});

test('same CommandId with different semantic facts is an idempotency conflict', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const command = commandId('3');
  try {
    await useCase(database, [factId('5')]).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      facts: [{ semanticRole: 'LINE_TAX', amount: '2', provenance: 'invoice tax' }],
    });
    await assert.rejects(
      useCase(database, [factId('6')]).execute({
        commandId: command,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        purchaseId: PURCHASE,
        purchaseItemId: ITEM,
        facts: [{ semanticRole: 'LINE_TAX', amount: '3', provenance: 'invoice tax' }],
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('a different command cannot redeclare an already committed source semantic role', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, [factId('7')]).execute({
        commandId: commandId('4'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        purchaseId: PURCHASE,
        purchaseItemId: ITEM,
        facts: [{ semanticRole: 'LINE_GROSS', amount: '20', provenance: 'second source gross' }],
      }),
      ConflictError,
    );
  } finally {
    await database.close();
  }
});

test('ordinary Household member without procurement capability cannot commit source money facts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, [factId('8')]).execute({
        commandId: commandId('5'),
        actorPrincipalId: NO_CAP,
        householdId: HOUSEHOLD,
        purchaseId: PURCHASE,
        purchaseItemId: ITEM,
        facts: [{ semanticRole: 'LINE_CHARGE', amount: '1', provenance: 'invoice charge' }],
      }),
      HouseholdAuthorizationError,
    );
  } finally {
    await database.close();
  }
});

test('foreign or missing PurchaseItem identity collapses to NotFound', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, [factId('9')]).execute({
        commandId: commandId('6'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        purchaseId: FOREIGN_PURCHASE,
        purchaseItemId: FOREIGN_ITEM,
        facts: [{ semanticRole: 'LINE_CHARGE', amount: '1', provenance: 'foreign attempt' }],
      }),
      NotFoundError,
    );
    await assert.rejects(
      useCase(database, [factId('10')]).execute({
        commandId: commandId('7'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        purchaseId: PurchaseId('b6800090-0b06-4680-8680-000000000090'),
        purchaseItemId: PurchaseItemId('b6800091-0b06-4680-8680-000000000091'),
        facts: [{ semanticRole: 'LINE_CHARGE', amount: '1', provenance: 'missing attempt' }],
      }),
      NotFoundError,
    );
  } finally {
    await database.close();
  }
});

test('historical Product and MeasurementUnit retirement does not block later source evidence commitment', async () => {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(`update fridge.product set lifecycle_status = 'RETIRED' where product_id = $1::uuid`, [PRODUCT]);
    await pool.query(`update fridge.measurement_unit set lifecycle_status = 'RETIRED' where measurement_unit_id = $1::uuid`, [UNIT]);
  } finally {
    await pool.end();
  }

  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const id = factId('11');
  try {
    const result = await useCase(database, [id]).execute({
      commandId: commandId('8'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      facts: [{ semanticRole: 'LINE_CHARGE', amount: '0.25', provenance: 'late invoice evidence' }],
    });
    assert.deepEqual(result.purchaseItemMoneyFactIds, [id]);
  } finally {
    await database.close();
  }
});

test('committed PurchaseItem money fact is physically immutable', async () => {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await assert.rejects(
      pool.query(
        `update fridge.purchase_item_money_fact
            set amount = amount + 1
          where purchase_item_money_fact_id = $1::uuid`,
        [factId('1')],
      ),
      (error: unknown) => (error as { code?: string }).code === '55000',
    );
  } finally {
    await pool.end();
  }
});
