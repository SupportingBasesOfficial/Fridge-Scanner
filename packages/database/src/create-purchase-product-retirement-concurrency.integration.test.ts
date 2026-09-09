import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for CreatePurchase Product-retirement concurrency tests');
}

const HOUSEHOLD = 'd6180001-0b06-4618-8618-000000000001';
const UNIT = 'd6180002-0b06-4618-8618-000000000002';
const PRODUCT = 'd6180003-0b06-4618-8618-000000000003';
const PURCHASE = 'd6180004-0b06-4618-8618-000000000004';
const PURCHASE_ITEM = 'd6180005-0b06-4618-8618-000000000005';
const SECOND_PURCHASE = 'd6180006-0b06-4618-8618-000000000006';
const SECOND_ITEM = 'd6180007-0b06-4618-8618-000000000007';

async function seedFixture(pool: Pool): Promise<void> {
  await pool.query(
    `insert into fridge.household (household_id, display_name)
     values ($1::uuid, 'BE06 Product lock Household')`,
    [HOUSEHOLD],
  );
  await pool.query(
    `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
     values ('BE06_LOCK_COUNT', 'BE06 lock count', 'ACTIVE')`,
  );
  await pool.query(
    `insert into fridge.measurement_unit (
       measurement_unit_id, unit_code, dimension_code, symbol, display_name, lifecycle_status
     ) values ($1::uuid, 'BE06_LOCK_EACH', 'BE06_LOCK_COUNT', 'ea', 'BE06 lock each', 'ACTIVE')`,
    [UNIT],
  );
  await pool.query(
    `insert into fridge.currency (currency_code, display_name, lifecycle_status)
     values ('QLK', 'BE06 lock currency', 'ACTIVE')`,
  );
  await pool.query(
    `insert into fridge.product (
       product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status
     ) values ($1::uuid, 'HOUSEHOLD', $2::uuid, 'BE06 lock Product', 'ACTIVE')`,
    [PRODUCT, HOUSEHOLD],
  );
  await pool.query(
    `insert into fridge.purchase (
       purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at
     ) values ($1::uuid, $2::uuid, 'QLK', clock_timestamp(), clock_timestamp())`,
    [PURCHASE, HOUSEHOLD],
  );
}

test('PurchaseItem current Product guard serializes lifecycle retirement and emits the internal race-loss code after retirement', async () => {
  const setup = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const txPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 2 });

  try {
    await seedFixture(setup);

    const itemClient = await txPool.connect();
    const retirementClient = await txPool.connect();
    try {
      await itemClient.query('begin');
      await itemClient.query(
        `insert into fridge.purchase_item (
           purchase_item_id,
           household_id,
           purchase_id,
           product_id,
           purchased_quantity_num,
           purchased_quantity_den,
           purchased_unit_id,
           recorded_at
         ) values (
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::uuid,
           1,
           1,
           $5::uuid,
           clock_timestamp()
         )`,
        [PURCHASE_ITEM, HOUSEHOLD, PURCHASE, PRODUCT, UNIT],
      );

      await retirementClient.query('begin');
      let retirementSettled = false;
      const retirement = retirementClient.query<{ lifecycle_status: string }>(
        `update fridge.product
            set lifecycle_status = 'RETIRED'
          where product_id = $1::uuid
        returning lifecycle_status`,
        [PRODUCT],
      ).then(
        (result) => {
          retirementSettled = true;
          return result;
        },
        (error: unknown) => {
          retirementSettled = true;
          throw error;
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(
        retirementSettled,
        false,
        'Product lifecycle update must wait for the PurchaseItem transaction holding FOR SHARE',
      );

      await itemClient.query('commit');

      const retired = await retirement;
      assert.equal(retired.rows[0]?.lifecycle_status, 'RETIRED');
      await retirementClient.query('commit');
    } catch (error) {
      await itemClient.query('rollback').catch(() => undefined);
      await retirementClient.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      itemClient.release();
      retirementClient.release();
    }

    await setup.query(
      `insert into fridge.purchase (
         purchase_id, household_id, transaction_currency_code, occurred_at, recorded_at
       ) values ($1::uuid, $2::uuid, 'QLK', clock_timestamp(), clock_timestamp())`,
      [SECOND_PURCHASE, HOUSEHOLD],
    );

    await assert.rejects(
      setup.query(
        `insert into fridge.purchase_item (
           purchase_item_id,
           household_id,
           purchase_id,
           product_id,
           purchased_quantity_num,
           purchased_quantity_den,
           purchased_unit_id,
           recorded_at
         ) values (
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::uuid,
           1,
           1,
           $5::uuid,
           clock_timestamp()
         )`,
        [SECOND_ITEM, HOUSEHOLD, SECOND_PURCHASE, PRODUCT, UNIT],
      ),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { readonly code?: string }).code === 'P6P01',
    );

    const state = await setup.query<{
      lifecycle_status: string;
      first_item_count: string;
      second_item_count: string;
    }>(
      `select p.lifecycle_status,
              (select count(*)::text from fridge.purchase_item where purchase_item_id = $2::uuid) as first_item_count,
              (select count(*)::text from fridge.purchase_item where purchase_item_id = $3::uuid) as second_item_count
         from fridge.product p
        where p.product_id = $1::uuid`,
      [PRODUCT, PURCHASE_ITEM, SECOND_ITEM],
    );

    assert.deepEqual(state.rows[0], {
      lifecycle_status: 'RETIRED',
      first_item_count: '1',
      second_item_count: '0',
    });
  } finally {
    await setup.end();
    await txPool.end();
  }
});
