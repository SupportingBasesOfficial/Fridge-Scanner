import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CommitPurchaseItemPricingBasisUseCase,
  ConflictError,
  HouseholdId,
  IdempotencyConflictError,
  InvalidInputError,
  MeasurementConversionEvidenceId,
  MeasurementUnitId,
  NotFoundError,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  exactRational,
  type IdentifierGenerator,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdPurchaseItemPricingBasisWriter } from './commit-purchase-item-pricing-basis.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for pricing basis integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for pricing basis integration tests');

const HOUSEHOLD = HouseholdId('c7300001-0b06-4730-8730-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('c7300002-0b06-4730-8730-000000000002');
const ADMIN = PrincipalId('c7300003-0b06-4730-8730-000000000003');
const NO_CAP = PrincipalId('c7300004-0b06-4730-8730-000000000004');
const ADMIN_MEMBERSHIP = 'c7300005-0b06-4730-8730-000000000005';
const NO_CAP_MEMBERSHIP = 'c7300006-0b06-4730-8730-000000000006';
const ADMIN_ROLE = 'BE06_PRICE_ADMIN';
const NO_CAP_ROLE = 'BE06_PRICE_NO_CAP';
const PURCHASE = PurchaseId('c7300010-0b06-4730-8730-000000000010');
const ITEM_SAME = PurchaseItemId('c7300011-0b06-4730-8730-000000000011');
const ITEM_CROSS = PurchaseItemId('c7300012-0b06-4730-8730-000000000012');
const ITEM_REPLAY = PurchaseItemId('c7300013-0b06-4730-8730-000000000013');
const ITEM_CONCURRENT = PurchaseItemId('c7300014-0b06-4730-8730-000000000014');
const ITEM_RETIRED = PurchaseItemId('c7300015-0b06-4730-8730-000000000015');
const PRODUCT = 'c7300016-0b06-4730-8730-000000000016';
const UNIT_A = MeasurementUnitId('c7300017-0b06-4730-8730-000000000017');
const UNIT_B = MeasurementUnitId('c7300018-0b06-4730-8730-000000000018');
const RULE = 'c7300019-0b06-4730-8730-000000000019';
const EVIDENCE = MeasurementConversionEvidenceId('c7300020-0b06-4730-8730-000000000020');
const FOREIGN_EVIDENCE = MeasurementConversionEvidenceId('c7300021-0b06-4730-8730-000000000021');

class QueueGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly values: T[]) {}
  generate(): T {
    const value = this.values.shift();
    if (value === undefined) throw new Error('identifier fixture exhausted');
    return value;
  }
}

