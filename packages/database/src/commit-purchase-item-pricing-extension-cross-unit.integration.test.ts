import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CommitPurchaseItemPricingExtensionUseCase,
  HouseholdId,
  MoneyRoundingPolicyId,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  PurchaseItemPricingDiscrepancyId,
  type IdentifierGenerator,
} from '@fridge/application';
import { PgHouseholdPurchaseItemPricingExtensionWriter } from './commit-purchase-item-pricing-extension.js';
import { PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for cross-unit pricing extension test');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for cross-unit pricing extension test');

const HOUSEHOLD = HouseholdId('c7800001-0b06-4780-8780-000000000001');
const ADMIN = PrincipalId('c7800002-0b06-4780-8780-000000000002');
const MEMBERSHIP = 'c7800003-0b06-4780-8780-000000000003';
const ROLE = 'BE06_CROSS_UNIT_ADMIN';
const PURCHASE = PurchaseId('c7800004-0b06-4780-8780-000000000004');
const ITEM = PurchaseItemId('c7800005-0b06-4780-8780-000000000005');
const POLICY = MoneyRoundingPolicyId('c7800006-0b06-4780-8780-000000000006');
const RESULT_FACT = PurchaseItemMoneyFactId('c7800007-0b06-4780-8780-000000000007');
const RESULT_DISCREPANCY = PurchaseItemPricingDiscrepancyId('c7800008-0b06-4780-8780-000000000008');
const COMMAND = CommandId('c7800009-0b06-4780-8780-000000000009');
const PRODUCT = 'c7800010-0b06-4780-8780-000000000010';
const KG = 'c7800011-0b06-4780-8780-000000000011';
const G = 'c7800012-0b06-4780-8780-000000000012';
const RULE = 'c7800013-0b06-4780-8780-000000000013';
const EVIDENCE = 'c7800014-0b06-4780-8780-000000000014';

class FixedGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly value: T) {}
  generate(): T { return this.value; }
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 cross-unit admin')`, [ADMIN],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 cross-unit household')`, [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 cross-unit administrator')`, [ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`, [ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE',
                 clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN, ROLE],
    );
    await pool.query(
      `insert into fridge.currency (currency_code, display_name, lifecycle_status)
       values ('CUX', 'BE06 cross-unit currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_CROSS_MASS', 'BE06 cross-unit mass', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values
         ($1::uuid, 'BE06_CROSS_KG', 'BE06_CROSS_MASS', 'kilogram', 'ACTIVE'),
         ($2::uuid, 'BE06_CROSS_G', 'BE06_CROSS_MASS', 'gram', 'ACTIVE')`, [KG, G],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_rule (
         measurement_conversion_rule_id, rule_family_id, version_no, conversion_kind,
         source_unit_id, target_unit_id, factor_num, factor_den,
         effective_from, lifecycle_status, provenance
       ) values (
         $1::uuid, 'c7800015-0b06-4780-8780-000000000015'::uuid, 1, 'EXACT_FACTOR',
         $2::uuid, $3::uuid, 1000, 1,
         '2026-09-01T00:00:00Z', 'ACTIVE', '1 kg = 1000 g'
       )`, [RULE, KG, G],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_evidence (
         measurement_conversion_evidence_id, household_id, measurement_conversion_rule_id,
         source_unit_id, source_quantity_num, source_quantity_den,
         target_unit_id, target_quantity_num, target_quantity_den,
         applied_factor_num, applied_factor_den, evaluation_anchor, provenance
       ) values (
         $1::uuid, $2::uuid, $3::uuid,
         $4::uuid, 1, 1,
         $5::uuid, 1000, 1,
         1000, 1, '2026-09-09T12:00:00Z', 'exact purchased quantity conversion'
       )`, [EVIDENCE, HOUSEHOLD, RULE, KG, G],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', 'BE06 cross-unit product', 'ACTIVE')`, [PRODUCT],
    );
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at)
       values ($1::uuid, $2::uuid, 'CUX', '2026-09-09T12:10:00Z')`, [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.money_rounding_policy (
         money_rounding_policy_id, policy_family_id, version_no, currency_code,
         decimal_scale, rounding_algorithm_code, rounding_algorithm_version,
         effective_from, lifecycle_status, provenance
       ) values (
         $1::uuid, 'c7800016-0b06-4780-8780-000000000016'::uuid, 1, 'CUX', 2,
         'DECIMAL_HALF_AWAY_FROM_ZERO', '1', '2026-09-01T00:00:00Z', 'ACTIVE',
         'cross-unit pricing policy'
       )`, [POLICY],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id,
         pricing_basis_quantity_num, pricing_basis_quantity_den,
         pricing_basis_unit_id, pricing_conversion_evidence_id
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid,
         1, 1, $5::uuid,
         100, 1, $6::uuid, $7::uuid
       )`, [ITEM, HOUSEHOLD, PURCHASE, PRODUCT, KG, G, EVIDENCE],
    );
    await pool.query(
      `insert into fridge.purchase_item_money_fact (
         purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
         semantic_role, amount, currency_code, is_source_fact,
         money_rounding_policy_id, provenance
       ) values (
         'c7800017-0b06-4780-8780-000000000017'::uuid,
         $1::uuid, $2::uuid, $3::uuid,
         'PRICING_BASIS', 2.00, 'CUX', true, null, 'R$2-equivalent per 100 g'
       )`, [HOUSEHOLD, PURCHASE, ITEM],
    );
  } finally {
    await pool.end();
  }
}

await seed();

test('extends 1 kg converted to 1000 g against a distinct 100 g pricing basis', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const useCase = new CommitPurchaseItemPricingExtensionUseCase(
      new PgHouseholdProcurementAdministrationTransactionManager(database),
      new PgHouseholdPurchaseItemPricingExtensionWriter(),
      new FixedGenerator(RESULT_FACT),
      new FixedGenerator(RESULT_DISCREPANCY),
    );

    const result = await useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      purchaseId: PURCHASE,
      purchaseItemId: ITEM,
      moneyRoundingPolicyId: POLICY,
      provenance: 'cross-unit exact extension',
    });

    assert.equal(result.purchaseItemMoneyFactId, RESULT_FACT);
    assert.equal(result.pricingDiscrepancyId, null);

    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const row = await pool.query<{ amount: string; evidence_id: string }>(
        `select mf.amount::text as amount,
                pi.pricing_conversion_evidence_id::text as evidence_id
           from fridge.purchase_item_money_fact mf
           join fridge.purchase_item pi
             on pi.household_id = mf.household_id
            and pi.purchase_item_id = mf.purchase_item_id
          where mf.purchase_item_money_fact_id = $1::uuid`, [RESULT_FACT],
      );
      assert.deepEqual(row.rows[0], { amount: '20.00', evidence_id: EVIDENCE });
    } finally {
      await pool.end();
    }
  } finally {
    await database.close();
  }
});
