import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  GetHouseholdPurchaseUseCase,
  HouseholdId,
  ListHouseholdPurchasesUseCase,
  NotFoundError,
  PrincipalId,
  ProductId,
  PurchaseId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdPurchaseReader } from './purchase-read.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('81000001-0067-4001-8067-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('81000002-0067-4002-8067-000000000002');
const MEMBER = PrincipalId('81000003-0067-4003-8067-000000000003');
const MEMBERSHIP = '81000004-0067-4004-8067-000000000004';
const PRODUCT = ProductId('81000005-0067-4005-8067-000000000005');
const UNIT = '81000006-0067-4006-8067-000000000006';
const NEWER = PurchaseId('81000007-0067-4007-8067-000000000007');
const OLDER = PurchaseId('81000008-0067-4008-8067-000000000008');
const SAME_TIME_LOWER_ID = PurchaseId('81000006-0067-4006-8067-000000000006');
const FOREIGN = PurchaseId('81000009-0067-4009-8067-000000000009');
const MISSING = PurchaseId('81000010-0067-4010-8067-000000000010');
const ITEM = '81000011-0067-4011-8067-000000000011';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(`insert into fridge.user_profile (user_id, display_name) values ($1::uuid, 'BE06 Purchase Reader')`, [MEMBER]);
    await pool.query(`insert into fridge.household (household_id, display_name) values ($1::uuid, 'BE06 Read Household'), ($2::uuid, 'BE06 Read Foreign')`, [HOUSEHOLD, FOREIGN_HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role (role_code, display_name) values ('BE06_PURCHASE_READER', 'BE06 ordinary Purchase reader')`);
    await pool.query(
      `insert into fridge.household_membership (membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to)
       values ($1::uuid, $2::uuid, $3::uuid, 'BE06_PURCHASE_READER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, MEMBER],
    );
    await pool.query(`insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status) values ('BE06_READ_COUNT', 'BE06 read count', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.measurement_unit (measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status)
       values ($1::uuid, 'BE06_READ_EACH', 'BE06_READ_COUNT', 'BE06 read each', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(`insert into fridge.currency (currency_code, display_name, lifecycle_status) values ('RDR', 'Read Currency', 'ACTIVE')`);
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status)
       values ($1::uuid, 'HOUSEHOLD', $2::uuid, 'Historical read Product', 'ACTIVE')`,
      [PRODUCT, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at)
       values
         ($1::uuid, $4::uuid, 'RDR', '2026-09-09T12:00:00Z', '2026-09-09T12:00:01Z'),
         ($2::uuid, $4::uuid, 'RDR', '2026-09-08T12:00:00Z', '2026-09-08T12:00:01Z'),
         ($3::uuid, $4::uuid, 'RDR', '2026-09-09T12:00:00Z', '2026-09-09T12:00:02Z'),
         ($5::uuid, $6::uuid, 'RDR', '2026-09-10T12:00:00Z', '2026-09-10T12:00:01Z')`,
      [NEWER, OLDER, SAME_TIME_LOWER_ID, HOUSEHOLD, FOREIGN, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (purchase_item_id, household_id, purchase_id, product_id, purchased_quantity_num, purchased_quantity_den, purchased_unit_id, recorded_at)
       values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 3, 2, $5::uuid, '2026-09-09T12:00:01Z')`,
      [ITEM, HOUSEHOLD, NEWER, PRODUCT, UNIT],
    );
    await pool.query(`update fridge.product set lifecycle_status = 'RETIRED' where product_id = $1::uuid`, [PRODUCT]);
    await pool.query(`update fridge.measurement_unit set lifecycle_status = 'RETIRED' where measurement_unit_id = $1::uuid`, [UNIT]);
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('ordinary current member keyset-paginates only Household Purchases without procurement mutation capability', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new ListHouseholdPurchasesUseCase(database, new PgHouseholdPurchaseReader());
  try {
    const first = await useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, pageSize: 1 });
    assert.deepEqual(first.purchases.map((purchase) => purchase.purchaseId), [NEWER]);
    assert.notEqual(first.nextCursor, null);

    const second = await useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, pageSize: 1, cursor: first.nextCursor });
    assert.deepEqual(second.purchases.map((purchase) => purchase.purchaseId), [SAME_TIME_LOWER_ID]);
    assert.notEqual(second.nextCursor, null);

    const third = await useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, pageSize: 1, cursor: second.nextCursor });
    assert.deepEqual(third.purchases.map((purchase) => purchase.purchaseId), [OLDER]);
    assert.equal(third.nextCursor, null);
  } finally {
    await database.close();
  }
});

test('Purchase detail preserves historical Product and MeasurementUnit identities after later retirement', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const result = await new GetHouseholdPurchaseUseCase(database, new PgHouseholdPurchaseReader()).execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, purchaseId: NEWER });
    assert.equal(result.purchase.purchaseId, NEWER);
    assert.equal(result.purchase.itemCount, 1);
    assert.equal(result.purchase.items[0]?.productId, PRODUCT);
    assert.equal(result.purchase.items[0]?.measurementUnitId, UNIT);
    assert.equal(result.purchase.items[0]?.quantity.numerator, 3n);
    assert.equal(result.purchase.items[0]?.quantity.denominator, 2n);
  } finally {
    await database.close();
  }
});

test('Purchase lookup collapses foreign-Household and missing identities to NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new GetHouseholdPurchaseUseCase(database, new PgHouseholdPurchaseReader());
  try {
    for (const purchaseId of [FOREIGN, MISSING]) {
      await assert.rejects(useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, purchaseId }), NotFoundError);
    }
  } finally {
    await database.close();
  }
});

test('Purchase read boundary revalidates exact current membership after transaction authorization', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const reader = new PgHouseholdPurchaseReader();
  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(MEMBER, HOUSEHOLD, async (transaction) => {
        await adminPool.query(`update fridge.household_membership set lifecycle_status = 'ENDED', effective_to = clock_timestamp() where membership_id = $1::uuid`, [MEMBERSHIP]);
        await reader.listHouseholdPurchases(transaction, { limit: 2, cursor: null });
      }),
      (error: unknown) => (error as { code?: string }).code === 'HOUSEHOLD_UNAUTHORIZED',
    );
  } finally {
    await adminPool.query(`update fridge.household_membership set lifecycle_status = 'ACTIVE', effective_to = null where membership_id = $1::uuid`, [MEMBERSHIP]);
    await adminPool.end();
    await database.close();
  }
});
