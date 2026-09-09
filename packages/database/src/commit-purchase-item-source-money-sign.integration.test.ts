import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  HouseholdId,
  InvalidInputError,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdPurchaseItemSourceMoneyWriter } from './commit-purchase-item-source-money-facts.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for source money sign integration test');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for source money sign integration test');

const HOUSEHOLD = HouseholdId('b6900001-0b06-4690-8690-000000000001');
const ADMIN = PrincipalId('b6900002-0b06-4690-8690-000000000002');
const MEMBERSHIP = 'b6900003-0b06-4690-8690-000000000003';
const ROLE = 'BE06_MONEY_SIGN_ADMIN';
const PURCHASE = PurchaseId('b6900010-0b06-4690-8690-000000000010');
const ITEM = PurchaseItemId('b6900011-0b06-4690-8690-000000000011');
const PRODUCT = 'b6900012-0b06-4690-8690-000000000012';
const UNIT = 'b6900013-0b06-4690-8690-000000000013';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 source money sign admin')`,
      [ADMIN],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 source money sign household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 source money sign administrator')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`,
      [ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(
      `insert into fridge.currency (currency_code, display_name, lifecycle_status)
       values ('SGN', 'BE06 source money sign currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_MONEY_SIGN_DIM', 'BE06 source money sign dimension', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values ($1::uuid, 'BE06_MONEY_SIGN_UNIT', 'BE06_MONEY_SIGN_DIM', 'BE06 source money sign unit', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (
         product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status
       ) values ($1::uuid, 'GLOBAL', null, 'BE06 source money sign product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.purchase (
         purchase_id, household_id, transaction_currency_code, occurred_at
       ) values ($1::uuid, $2::uuid, 'SGN', clock_timestamp() - interval '5 minutes')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 1, $5::uuid)`,
      [ITEM, HOUSEHOLD, PURCHASE, PRODUCT, UNIT],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('persistence boundary rejects negative canonical source-role amount even when use-case validation is bypassed', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const transactions = new PgHouseholdProcurementAdministrationTransactionManager(database);
  const writer = new PgHouseholdPurchaseItemSourceMoneyWriter();
  const candidate = PurchaseItemMoneyFactId('b6900020-0b06-4690-8690-000000000020');

  try {
    await assert.rejects(
      transactions.withHouseholdProcurementAdministrationTransaction(
        ADMIN,
        HOUSEHOLD,
        async (transaction) =>
          writer.commitSourceMoneyFacts(transaction, {
            commandId: CommandId('b6900021-0b06-4690-8690-000000000021'),
            purchaseId: PURCHASE,
            purchaseItemId: ITEM,
            facts: [
              {
                candidatePurchaseItemMoneyFactId: candidate,
                semanticRole: 'LINE_DISCOUNT',
                amount: '-0.01',
                provenance: 'direct persistence boundary probe',
              },
            ],
          }),
      ),
      InvalidInputError,
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
