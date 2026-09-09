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
  PurchaseId,
  PurchaseItemId,
  CreatePurchaseUseCase,
  exactRational,
  type IdentifierGenerator,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdProcurementAdministrationTransactionManager } from './procurement-administration.js';
import { PgHouseholdPurchaseWriter } from './create-purchase.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for CreatePurchase integration tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for CreatePurchase integration tests');

const HOUSEHOLD = HouseholdId('d6100001-0b06-4610-8610-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('d6100002-0b06-4610-8610-000000000002');
const ADMIN = PrincipalId('d6100003-0b06-4610-8610-000000000003');
const NO_CAP = PrincipalId('d6100004-0b06-4610-8610-000000000004');
const ADMIN_MEMBERSHIP = 'd6100005-0b06-4610-8610-000000000005';
const NO_CAP_MEMBERSHIP = 'd6100006-0b06-4610-8610-000000000006';
const ADMIN_ROLE = 'BE06_PURCHASE_ADMIN';
const NO_CAP_ROLE = 'BE06_PURCHASE_NO_CAP';

const UNIT = MeasurementUnitId('d6110001-0b06-4611-8611-000000000001');
const RETIRED_UNIT = MeasurementUnitId('d6110002-0b06-4611-8611-000000000002');
const GLOBAL_PRODUCT = ProductId('d6120001-0b06-4612-8612-000000000001');
const PRIVATE_PRODUCT = ProductId('d6120002-0b06-4612-8612-000000000002');
const FOREIGN_PRODUCT = ProductId('d6120003-0b06-4612-8612-000000000003');
const RETIRED_PRODUCT = ProductId('d6120004-0b06-4612-8612-000000000004');

class QueueGenerator<T> implements IdentifierGenerator<T> {
  constructor(private readonly values: T[]) {}
  generate(): T {
    const value = this.values.shift();
    if (value === undefined) throw new Error('identifier fixture exhausted');
    return value;
  }
}

function purchaseUseCase(
  database: PgDatabase,
  purchaseIds: PurchaseId[],
  purchaseItemIds: PurchaseItemId[],
): CreatePurchaseUseCase {
  return new CreatePurchaseUseCase(
    new PgHouseholdProcurementAdministrationTransactionManager(database),
    new PgHouseholdPurchaseWriter(),
    new QueueGenerator(purchaseIds),
    new QueueGenerator(purchaseItemIds),
  );
}

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 Purchase Admin'), ($2::uuid, 'BE06 Purchase No Cap')`,
      [ADMIN, NO_CAP],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 Purchase Household'), ($2::uuid, 'BE06 Foreign Household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 purchase administrator'), ($2, 'BE06 purchase no capability')`,
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
       values ('BE06_COUNT', 'BE06 Count', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, symbol, display_name, lifecycle_status
       ) values
         ($1::uuid, 'BE06_EACH', 'BE06_COUNT', 'ea', 'BE06 each', 'ACTIVE'),
         ($2::uuid, 'BE06_OLD_EACH', 'BE06_COUNT', null, 'BE06 retired each', 'RETIRED')`,
      [UNIT, RETIRED_UNIT],
    );
    await pool.query(
      `insert into fridge.currency (currency_code, display_name, lifecycle_status)
       values ('BRL', 'Brazilian Real', 'ACTIVE'), ('ZZZ', 'Retired fixture currency', 'RETIRED')`,
    );
    await pool.query(
      `insert into fridge.product (
         product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status
       ) values
         ($1::uuid, 'GLOBAL', null, 'BE06 global Product', 'ACTIVE'),
         ($2::uuid, 'HOUSEHOLD', $5::uuid, 'BE06 private Product', 'ACTIVE'),
         ($3::uuid, 'HOUSEHOLD', $6::uuid, 'BE06 foreign Product', 'ACTIVE'),
         ($4::uuid, 'HOUSEHOLD', $5::uuid, 'BE06 retired Product', 'RETIRED')`,
      [GLOBAL_PRODUCT, PRIVATE_PRODUCT, FOREIGN_PRODUCT, RETIRED_PRODUCT, HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('CreatePurchase atomically creates Purchase and ordered exact PurchaseItems over GLOBAL + same-Household Products', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const purchaseId = PurchaseId('d6130001-0b06-4613-8613-000000000001');
  const item1 = PurchaseItemId('d6130002-0b06-4613-8613-000000000002');
  const item2 = PurchaseItemId('d6130003-0b06-4613-8613-000000000003');
  const commandId = CommandId('d6130004-0b06-4613-8613-000000000004');

  try {
    const output = await purchaseUseCase(database, [purchaseId], [item1, item2]).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      transactionCurrencyCode: 'BRL',
      items: [
        { productId: GLOBAL_PRODUCT, quantity: exactRational(3n, 2n), measurementUnitId: UNIT },
        { productId: PRIVATE_PRODUCT, quantity: exactRational(2n, 1n), measurementUnitId: UNIT },
      ],
    });

    assert.equal(output.purchaseId, purchaseId);
    assert.deepEqual(output.purchaseItemIds, [item1, item2]);

    const purchase = await admin.query<{
      household_id: string;
      transaction_currency_code: string;
      source_identity: string | null;
      merchant_provenance: string | null;
      source_provenance: string | null;
      same_time: boolean;
    }>(
      `select household_id::text,
              transaction_currency_code,
              source_identity,
              merchant_provenance,
              source_provenance,
              occurred_at = recorded_at as same_time
         from fridge.purchase
        where purchase_id = $1::uuid`,
      [purchaseId],
    );
    assert.deepEqual(purchase.rows, [{
      household_id: HOUSEHOLD,
      transaction_currency_code: 'BRL',
      source_identity: null,
      merchant_provenance: null,
      source_provenance: null,
      same_time: true,
    }]);

    const items = await admin.query<{
      purchase_item_id: string;
      product_id: string;
      purchased_quantity_num: string;
      purchased_quantity_den: string;
      purchased_unit_id: string;
      pricing_basis_quantity_num: string | null;
      pricing_basis_unit_id: string | null;
      pricing_conversion_evidence_id: string | null;
    }>(
      `select purchase_item_id::text,
              product_id::text,
              purchased_quantity_num::text,
              purchased_quantity_den::text,
              purchased_unit_id::text,
              pricing_basis_quantity_num::text,
              pricing_basis_unit_id::text,
              pricing_conversion_evidence_id::text
         from fridge.purchase_item
        where purchase_id = $1::uuid
        order by purchase_item_id`,
      [purchaseId],
    );
    assert.equal(items.rows.length, 2);
    const byId = new Map(items.rows.map((row) => [row.purchase_item_id, row]));
    assert.deepEqual(byId.get(item1), {
      purchase_item_id: item1,
      product_id: GLOBAL_PRODUCT,
      purchased_quantity_num: '3',
      purchased_quantity_den: '2',
      purchased_unit_id: UNIT,
      pricing_basis_quantity_num: null,
      pricing_basis_unit_id: null,
      pricing_conversion_evidence_id: null,
    });
    assert.deepEqual(byId.get(item2), {
      purchase_item_id: item2,
      product_id: PRIVATE_PRODUCT,
      purchased_quantity_num: '2',
      purchased_quantity_den: '1',
      purchased_unit_id: UNIT,
      pricing_basis_quantity_num: null,
      pricing_basis_unit_id: null,
      pricing_conversion_evidence_id: null,
    });

    const moneyCount = await admin.query<{ count: string }>(
      `select count(*)::text as count
         from fridge.purchase_money_fact
        where purchase_id = $1::uuid`,
      [purchaseId],
    );
    assert.equal(moneyCount.rows[0]?.count, '0');
  } finally {
    await database.close();
    await admin.end();
  }
});

test('CreatePurchase committed replay returns original identities and ordered payload divergence conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('d6140001-0b06-4614-8614-000000000001');
  const originalPurchase = PurchaseId('d6140002-0b06-4614-8614-000000000002');
  const originalItem1 = PurchaseItemId('d6140003-0b06-4614-8614-000000000003');
  const originalItem2 = PurchaseItemId('d6140004-0b06-4614-8614-000000000004');

  const semanticItems = [
    { productId: GLOBAL_PRODUCT, quantity: exactRational(1n, 1n), measurementUnitId: UNIT },
    { productId: PRIVATE_PRODUCT, quantity: exactRational(5n, 2n), measurementUnitId: UNIT },
  ] as const;

  try {
    const first = await purchaseUseCase(
      database,
      [originalPurchase],
      [originalItem1, originalItem2],
    ).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      transactionCurrencyCode: 'BRL',
      items: semanticItems,
    });

    const replay = await purchaseUseCase(
      database,
      [PurchaseId('d6140005-0b06-4614-8614-000000000005')],
      [
        PurchaseItemId('d6140006-0b06-4614-8614-000000000006'),
        PurchaseItemId('d6140007-0b06-4614-8614-000000000007'),
      ],
    ).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      transactionCurrencyCode: 'BRL',
      items: semanticItems,
    });

    assert.deepEqual(replay, first);
    assert.equal(replay.purchaseId, originalPurchase);
    assert.deepEqual(replay.purchaseItemIds, [originalItem1, originalItem2]);

    await assert.rejects(
      purchaseUseCase(
        database,
        [PurchaseId('d6140008-0b06-4614-8614-000000000008')],
        [
          PurchaseItemId('d6140009-0b06-4614-8614-000000000009'),
          PurchaseItemId('d6140010-0b06-4614-8614-000000000010'),
        ],
      ).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        transactionCurrencyCode: 'BRL',
        items: [semanticItems[1], semanticItems[0]],
      }),
      IdempotencyConflictError,
    );

    const count = await admin.query<{ count: string }>(
      `select count(*)::text as count from fridge.purchase where purchase_id = $1::uuid`,
      [originalPurchase],
    );
    assert.equal(count.rows[0]?.count, '1');
  } finally {
    await database.close();
    await admin.end();
  }
});

test('CreatePurchase collapses foreign/retired Product and retired Unit/Currency references to NotFound without persistence', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const cases = [
    {
      commandId: CommandId('d6150001-0b06-4615-8615-000000000001'),
      purchaseId: PurchaseId('d6150002-0b06-4615-8615-000000000002'),
      itemId: PurchaseItemId('d6150003-0b06-4615-8615-000000000003'),
      currency: 'BRL',
      productId: FOREIGN_PRODUCT,
      unitId: UNIT,
    },
    {
      commandId: CommandId('d6150004-0b06-4615-8615-000000000004'),
      purchaseId: PurchaseId('d6150005-0b06-4615-8615-000000000005'),
      itemId: PurchaseItemId('d6150006-0b06-4615-8615-000000000006'),
      currency: 'BRL',
      productId: RETIRED_PRODUCT,
      unitId: UNIT,
    },
    {
      commandId: CommandId('d6150007-0b06-4615-8615-000000000007'),
      purchaseId: PurchaseId('d6150008-0b06-4615-8615-000000000008'),
      itemId: PurchaseItemId('d6150009-0b06-4615-8615-000000000009'),
      currency: 'BRL',
      productId: GLOBAL_PRODUCT,
      unitId: RETIRED_UNIT,
    },
    {
      commandId: CommandId('d6150010-0b06-4615-8615-000000000010'),
      purchaseId: PurchaseId('d6150011-0b06-4615-8615-000000000011'),
      itemId: PurchaseItemId('d6150012-0b06-4615-8615-000000000012'),
      currency: 'ZZZ',
      productId: GLOBAL_PRODUCT,
      unitId: UNIT,
    },
  ] as const;

  try {
    for (const fixture of cases) {
      await assert.rejects(
        purchaseUseCase(database, [fixture.purchaseId], [fixture.itemId]).execute({
          commandId: fixture.commandId,
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          transactionCurrencyCode: fixture.currency,
          items: [
            {
              productId: fixture.productId,
              quantity: exactRational(1n, 1n),
              measurementUnitId: fixture.unitId,
            },
          ],
        }),
        NotFoundError,
      );

      const persisted = await admin.query<{ count: string }>(
        `select count(*)::text as count from fridge.purchase where purchase_id = $1::uuid`,
        [fixture.purchaseId],
      );
      assert.equal(persisted.rows[0]?.count, '0');
    }
  } finally {
    await database.close();
    await admin.end();
  }
});

test('current Household membership without procurement capability cannot CreatePurchase', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const purchaseId = PurchaseId('d6160001-0b06-4616-8616-000000000001');

  try {
    await assert.rejects(
      purchaseUseCase(
        database,
        [purchaseId],
        [PurchaseItemId('d6160002-0b06-4616-8616-000000000002')],
      ).execute({
        commandId: CommandId('d6160003-0b06-4616-8616-000000000003'),
        actorPrincipalId: NO_CAP,
        householdId: HOUSEHOLD,
        transactionCurrencyCode: 'BRL',
        items: [{ productId: GLOBAL_PRODUCT, quantity: exactRational(1n, 1n), measurementUnitId: UNIT }],
      }),
      HouseholdAuthorizationError,
    );

    const persisted = await admin.query<{ count: string }>(
      `select count(*)::text as count from fridge.purchase where purchase_id = $1::uuid`,
      [purchaseId],
    );
    assert.equal(persisted.rows[0]?.count, '0');
  } finally {
    await database.close();
    await admin.end();
  }
});

test('concurrent first-use retries of the same CreatePurchase command commit exactly one Purchase and replay one result', async () => {
  const databaseA = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const databaseB = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('d6170001-0b06-4617-8617-000000000001');
  const purchaseA = PurchaseId('d6170002-0b06-4617-8617-000000000002');
  const purchaseB = PurchaseId('d6170003-0b06-4617-8617-000000000003');
  const itemA = PurchaseItemId('d6170004-0b06-4617-8617-000000000004');
  const itemB = PurchaseItemId('d6170005-0b06-4617-8617-000000000005');
  const input = {
    commandId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    transactionCurrencyCode: 'BRL',
    items: [{ productId: GLOBAL_PRODUCT, quantity: exactRational(7n, 3n), measurementUnitId: UNIT }],
  } as const;

  try {
    const [left, right] = await Promise.all([
      purchaseUseCase(databaseA, [purchaseA], [itemA]).execute(input),
      purchaseUseCase(databaseB, [purchaseB], [itemB]).execute(input),
    ]);

    assert.deepEqual(left, right);
    const count = await admin.query<{ purchase_count: string; item_count: string; command_count: string }>(
      `select
         (select count(*) from fridge.purchase where purchase_id in ($1::uuid, $2::uuid))::text as purchase_count,
         (select count(*) from fridge.purchase_item where purchase_item_id in ($3::uuid, $4::uuid))::text as item_count,
         (select count(*) from fridge.household_purchase_create_command where household_id = $5::uuid and command_id = $6::uuid)::text as command_count`,
      [purchaseA, purchaseB, itemA, itemB, HOUSEHOLD, commandId],
    );
    assert.deepEqual(count.rows[0], { purchase_count: '1', item_count: '1', command_count: '1' });
  } finally {
    await databaseA.close();
    await databaseB.close();
    await admin.end();
  }
});
