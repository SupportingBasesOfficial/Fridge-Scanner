import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  HouseholdId,
  InvalidInputError,
  MeasurementUnitId,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdPurchaseItemPricingBasisWriter } from './commit-purchase-item-pricing-basis.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for pricing basis lexical integration test');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for pricing basis lexical integration test');

const HOUSEHOLD = HouseholdId('c7400001-0b06-4740-8740-000000000001');
const ADMIN = PrincipalId('c7400002-0b06-4740-8740-000000000002');
const MEMBERSHIP = 'c7400003-0b06-4740-8740-000000000003';
const ROLE = 'BE06_PRICE_LEX_ADMIN';
const PURCHASE = PurchaseId('c7400010-0b06-4740-8740-000000000010');
const ITEM = PurchaseItemId('c7400011-0b06-4740-8740-000000000011');
const PRODUCT = 'c7400012-0b06-4740-8740-000000000012';
const UNIT = MeasurementUnitId('c7400013-0b06-4740-8740-000000000013');
const CANDIDATE = PurchaseItemMoneyFactId('c7400020-0b06-4740-8740-000000000020');
const COMMAND = CommandId('c7400021-0b06-4740-8740-000000000021');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 pricing lexical admin')`,
      [ADMIN],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 pricing lexical household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 pricing lexical administrator')`,
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
       values ('PCL', 'BE06 pricing lexical currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_PRICE_LEX_DIM', 'BE06 pricing lexical dimension', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values ($1::uuid, 'BE06_PRICE_LEX_UNIT', 'BE06_PRICE_LEX_DIM', 'BE06 pricing lexical unit', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (
         product_id, catalog_scope, canonical_name, lifecycle_status
       ) values ($1::uuid, 'GLOBAL', 'BE06 pricing lexical product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.purchase (
         purchase_id, household_id, transaction_currency_code, occurred_at
       ) values ($1::uuid, $2::uuid, 'PCL', clock_timestamp() - interval '5 minutes')`,
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

test('persistence boundary rejects noncanonical exact-decimal spelling when use-case validation is bypassed', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const transactions = new PgHouseholdProcurementAdministrationTransactionManager(database);
  const writer = new PgHouseholdPurchaseItemPricingBasisWriter();

  try {
    await assert.rejects(
      transactions.withHouseholdProcurementAdministrationTransaction(
        ADMIN,
        HOUSEHOLD,
        async (transaction) => writer.commitPricingBasis(transaction, {
          commandId: COMMAND,
          purchaseId: PURCHASE,
          purchaseItemId: ITEM,
          pricingBasisQuantityNumerator: '1',
          pricingBasisQuantityDenominator: '1',
          pricingBasisUnitId: UNIT,
          pricingConversionEvidenceId: undefined,
          candidatePurchaseItemMoneyFactId: CANDIDATE,
          basisAmount: '01.00',
          provenance: 'direct persistence lexical probe',
        }),
      ),
      InvalidInputError,
    );
  } finally {
    await database.close();
  }

  const verify = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const item = await verify.query(
      `select pricing_basis_quantity_num, pricing_basis_quantity_den,
              pricing_basis_unit_id, pricing_conversion_evidence_id
         from fridge.purchase_item
        where household_id = $1::uuid and purchase_item_id = $2::uuid`,
      [HOUSEHOLD, ITEM],
    );
    assert.equal(item.rows[0]?.pricing_basis_quantity_num, null);
    assert.equal(item.rows[0]?.pricing_basis_quantity_den, null);
    assert.equal(item.rows[0]?.pricing_basis_unit_id, null);
    assert.equal(item.rows[0]?.pricing_conversion_evidence_id, null);

    const fact = await verify.query(
      `select count(*)::int as count
         from fridge.purchase_item_money_fact
        where household_id = $1::uuid and purchase_item_money_fact_id = $2::uuid`,
      [HOUSEHOLD, CANDIDATE],
    );
    assert.equal(fact.rows[0]?.count, 0);

    const command = await verify.query(
      `select count(*)::int as count
         from fridge.household_procurement_command_registry
        where household_id = $1::uuid and command_id = $2::uuid`,
      [HOUSEHOLD, COMMAND],
    );
    assert.equal(command.rows[0]?.count, 0);
  } finally {
    await verify.end();
  }
});
