import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CommitPurchaseItemPricingExtensionUseCase,
  ConflictError,
  HouseholdId,
  InvalidInputError,
  MoneyRoundingPolicyId,
  NotFoundError,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  PurchaseItemPricingDiscrepancyId,
  type IdentifierGenerator,
} from '@fridge/application';
import { PgHouseholdPurchaseItemPricingExtensionWriter } from './commit-purchase-item-pricing-extension.js';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for pricing extension integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for pricing extension integration tests');

const HOUSEHOLD = HouseholdId('c7600001-0b06-4760-8760-000000000001');
const ADMIN = PrincipalId('c7600002-0b06-4760-8760-000000000002');
const NO_CAP = PrincipalId('c7600003-0b06-4760-8760-000000000003');
const ADMIN_MEMBERSHIP = 'c7600004-0b06-4760-8760-000000000004';
const NO_CAP_MEMBERSHIP = 'c7600005-0b06-4760-8760-000000000005';
const ADMIN_ROLE = 'BE06_EXTENSION_ADMIN';
const NO_CAP_ROLE = 'BE06_EXTENSION_NO_CAP';
const PURCHASE = PurchaseId('c7600010-0b06-4760-8760-000000000010');
const ITEM_ROUND = PurchaseItemId('c7600011-0b06-4760-8760-000000000011');
const ITEM_MATCH = PurchaseItemId('c7600012-0b06-4760-8760-000000000012');
const ITEM_MISMATCH = PurchaseItemId('c7600013-0b06-4760-8760-000000000013');
const ITEM_REPLAY = PurchaseItemId('c7600014-0b06-4760-8760-000000000014');
const ITEM_NO_BASIS = PurchaseItemId('c7600015-0b06-4760-8760-000000000015');
const ITEM_POLICY = PurchaseItemId('c7600016-0b06-4760-8760-000000000016');
const PRODUCT = 'c7600017-0b06-4760-8760-000000000017';
const UNIT = 'c7600018-0b06-4760-8760-000000000018';
const POLICY = MoneyRoundingPolicyId('c7600020-0b06-4760-8760-000000000020');
const UNSUPPORTED_POLICY = MoneyRoundingPolicyId('c7600021-0b06-4760-8760-000000000021');
const FUTURE_POLICY = MoneyRoundingPolicyId('c7600022-0b06-4760-8760-000000000022');
const FOREIGN_CURRENCY_POLICY = MoneyRoundingPolicyId('c7600023-0b06-4760-8760-000000000023');

class QueueGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly values: T[]) {}
  generate(): T {
    const value = this.values.shift();
    if (value === undefined) throw new Error('identifier fixture exhausted');
    return value;
  }
}