function factId(suffix: string): PurchaseItemMoneyFactId {
  return PurchaseItemMoneyFactId(`c7310000-0b06-4731-8731-${suffix.padStart(12, '0')}`);
}
function commandId(suffix: string): CommandId {
  return CommandId(`c7320000-0b06-4732-8732-${suffix.padStart(12, '0')}`);
}
function useCase(database: PgDatabase, ids: PurchaseItemMoneyFactId[]): CommitPurchaseItemPricingBasisUseCase {
  return new CommitPurchaseItemPricingBasisUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdPurchaseItemPricingBasisWriter(),
    new QueueGenerator(ids),
  );
}

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 pricing admin'), ($2::uuid, 'BE06 pricing no cap')`,
      [ADMIN, NO_CAP],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 pricing household'), ($2::uuid, 'BE06 pricing foreign household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 pricing administrator'), ($2, 'BE06 pricing no capability')`,
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
       values ('PBR', 'BE06 pricing basis currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_PRICE_QTY', 'BE06 pricing basis quantity', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values
         ($1::uuid, 'BE06_PRICE_A', 'BE06_PRICE_QTY', 'BE06 pricing unit A', 'ACTIVE'),
         ($2::uuid, 'BE06_PRICE_B', 'BE06_PRICE_QTY', 'BE06 pricing unit B', 'ACTIVE')`,
      [UNIT_A, UNIT_B],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_rule (
         measurement_conversion_rule_id, rule_family_id, version_no, conversion_kind,
         source_unit_id, target_unit_id, factor_num, factor_den,
         effective_from, lifecycle_status, provenance
       ) values (
         $1::uuid, 'c7300030-0b06-4730-8730-000000000030'::uuid, 1, 'EXACT_FACTOR',
         $2::uuid, $3::uuid, 1, 2,
         clock_timestamp() - interval '1 day', 'ACTIVE', 'pricing basis fixture'
       )`,
      [RULE, UNIT_A, UNIT_B],
    );
    await pool.query(
      `insert into fridge.measurement_conversion_evidence (
         measurement_conversion_evidence_id, household_id, measurement_conversion_rule_id,
         source_unit_id, source_quantity_num, source_quantity_den,
         target_unit_id, target_quantity_num, target_quantity_den,
         applied_factor_num, applied_factor_den, evaluation_anchor, provenance
       ) values
         ($1::uuid, $3::uuid, $4::uuid, $5::uuid, 2, 1, $6::uuid, 1, 1, 1, 2, clock_timestamp(), 'same household evidence'),
         ($2::uuid, $7::uuid, $4::uuid, $5::uuid, 2, 1, $6::uuid, 1, 1, 1, 2, clock_timestamp(), 'foreign household evidence')`,
      [EVIDENCE, FOREIGN_EVIDENCE, HOUSEHOLD, RULE, UNIT_A, UNIT_B, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.product (
         product_id, catalog_scope, canonical_name, lifecycle_status
       ) values ($1::uuid, 'GLOBAL', 'BE06 pricing basis product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.purchase (
         purchase_id, household_id, transaction_currency_code, occurred_at
       ) values ($1::uuid, $2::uuid, 'PBR', clock_timestamp() - interval '10 minutes')`,
      [PURCHASE, HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.purchase_item (
         purchase_item_id, household_id, purchase_id, product_id,
         purchased_quantity_num, purchased_quantity_den, purchased_unit_id
       ) values
         ($1::uuid, $6::uuid, $7::uuid, $8::uuid, 2, 1, $9::uuid),
         ($2::uuid, $6::uuid, $7::uuid, $8::uuid, 2, 1, $9::uuid),
         ($3::uuid, $6::uuid, $7::uuid, $8::uuid, 2, 1, $9::uuid),
         ($4::uuid, $6::uuid, $7::uuid, $8::uuid, 2, 1, $9::uuid),
         ($5::uuid, $6::uuid, $7::uuid, $8::uuid, 2, 1, $9::uuid)`,
      [ITEM_SAME, ITEM_CROSS, ITEM_REPLAY, ITEM_CONCURRENT, ITEM_RETIRED, HOUSEHOLD, PURCHASE, PRODUCT, UNIT_A],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('commits same-unit pricing basis and source PRICING_BASIS fact without conversion evidence', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const fact = factId('1');
  try {
    const result = await useCase(database, [fact]).execute({
      commandId: commandId('1'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_SAME,
      pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_A,
      basisAmount: '4.5000', provenance: ' invoice unit price ',
    });
    assert.equal(result.purchaseItemMoneyFactId, fact);

    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const stored = await pool.query(
        `select pi.pricing_basis_quantity_num::text as num,
                pi.pricing_basis_quantity_den::text as den,
                pi.pricing_basis_unit_id::text as unit_id,
                pi.pricing_conversion_evidence_id::text as evidence_id,
                mf.semantic_role, mf.amount::text, mf.currency_code,
                mf.is_source_fact, mf.money_rounding_policy_id, mf.provenance
           from fridge.purchase_item pi
           join fridge.purchase_item_money_fact mf
             on mf.household_id = pi.household_id
            and mf.purchase_item_id = pi.purchase_item_id
          where pi.household_id = $1::uuid and pi.purchase_item_id = $2::uuid
            and mf.purchase_item_money_fact_id = $3::uuid`,
        [HOUSEHOLD, ITEM_SAME, fact],
      );
      assert.deepEqual(stored.rows[0], {
        num: '1', den: '1', unit_id: UNIT_A, evidence_id: null,
        semantic_role: 'PRICING_BASIS', amount: '4.5', currency_code: 'PBR',
        is_source_fact: true, money_rounding_policy_id: null, provenance: 'invoice unit price',
      });
    } finally { await pool.end(); }
  } finally { await database.close(); }
});

test('commits cross-unit pricing basis only with exact same-Household conversion evidence', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const fact = factId('2');
  try {
    const result = await useCase(database, [fact]).execute({
      commandId: commandId('2'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_CROSS,
      pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_B,
      pricingConversionEvidenceId: EVIDENCE,
      basisAmount: '8.25', provenance: 'package basis',
    });
    assert.equal(result.purchaseItemMoneyFactId, fact);
  } finally { await database.close(); }
});

test('cross-unit pricing basis rejects missing evidence and hides foreign evidence', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, [factId('3')]).execute({
        commandId: commandId('3'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_REPLAY,
        pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_B,
        basisAmount: '8.25', provenance: 'missing evidence',
      }),
      InvalidInputError,
    );
    await assert.rejects(
      useCase(database, [factId('4')]).execute({
        commandId: commandId('4'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_REPLAY,
        pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_B,
        pricingConversionEvidenceId: FOREIGN_EVIDENCE,
        basisAmount: '8.25', provenance: 'foreign evidence',
      }),
      NotFoundError,
    );
  } finally { await database.close(); }
});