function commandId(suffix: string): CommandId {
  return CommandId(`c7610000-0b06-4761-8761-${suffix.padStart(12, '0')}`);
}
function factId(suffix: string): PurchaseItemMoneyFactId {
  return PurchaseItemMoneyFactId(`c7620000-0b06-4762-8762-${suffix.padStart(12, '0')}`);
}
function discrepancyId(suffix: string): PurchaseItemPricingDiscrepancyId {
  return PurchaseItemPricingDiscrepancyId(`c7630000-0b06-4763-8763-${suffix.padStart(12, '0')}`);
}
function useCase(
  database: PgDatabase,
  facts: PurchaseItemMoneyFactId[],
  discrepancies: PurchaseItemPricingDiscrepancyId[],
): CommitPurchaseItemPricingExtensionUseCase {
  return new CommitPurchaseItemPricingExtensionUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdPurchaseItemPricingExtensionWriter(),
    new QueueGenerator(facts),
    new QueueGenerator(discrepancies),
  );
}

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 extension admin'), ($2::uuid, 'BE06 extension no cap')`,
      [ADMIN, NO_CAP],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 pricing extension household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 pricing extension administrator'), ($2, 'BE06 pricing extension no capability')`,
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
       values ('PEX', 'BE06 pricing extension currency', 'ACTIVE'),
              ('QEX', 'BE06 foreign pricing currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_EXTENSION_QTY', 'BE06 extension quantity', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values ($1::uuid, 'BE06_EXTENSION_UNIT', 'BE06_EXTENSION_QTY', 'BE06 extension unit', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', 'BE06 pricing extension product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.purchase (purchase_id, household_id, transaction_currency_code, occurred_at)
       values ($1::uuid, $2::uuid, 'PEX', '2026-09-09T12:00:00Z')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.money_rounding_policy (
         money_rounding_policy_id, policy_family_id, version_no, currency_code,
         decimal_scale, rounding_algorithm_code, rounding_algorithm_version,
         effective_from, effective_to, lifecycle_status, provenance
       ) values
         ($1::uuid, 'c7600030-0b06-4760-8760-000000000030'::uuid, 1, 'PEX', 2,
          'DECIMAL_HALF_AWAY_FROM_ZERO', '1', '2026-09-01T00:00:00Z', null, 'RETIRED', 'historically valid supported policy'),
         ($2::uuid, 'c7600031-0b06-4760-8760-000000000031'::uuid, 1, 'PEX', 2,
          'SOME_FUTURE_ALGORITHM', '9', '2026-09-01T00:00:00Z', null, 'ACTIVE', 'unsupported executable contract'),
         ($3::uuid, 'c7600032-0b06-4760-8760-000000000032'::uuid, 1, 'PEX', 2,
          'DECIMAL_HALF_AWAY_FROM_ZERO', '1', '2026-09-10T00:00:00Z', null, 'ACTIVE', 'future policy'),
         ($4::uuid, 'c7600033-0b06-4760-8760-000000000033'::uuid, 1, 'QEX', 2,
          'DECIMAL_HALF_AWAY_FROM_ZERO', '1', '2026-09-01T00:00:00Z', null, 'ACTIVE', 'wrong currency policy')`,
      [POLICY, UNSUPPORTED_POLICY, FUTURE_POLICY, FOREIGN_CURRENCY_POLICY],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id,
         pricing_basis_quantity_num, pricing_basis_quantity_den, pricing_basis_unit_id
       ) values
         ($1::uuid, $7::uuid, $8::uuid, $9::uuid, 1, 1, $10::uuid, 6, 1, $10::uuid),
         ($2::uuid, $7::uuid, $8::uuid, $9::uuid, 1, 1, $10::uuid, 1, 1, $10::uuid),
         ($3::uuid, $7::uuid, $8::uuid, $9::uuid, 1, 1, $10::uuid, 1, 1, $10::uuid),
         ($4::uuid, $7::uuid, $8::uuid, $9::uuid, 2, 1, $10::uuid, 1, 1, $10::uuid),
         ($5::uuid, $7::uuid, $8::uuid, $9::uuid, 1, 1, $10::uuid, null, null, null),
         ($6::uuid, $7::uuid, $8::uuid, $9::uuid, 1, 1, $10::uuid, 1, 1, $10::uuid)`,
      [ITEM_ROUND, ITEM_MATCH, ITEM_MISMATCH, ITEM_REPLAY, ITEM_NO_BASIS, ITEM_POLICY, HOUSEHOLD, PURCHASE, PRODUCT, UNIT],
    );
    await pool.query(
      `insert into fridge.purchase_item_money_fact (
         purchase_item_money_fact_id, household_id, purchase_id, purchase_item_id,
         semantic_role, amount, currency_code, is_source_fact, money_rounding_policy_id, provenance
       ) values
         ('c7600101-0b06-4760-8760-000000000101', $1::uuid, $2::uuid, $3::uuid, 'PRICING_BASIS', 1, 'PEX', true, null, 'round basis'),
         ('c7600102-0b06-4760-8760-000000000102', $1::uuid, $2::uuid, $4::uuid, 'PRICING_BASIS', 1.23, 'PEX', true, null, 'matching basis'),
         ('c7600103-0b06-4760-8760-000000000103', $1::uuid, $2::uuid, $4::uuid, 'LINE_GROSS', 1.23, 'PEX', true, null, 'matching source gross'),
         ('c7600104-0b06-4760-8760-000000000104', $1::uuid, $2::uuid, $5::uuid, 'PRICING_BASIS', 1.23, 'PEX', true, null, 'mismatch basis'),
         ('c7600105-0b06-4760-8760-000000000105', $1::uuid, $2::uuid, $5::uuid, 'LINE_GROSS', 1.24, 'PEX', true, null, 'mismatch source gross'),
         ('c7600106-0b06-4760-8760-000000000106', $1::uuid, $2::uuid, $6::uuid, 'PRICING_BASIS', 2, 'PEX', true, null, 'replay basis'),
         ('c7600107-0b06-4760-8760-000000000107', $1::uuid, $2::uuid, $7::uuid, 'PRICING_BASIS', 5, 'PEX', true, null, 'policy basis')`,
      [HOUSEHOLD, PURCHASE, ITEM_ROUND, ITEM_MATCH, ITEM_MISMATCH, ITEM_REPLAY, ITEM_POLICY],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('extends exact rational price and rounds once with the explicit historical policy', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const fact = factId('1');
  try {
    const result = await useCase(database, [fact], [discrepancyId('1')]).execute({
      commandId: commandId('1'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_ROUND,
      moneyRoundingPolicyId: POLICY, provenance: ' exact extension ',
    });
    assert.equal(result.purchaseItemMoneyFactId, fact);
    assert.equal(result.pricingDiscrepancyId, null);

    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const stored = await pool.query(
        `select amount::text, semantic_role, is_source_fact,
                money_rounding_policy_id::text, currency_code, provenance
           from fridge.purchase_item_money_fact
          where purchase_item_money_fact_id = $1::uuid`, [fact],
      );
      assert.deepEqual(stored.rows[0], {
        amount: '0.17', semantic_role: 'LINE_GROSS', is_source_fact: false,
        money_rounding_policy_id: POLICY, currency_code: 'PEX', provenance: 'exact extension',
      });
    } finally { await pool.end(); }
  } finally { await database.close(); }
});

test('preserves source and computed gross and creates discrepancy only when they differ', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const matchFact = factId('2');
  const mismatchFact = factId('3');
  const mismatchDiscrepancy = discrepancyId('3');
  try {
    const match = await useCase(database, [matchFact], [discrepancyId('2')]).execute({
      commandId: commandId('2'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_MATCH,
      moneyRoundingPolicyId: POLICY, provenance: 'matching extension',
    });
    assert.equal(match.pricingDiscrepancyId, null);

    const mismatch = await useCase(database, [mismatchFact], [mismatchDiscrepancy]).execute({
      commandId: commandId('3'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_MISMATCH,
      moneyRoundingPolicyId: POLICY, provenance: 'mismatch extension',
    });
    assert.equal(mismatch.pricingDiscrepancyId, mismatchDiscrepancy);

    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const evidence = await pool.query(
        `select source_amount::text, computed_amount::text, currency_code,
                money_rounding_policy_id::text, reason, resolution_status,
                quantity_conversion_evidence_id::text
           from fridge.purchase_item_pricing_discrepancy
          where purchase_item_pricing_discrepancy_id = $1::uuid`, [mismatchDiscrepancy],
      );
      assert.deepEqual(evidence.rows[0], {
        source_amount: '1.24', computed_amount: '1.23', currency_code: 'PEX',
        money_rounding_policy_id: POLICY, reason: 'SOURCE_LINE_GROSS_MISMATCH',
        resolution_status: 'OPEN', quantity_conversion_evidence_id: null,
      });
      const grossCount = await pool.query(
        `select count(*)::int as count
           from fridge.purchase_item_money_fact
          where purchase_item_id = $1::uuid and semantic_role = 'LINE_GROSS'`, [ITEM_MISMATCH],
      );
      assert.equal(grossCount.rows[0]?.count, 2);
    } finally { await pool.end(); }
  } finally { await database.close(); }
});

test('replay returns original result identities and a second command cannot recompute the line', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const command = commandId('4');
  const firstFact = factId('4');
  try {
    const first = await useCase(database, [firstFact], [discrepancyId('4')]).execute({
      commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_REPLAY,
      moneyRoundingPolicyId: POLICY, provenance: 'replay extension',
    });
    const replay = await useCase(database, [factId('5')], [discrepancyId('5')]).execute({
      commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_REPLAY,
      moneyRoundingPolicyId: POLICY, provenance: 'replay extension',
    });
    assert.equal(first.purchaseItemMoneyFactId, firstFact);
    assert.equal(replay.purchaseItemMoneyFactId, firstFact);
    assert.equal(replay.pricingDiscrepancyId, first.pricingDiscrepancyId);

    await assert.rejects(
      useCase(database, [factId('6')], [discrepancyId('6')]).execute({
        commandId: commandId('5'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_REPLAY,
        moneyRoundingPolicyId: POLICY, provenance: 'second extension',
      }), ConflictError,
    );
  } finally { await database.close(); }
});

test('rejects missing pricing basis, unsupported algorithm/version and historically ineligible policies', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, [factId('7')], [discrepancyId('7')]).execute({
        commandId: commandId('6'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_NO_BASIS,
        moneyRoundingPolicyId: POLICY, provenance: 'missing basis',
      }), ConflictError,
    );
    await assert.rejects(
      useCase(database, [factId('8')], [discrepancyId('8')]).execute({
        commandId: commandId('7'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_POLICY,
        moneyRoundingPolicyId: UNSUPPORTED_POLICY, provenance: 'unsupported policy',
      }), InvalidInputError,
    );
    await assert.rejects(
      useCase(database, [factId('9')], [discrepancyId('9')]).execute({
        commandId: commandId('8'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_POLICY,
        moneyRoundingPolicyId: FUTURE_POLICY, provenance: 'future policy',
      }), NotFoundError,
    );
    await assert.rejects(
      useCase(database, [factId('10')], [discrepancyId('10')]).execute({
        commandId: commandId('9'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_POLICY,
        moneyRoundingPolicyId: FOREIGN_CURRENCY_POLICY, provenance: 'wrong currency policy',
      }), NotFoundError,
    );
  } finally { await database.close(); }
});

test('missing procurement capability is unauthorized', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, [factId('11')], [discrepancyId('11')]).execute({
        commandId: commandId('10'), actorPrincipalId: NO_CAP, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_POLICY,
        moneyRoundingPolicyId: POLICY, provenance: 'unauthorized extension',
      }), HouseholdAuthorizationError,
    );
  } finally { await database.close(); }
});