test('committed replay returns original fact id and a second CommandId cannot redefine pricing basis', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const command = commandId('5');
  const firstFact = factId('5');
  try {
    const first = await useCase(database, [firstFact]).execute({
      commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_REPLAY,
      pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_A,
      basisAmount: '3.00', provenance: 'replay basis',
    });
    const replay = await useCase(database, [factId('6')]).execute({
      commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_REPLAY,
      pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_A,
      basisAmount: '3', provenance: 'replay basis',
    });
    assert.equal(first.purchaseItemMoneyFactId, firstFact);
    assert.equal(replay.purchaseItemMoneyFactId, firstFact);

    await assert.rejects(
      useCase(database, [factId('7')]).execute({
        commandId: commandId('6'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_REPLAY,
        pricingBasisQuantity: exactRational(2n, 1n), pricingBasisUnitId: UNIT_A,
        basisAmount: '5', provenance: 'different basis',
      }),
      ConflictError,
    );
  } finally { await database.close(); }
});

test('same CommandId concurrent first use converges on one physical pricing basis fact', async () => {
  const databaseA = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const databaseB = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const command = commandId('7');
  const factA = factId('8');
  const factB = factId('9');
  const input = {
    commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
    purchaseId: PURCHASE, purchaseItemId: ITEM_CONCURRENT,
    pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_A,
    basisAmount: '2.5', provenance: 'concurrent basis',
  };
  try {
    const [left, right] = await Promise.all([
      useCase(databaseA, [factA]).execute(input),
      useCase(databaseB, [factB]).execute(input),
    ]);
    assert.equal(left.purchaseItemMoneyFactId, right.purchaseItemMoneyFactId);
    assert.ok(left.purchaseItemMoneyFactId === factA || left.purchaseItemMoneyFactId === factB);

    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const count = await pool.query(
        `select count(*)::int as count from fridge.purchase_item_money_fact
          where household_id = $1::uuid and purchase_item_id = $2::uuid
            and semantic_role = 'PRICING_BASIS' and is_source_fact`,
        [HOUSEHOLD, ITEM_CONCURRENT],
      );
      assert.equal(count.rows[0]?.count, 1);
    } finally { await pool.end(); }
  } finally {
    await databaseA.close();
    await databaseB.close();
  }
});

test('cross-intent CommandId reuse conflicts and missing procurement capability is unauthorized', async () => {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const crossIntent = commandId('8');
  try {
    await pool.query(
      `insert into fridge.household_procurement_command_registry (household_id, command_id, intent_code)
       values ($1::uuid, $2::uuid, 'CREATE_PURCHASE')`,
      [HOUSEHOLD, crossIntent],
    );
  } finally { await pool.end(); }

  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database, [factId('10')]).execute({
        commandId: crossIntent, actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_RETIRED,
        pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_A,
        basisAmount: '1', provenance: 'cross intent',
      }),
      IdempotencyConflictError,
    );
    await assert.rejects(
      useCase(database, [factId('11')]).execute({
        commandId: commandId('9'), actorPrincipalId: NO_CAP, householdId: HOUSEHOLD,
        purchaseId: PURCHASE, purchaseItemId: ITEM_RETIRED,
        pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_A,
        basisAmount: '1', provenance: 'no capability',
      }),
      HouseholdAuthorizationError,
    );
  } finally { await database.close(); }
});

test('late pricing evidence remains committable after the historical purchased unit is retired', async () => {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `update fridge.measurement_unit set lifecycle_status = 'RETIRED'
        where measurement_unit_id = $1::uuid`,
      [UNIT_A],
    );
  } finally { await pool.end(); }

  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const fact = factId('12');
    const result = await useCase(database, [fact]).execute({
      commandId: commandId('10'), actorPrincipalId: ADMIN, householdId: HOUSEHOLD,
      purchaseId: PURCHASE, purchaseItemId: ITEM_RETIRED,
      pricingBasisQuantity: exactRational(1n, 1n), pricingBasisUnitId: UNIT_A,
      basisAmount: '1.75', provenance: 'late invoice after unit retirement',
    });
    assert.equal(result.purchaseItemMoneyFactId, fact);
  } finally { await database.close(); }
});
